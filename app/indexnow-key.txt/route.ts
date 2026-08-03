import { getSetting } from "@/lib/settings";

/**
 * Файл ключа IndexNow. Поисковик, получив пинг, сверяет ключ с содержимым
 * этого URL (мы передаём его как keyLocation). Пока ключ не задан в
 * настройках — честный 404: протокол не настроен.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const key = (await getSetting("INDEXNOW_KEY"))?.trim();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
