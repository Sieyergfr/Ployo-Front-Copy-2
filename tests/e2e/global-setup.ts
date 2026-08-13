import { config } from "dotenv";
import path from "node:path";

config({ path: path.join(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import {
  E2E_TENANT_NAME,
  E2E_TENANT_SLUG,
  E2E_USER_EMAIL,
  E2E_USER_NAME,
  E2E_USER_PASSWORD,
} from "./fixture";

/**
 * "next dev" kompiliert jede Route erst beim ersten Aufruf — auf einem
 * frisch gestarteten Server kann das mehrere Sekunden dauern und lässt den
 * eigentlichen (Timeout-behafteten) Testlauf sonst gegen eine noch
 * kompilierende Route laufen. Feuert deshalb pro Route einen unauthentifizierten
 * Best-Effort-Request vorab ab, um den Compile-Schritt aus dem Timeout-Budget
 * des Tests herauszuziehen. Fehler (z. B. Redirect, Non-200) sind hier egal —
 * es geht nur ums Anstoßen der Kompilierung.
 */
async function warmUpRoutes(baseURL: string, routes: string[]) {
  for (const route of routes) {
    try {
      await fetch(`${baseURL}${route}`, { signal: AbortSignal.timeout(60_000) });
    } catch {
      // Best effort — der eigentliche Test prüft die Routen ohnehin.
    }
  }
}

/**
 * Legt einen isolierten Test-Mandanten + verifizierten Nutzer direkt in der
 * DB an (nicht über /register, um SMTP-Verifizierungsmails im Testlauf zu
 * vermeiden). Das Passwort wird mit der gleichen Hash-Funktion wie
 * better-auth gehasht, damit der normale Login-Formular-Flow funktioniert.
 */
export default async function globalSetup() {
  const prisma = new PrismaClient();

  try {
    await prisma.user.deleteMany({ where: { email: E2E_USER_EMAIL } });
    await prisma.tenant.deleteMany({ where: { slug: E2E_TENANT_SLUG } });

    const passwordHash = await hashPassword(E2E_USER_PASSWORD);

    const user = await prisma.user.create({
      data: {
        email: E2E_USER_EMAIL,
        name: E2E_USER_NAME,
        emailVerified: true,
      },
    });

    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
    });

    const tenant = await prisma.tenant.create({
      data: {
        slug: E2E_TENANT_SLUG,
        name: E2E_TENANT_NAME,
        memberships: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });

    console.log(`[e2e] Test-Fixtures angelegt: user=${user.id} tenant=${tenant.id}`);
  } finally {
    await prisma.$disconnect();
  }

  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  await warmUpRoutes(baseURL, [
    "/login",
    "/select",
    `/u/${E2E_TENANT_SLUG}`,
    `/u/${E2E_TENANT_SLUG}/employees`,
  ]);
  console.log("[e2e] Routen vorkompiliert.");
}
