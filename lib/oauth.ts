import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getSetting } from "@/lib/settings";

/**
 * Вход через российские ИС (Яндекс ID, VK ID) — разрешённые способы
 * авторизации по ч. 10 ст. 8 149-ФЗ. Провайдер активен, только когда его
 * client_id задан в /admin/settings/integrations (или env-фолбэком) —
 * до этого кнопки на /login не рендерятся.
 *
 * Redirect URI для регистрации приложений у провайдеров:
 *   Яндекс:  {NEXT_PUBLIC_APP_URL}/api/auth/oauth/yandex/callback
 *   VK ID:   {NEXT_PUBLIC_APP_URL}/api/auth/oauth/vk/callback
 */

export type OAuthProvider = "yandex" | "vk";

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["yandex", "vk"];

export function isOAuthProvider(v: string): v is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(v);
}

/** Нормализованный профиль от любого провайдера. */
export interface OAuthProfile {
  providerUserId: string;
  /** Подтверждённый провайдером email (Яндекс — default_email). */
  email: string | null;
  /** Телефон как отдал провайдер (нормализация — на вызывающей стороне). */
  phone: string | null;
  name: string;
}

/** Куки, живущие один round-trip авторизации (CSRF state + PKCE verifier). */
export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_VERIFIER_COOKIE = "oauth_verifier";
export const OAUTH_COOKIE_MAX_AGE = 10 * 60; // секунд — лимит жизни кода у провайдеров

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(provider: OAuthProvider): string {
  return `${appUrl()}/api/auth/oauth/${provider}/callback`;
}

async function clientId(provider: OAuthProvider): Promise<string | null> {
  return getSetting(provider === "yandex" ? "YANDEX_OAUTH_CLIENT_ID" : "VKID_CLIENT_ID");
}

/** Провайдеры, у которых задан client_id — только они показываются в UI. */
export async function enabledOAuthProviders(): Promise<OAuthProvider[]> {
  const out: OAuthProvider[] = [];
  for (const p of OAUTH_PROVIDERS) {
    if (await clientId(p)) out.push(p);
  }
  return out;
}

export interface OAuthStart {
  authorizeUrl: string;
  state: string;
  /** PKCE code_verifier — есть только у VK ID. */
  verifier: string | null;
}

/** Собирает URL авторизации + одноразовые значения для кук. */
export async function buildAuthorizeUrl(provider: OAuthProvider): Promise<OAuthStart | null> {
  const id = await clientId(provider);
  if (!id) return null;

  const state = b64url(randomBytes(24));

  if (provider === "yandex") {
    const u = new URL("https://oauth.yandex.ru/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", id);
    u.searchParams.set("redirect_uri", redirectUri("yandex"));
    u.searchParams.set("state", state);
    return { authorizeUrl: u.toString(), state, verifier: null };
  }

  // VK ID — OAuth 2.1, PKCE обязателен.
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const u = new URL("https://id.vk.ru/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redirectUri("vk"));
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", "email phone");
  return { authorizeUrl: u.toString(), state, verifier };
}

interface CallbackParams {
  code: string;
  /** device_id из callback — нужен только VK ID при обмене кода. */
  deviceId: string | null;
  state: string;
  verifier: string | null;
}

async function fetchJson(input: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(input, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof data.error_description === "string" ? data.error_description : JSON.stringify(data);
    throw new Error(`${input.split("?")[0]} → HTTP ${res.status}: ${detail}`);
  }
  return data;
}

async function yandexProfile(params: CallbackParams, id: string): Promise<OAuthProfile> {
  const secret = await getSetting("YANDEX_OAUTH_CLIENT_SECRET");
  if (!secret) throw new Error("YANDEX_OAUTH_CLIENT_SECRET не задан");

  const token = await fetchJson("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: id,
      client_secret: secret,
    }),
  });
  const accessToken = token.access_token as string;

  const info = await fetchJson("https://login.yandex.ru/info?format=json", {
    headers: { Authorization: `OAuth ${accessToken}` },
  });

  const phone =
    typeof info.default_phone === "object" && info.default_phone !== null
      ? ((info.default_phone as Record<string, unknown>).number as string | undefined) ?? null
      : null;

  return {
    providerUserId: String(info.id),
    email: typeof info.default_email === "string" ? info.default_email.toLowerCase() : null,
    phone,
    name:
      (typeof info.real_name === "string" && info.real_name) ||
      [info.first_name, info.last_name].filter(Boolean).join(" ") ||
      "Пользователь Яндекса",
  };
}

async function vkProfile(params: CallbackParams, id: string): Promise<OAuthProfile> {
  if (!params.verifier) throw new Error("PKCE verifier отсутствует (кука истекла)");
  if (!params.deviceId) throw new Error("device_id отсутствует в callback VK ID");

  const token = await fetchJson("https://id.vk.ru/oauth2/auth", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      code_verifier: params.verifier,
      client_id: id,
      device_id: params.deviceId,
      redirect_uri: redirectUri("vk"),
      state: params.state,
    }),
  });
  const accessToken = token.access_token as string;

  const info = await fetchJson("https://id.vk.ru/oauth2/user_info", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, access_token: accessToken }),
  });
  const user = (info.user ?? {}) as Record<string, unknown>;

  return {
    providerUserId: String(user.user_id ?? token.user_id),
    email: typeof user.email === "string" && user.email ? user.email.toLowerCase() : null,
    phone: typeof user.phone === "string" && user.phone ? user.phone : null,
    name: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Пользователь VK",
  };
}

/** Обмен кода на профиль. Бросает Error с человекочитаемой причиной. */
export async function fetchOAuthProfile(
  provider: OAuthProvider,
  params: CallbackParams,
): Promise<OAuthProfile> {
  const id = await clientId(provider);
  if (!id) throw new Error(`Провайдер ${provider} не настроен`);
  return provider === "yandex" ? yandexProfile(params, id) : vkProfile(params, id);
}
