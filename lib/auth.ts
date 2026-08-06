import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { importPKCS8, SignJWT } from "jose";
import {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";

const DEV_FALLBACK_SECRET = "development-only-change-this-secret-before-production";

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
    ...configuredTrustedOrigins,
  ],
  database: prismaAdapter(prisma, {
    provider: "sqlite",
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
    },
  },
  user: {
    deleteUser: {
      enabled: true,
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
  // Muss letztes Plugin bleiben, damit Set-Cookie aus Server Actions
  // in die Next-Cookies übernommen wird.
  plugins: [nextCookies()],
});
