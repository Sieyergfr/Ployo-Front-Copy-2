import "server-only";

import { generateAppleClientSecret } from "@/lib/auth";
import { logger } from "@/lib/logger";

type OAuthAccount = {
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
};

async function postRevoke(provider: string, url: string, body: URLSearchParams) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      logger.warn(`${provider}-Token-Widerruf fehlgeschlagen.`, { status: response.status });
    }
  } catch (error) {
    logger.warn(`${provider}-Token-Widerruf fehlgeschlagen.`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Widerruft ein Social-Login-Token beim Provider, bevor die lokale
 * `Account`-Zeile gelöscht wird (s. lib/account-service.ts
 * `deleteUserAccessImmediately`). Best-effort: ein nicht erreichbarer
 * Provider oder ein bereits abgelaufenes Token dürfen die eigentliche
 * Zugangslöschung nicht blockieren — lokal wird in jedem Fall gelöscht,
 * unabhängig vom Ausgang hier.
 */
export async function revokeProviderToken(account: OAuthAccount) {
  const token = account.refreshToken ?? account.accessToken;

  if (!token) {
    return;
  }

  if (account.providerId === "google") {
    await postRevoke(
      "Google",
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      new URLSearchParams(),
    );
    return;
  }

  if (account.providerId === "apple") {
    const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = process.env;

    if (!APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
      return;
    }

    try {
      const clientSecret = await generateAppleClientSecret({
        clientId: APPLE_CLIENT_ID,
        teamId: APPLE_TEAM_ID,
        keyId: APPLE_KEY_ID,
        privateKey: APPLE_PRIVATE_KEY,
      });

      await postRevoke(
        "Apple",
        "https://appleid.apple.com/auth/revoke",
        new URLSearchParams({
          client_id: APPLE_CLIENT_ID,
          client_secret: clientSecret,
          token,
          token_type_hint: account.refreshToken ? "refresh_token" : "access_token",
        }),
      );
    } catch (error) {
      logger.warn("Apple-Client-Secret für Token-Widerruf konnte nicht erzeugt werden.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
