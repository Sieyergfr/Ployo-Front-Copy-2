import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { generateAppleClientSecret } from "@/lib/apple-client-secret";
import {
  isEmailConfigured,
  sendChangeEmailConfirmationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { revokeProviderToken } from "@/lib/oauth-revocation";
import {
  assertNoOrphanedTenantOwnership,
  unlinkAndCleanupBeforeUserDeletion,
} from "@/lib/user-deletion-lifecycle";

const DEV_FALLBACK_SECRET = "development-only-change-this-secret-before-production";

// Gleiches Muster wie die client- und serverseitigen E-Mail-Checks in
// lib/tenants.ts und lib/settings-service.ts (normalizeEmail).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isProductionRuntime =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build";

if (
  isProductionRuntime &&
  (!process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET === DEV_FALLBACK_SECRET)
) {
  throw new Error(
    "BETTER_AUTH_SECRET ist nicht gesetzt (oder steht noch auf dem Entwicklungswert). " +
      "Bitte ein starkes Secret mit mindestens 32 Zeichen konfigurieren.",
  );
}

if (isProductionRuntime && !process.env.BETTER_AUTH_URL) {
  throw new Error(
    "BETTER_AUTH_URL ist nicht gesetzt. Bitte die öffentliche https-URL der Anwendung konfigurieren.",
  );
}

// Zusätzliche LAN-Adressen (Tests auf Mobilgeräten) über DEV_LAN_ORIGINS,
// damit keine persönlichen IPs im Repository stehen.
const developmentOrigins =
  process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        ...(process.env.DEV_LAN_ORIGINS?.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean) ?? []),
      ]
    : [];

const configuredTrustedOrigins =
  process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

/**
 * Social-Login legt von sich aus **kein** Konto mehr an: `disableImplicitSignUp`
 * lässt einen OAuth-Rücksprung nur dann registrieren, wenn der Client den Flow
 * ausdrücklich mit `requestSignUp: true` gestartet hat. Für ein bereits
 * vorhandenes Konto ändert sich nichts — Anmeldung und Verknüpfung des
 * Providers laufen unverändert (siehe handleOAuthUserInfo in better-auth).
 *
 * Die Mobile-App sendet das Flag bewusst nie: dort entstehen Zugänge
 * ausschließlich über die Einladung des Betriebs, nicht über "Mit Google
 * anmelden". Die Web-Anmeldemaske (components/auth/LoginForm.tsx) sendet es
 * weiterhin, damit sich die Registrierung über den Browser nicht mit ändert.
 */
const googleProvider =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          disableImplicitSignUp: true,
        },
      }
    : {};

const appleProvider =
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY
    ? {
        apple: async () => ({
          clientId: process.env.APPLE_CLIENT_ID!,
          clientSecret: await generateAppleClientSecret({
            clientId: process.env.APPLE_CLIENT_ID!,
            teamId: process.env.APPLE_TEAM_ID!,
            keyId: process.env.APPLE_KEY_ID!,
            privateKey: process.env.APPLE_PRIVATE_KEY!,
          }),
          appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER,
          disableImplicitSignUp: true,
        }),
      }
    : {};

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? DEV_FALLBACK_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: [
    ...developmentOrigins,
    "https://appleid.apple.com",
    // Deep-Link-Schema der Mobile-App (Expo `app.json` -> expo.scheme).
    // Muss bei Änderung des Schemas hier mitgezogen werden.
    "ployo://",
    // Expo Go im Entwicklungsbetrieb sendet z. B. "exp://192.168.x.x:8081"
    // als Origin. Das expo()-Plugin würde "exp://" selbst nur unter
    // NODE_ENV=development automatisch vertrauen — dieses Deployment läuft
    // aber über `next start`, das NODE_ENV unabhängig von der Umgebung fest
    // auf "production" setzt, weshalb dieser Automatismus hier nie greift.
    // Explizit + unconditional statt env-abhängig: ein Browser kann einen
    // Origin-Header mit einem Nicht-http(s)-Schema wie "exp://" grundsätzlich
    // nie gültig setzen (das ist allein der Netzwerk-Stack des jeweiligen
    // Clients), weshalb dieser Eintrag kein CSRF-Risiko für die Web-App
    // öffnet — nur echte Expo-Go-Clients können ihn je senden.
    "exp://",
    ...configuredTrustedOrigins,
  ],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 5 },
      // Token-Einlösung: fiel bisher auf das generische 60-Requests/60s-Limit
      // zurück (Sicherheitsaudit Teil 2.5) — Token-Entropie macht das
      // unkritisch, aber ein eigenes, engeres Limit passt zum Muster der
      // übrigen Token-verbrauchenden Endpunkte hier.
      "/reset-password": { window: 300, max: 5 },
      "/send-verification-email": { window: 300, max: 5 },
      // TOTP/Backup-Code-Verifizierung: 6-stelliger Code bzw. Backup-Code
      // ist brute-forcebar unter dem generischen 60-Requests/60s-Limit.
      "/two-factor/verify-totp": { window: 300, max: 5 },
      "/two-factor/verify-backup-code": { window: 300, max: 5 },
    },
  },
  // Explizit statt implizit auf SDK-Defaults zu vertrauen: 7 Tage Sitzungsdauer,
  // täglicher Refresh. Cookie-Cache bewusst kurz (60s, vorher 5 Minuten) statt
  // ganz deaktiviert: ein Session-Widerruf/Passwortwechsel kann so bis zu 60s
  // verzögert wirken (der Cache antwortet dann noch aus dem signierten
  // Cookie, ohne die DB erneut zu lesen) — ein bewusst akzeptiertes,
  // dokumentiertes Restfenster statt eines DB-Reads bei jedem Request
  // (Audit-Finding M09).
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },
  advanced: {
    useSecureCookies: isProductionRuntime,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProductionRuntime,
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      // Ohne diesen Hook kannte der generische SDK-Endpunkt weder die
      // Sole-Owner-Sperre noch die App-eigenen Aufräumschritte noch den
      // Provider-Token-Widerruf (Audit-Finding M07) — alle drei laufen jetzt
      // auch hier, genau wie im eigenen Account-Service
      // (lib/account-service.ts `deleteUserAccessImmediately`). Der frühere
      // Zirkelbezug (lib/oauth-revocation.ts importierte
      // `generateAppleClientSecret` aus `@/lib/auth`) ist aufgelöst: die
      // Funktion liegt jetzt in lib/apple-client-secret.ts, einem eigenen
      // blattförmigen Modul ohne Import von `@/lib/auth`.
      //
      // Kein gemeinsamer Transaktionsrahmen mit dem eigentlichen
      // `prisma.user.delete()` (das führt better-auth selbst NACH diesem Hook
      // aus, außerhalb unserer Kontrolle) — ein Fehler hier bricht die
      // Löschung zwar ab (better-auth wirft weiter), aber es gibt kein
      // atomares Rollback über beide Schritte hinweg. Bekannte, vom
      // SDK-Hook-Modell vorgegebene Grenze.
      beforeDelete: async (user) => {
        await assertNoOrphanedTenantOwnership(user.id);

        const accounts = await prisma.account.findMany({
          where: { userId: user.id },
          select: { providerId: true, accessToken: true, refreshToken: true },
        });
        await Promise.allSettled(accounts.map((account) => revokeProviderToken(account)));

        await unlinkAndCleanupBeforeUserDeletion(user.id);
      },
    },
    changeEmail: {
      enabled: true,
      // Bestätigungslink geht an die ALTE Adresse (Schutz gegen Account-
      // Übernahme über eine kompromittierte neue Adresse). Nutzt die
      // gleiche requestType-Logik wie die Registrierungsverifizierung.
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendChangeEmailConfirmationEmail({ to: user.email, newEmail, url });
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    // Verifizierung wird erst erzwungen, sobald ein Mail-Versand konfiguriert
    // ist – sonst würden sich Nutzer dauerhaft aussperren.
    requireEmailVerification: isEmailConfigured(),
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, url });
    },
  },
  emailVerification: {
    sendOnSignUp: isEmailConfigured(),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, url });
    },
  },
  socialProviders: {
    ...googleProvider,
    ...appleProvider,
  },
  // Die RegisterForm erzwingt bereits Vorname/Nachname und die AGB-Checkbox
  // im Browser – dieser Hook spiegelt beide Regeln serverseitig, damit ein
  // direkter Aufruf von /sign-up/email sie nicht umgehen kann. Zusätzlich
  // wird hier — sofern `terms: true` im Request-Body steht — der Zeitpunkt
  // der Zustimmung persistiert (Audit-Trail für Compliance-Zwecke, siehe
  // `User.termsAcceptedAt`). Sign-ups über Social-Provider haben kein
  // `terms`-Feld im Body und bleiben bewusst unangetastet (kein AGB-Flow
  // dort).
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          const trimmedName = typeof user.name === "string" ? user.name.trim() : "";
          if (!trimmedName) {
            throw new APIError("BAD_REQUEST", {
              message: "Name ist erforderlich.",
            });
          }

          const termsAccepted = context?.body?.terms === true;

          if (trimmedName !== user.name || termsAccepted) {
            return {
              data: {
                ...user,
                name: trimmedName,
                ...(termsAccepted ? { termsAcceptedAt: new Date() } : {}),
              },
            };
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
        if (!EMAIL_PATTERN.test(email)) {
          throw new APIError("BAD_REQUEST", {
            message: "Bitte eine gültige E-Mail-Adresse angeben.",
          });
        }
      }
      if (ctx.path === "/sign-up/email") {
        if (ctx.body?.terms !== true) {
          throw new APIError("BAD_REQUEST", {
            message: "Den Nutzungsbedingungen muss zugestimmt werden.",
          });
        }

        // Bewusste Abkehr vom better-auth-Standard: dort antwortet
        // /sign-up/email bei einer bereits vergebenen Adresse mit Erfolg
        // (Schutz gegen User-Enumeration), legt aber weder ein Konto an noch
        // verschickt eine Verifizierungsmail — Registrierende landeten damit
        // auf /confirm und warteten vergeblich. Produktentscheidung: die
        // verstaendliche Fehlermeldung wiegt hier schwerer als der
        // Enumerations-Schutz. Geprueft wird case-insensitiv, weil
        // `User.email` zwar @unique ist, Postgres aber Gross- und
        // Kleinschreibung unterscheidet.
        const email =
          typeof ctx.body?.email === "string" ? ctx.body.email.trim() : "";

        if (email) {
          const existing = await prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: { id: true },
          });

          if (existing) {
            throw new APIError("UNPROCESSABLE_ENTITY", {
              message: "Es besteht bereits ein Konto mit dieser E-Mail-Adresse.",
              code: "USER_ALREADY_EXISTS",
            });
          }
        }
      }
    }),
  },
  // nextCookies() muss letztes Plugin bleiben, damit Set-Cookie aus Server
  // Actions in die Next-Cookies übernommen wird.
  plugins: [
    twoFactor({
      issuer: "Ployo",
      // Konten, die ausschliesslich ueber Apple/Google angelegt wurden, haben
      // nie ein Passwort gesetzt (kein "credential"-Account). Ohne dieses Flag
      // verlangt enable/disable immer ein Passwort und blockiert 2FA fuer sie
      // vollstaendig (App-Store-Review-Checkliste.md). better-auth prueft
      // shouldRequirePassword() intern: nur wer tatsaechlich ein Passwort hat,
      // muss es weiterhin bestaetigen.
      allowPasswordless: true,
    }),
    // Erlaubt der Mobile-App (kein Browser, keine "trusted origin" im
    // klassischen Sinn), sich über das App-Schema zu authentifizieren:
    // schreibt den expo-origin-Header auf origin um (Origin-Check oben)
    // und hängt bei OAuth/Magic-Link/Verify-Redirects das Session-Cookie
    // an den Deep Link an, damit der native Client es abgreifen kann.
    expo(),
    nextCookies(),
  ],
});
