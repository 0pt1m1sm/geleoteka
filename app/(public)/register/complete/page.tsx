export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OAUTH_PENDING_COOKIE, verifyPendingProfile } from "@/lib/oauth-login";
import { OAuthCompleteForm } from "@/components/shared/OAuthCompleteForm";

/**
 * Дозаполнение регистрации после входа через Яндекс/VK: провайдер не отдал
 * телефон и/или email — просим только недостающее. Профиль провайдера лежит
 * в подписанной куке, сюда без неё не попасть.
 */
export default async function RegisterCompletePage(): Promise<React.ReactElement> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OAUTH_PENDING_COOKIE)?.value;
  const pending = token ? verifyPendingProfile(token) : null;
  if (!pending) redirect("/login");

  const { profile, provider } = pending;
  return (
    <OAuthCompleteForm
      providerLabel={provider === "yandex" ? "Яндекс" : "VK"}
      name={profile.name}
      knownEmail={profile.email}
      knownPhone={profile.phone}
    />
  );
}
