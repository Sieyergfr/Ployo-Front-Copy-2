import { config } from "dotenv";
import path from "node:path";

config({ path: path.join(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { E2E_TENANT_SLUG, E2E_USER_EMAIL } from "./fixture";

export default async function globalTeardown() {
  const prisma = new PrismaClient();

  try {
    await prisma.tenant.deleteMany({ where: { slug: E2E_TENANT_SLUG } });
    await prisma.user.deleteMany({ where: { email: E2E_USER_EMAIL } });
    console.log("[e2e] Test-Fixtures entfernt.");
  } finally {
    await prisma.$disconnect();
  }
}
