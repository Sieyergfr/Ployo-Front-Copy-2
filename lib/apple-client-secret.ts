import "server-only";
import { importPKCS8, SignJWT } from "jose";

/**
 * Erzeugt frisch ein Apple-"Client-Secret" (signiertes JWT) — sowohl für den
 * regulären Apple-Login (lib/auth.ts) als auch für den Provider-Token-
 * Widerruf beim Löschen eines Kontos (lib/oauth-revocation.ts).
 *
 * Bewusst als eigenes, blattförmiges Modul ohne Import von `@/lib/auth`
 * (analog zu lib/user-deletion-lifecycle.ts, Audit-Finding M07): vorher lag
 * diese Funktion direkt in lib/auth.ts, wodurch lib/oauth-revocation.ts sie
 * nur über einen Import von `@/lib/auth` erreichen konnte — ein Import von
 * `revokeProviderToken` zurück aus lib/auth.ts hätte damit einen echten
 * Zirkelbezug erzeugt. Deshalb rief der `deleteUser.beforeDelete`-Hook des
 * generischen better-auth-SDK-Endpunkts den Provider-Token-Widerruf bisher
 * gar nicht auf.
 */
export async function generateAppleClientSecret({
  clientId,
  teamId,
  keyId,
  privateKey,
}: {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}) {
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key);
}
