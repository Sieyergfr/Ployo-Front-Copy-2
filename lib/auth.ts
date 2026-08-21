import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { importPKCS8, SignJWT } from "jose";
import {
  isEmailConfigured,
  sendChangeEmailConfirmationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";

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

async function generateAppleClientSecret({
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

const googleProvider =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
      "/send-verification-email": { window: 300, max: 5 },
      // TOTP/Backup-Code-Verifizierung: 6-stelliger Code bzw. Backup-Code
      // ist brute-forcebar unter dem generischen 60-Requests/60s-Limit.
      "/two-factor/verify-totp": { window: 300, max: 5 },
      "/two-factor/verify-backup-code": { window: 300, max: 5 },
    },
  },
  // Explizit statt implizit auf SDK-Defaults zu vertrauen: 7 Tage Sitzungsdauer,
  // täglicher Refresh, 5-Minuten-Cookie-Cache (weniger DB-Lookups pro Request).
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
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
      if (ctx.path === "/sign-up/email" && ctx.body?.terms !== true) {
        throw new APIError("BAD_REQUEST", {
          message: "Den Nutzungsbedingungen muss zugestimmt werden.",
        });
      }
    }),
  },
  // nextCookies() muss letztes Plugin bleiben, damit Set-Cookie aus Server
  // Actions in die Next-Cookies übernommen wird.
  plugins: [
    twoFactor({
      issuer: "Ployo",
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
