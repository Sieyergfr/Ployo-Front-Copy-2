import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Lädt DATABASE_URL etc. aus .env für Tests, die (wie das DB-gestützte
// Rate-Limit) eine echte Verbindung brauchen.
config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

// Die .env zeigt auf die Live-Datenbank. Am 10.10.2026 hat ein Testlauf
// dagegen alle echten Nutzer gelöscht. DB-gestützte Tests deshalb nur gegen
// eine eigene Test-DB, z.B.:
//   DATABASE_URL=postgresql://…/ployo_test npx vitest run
const LIVE_DATABASE_NAMES = new Set(["ployo"]);
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (LIVE_DATABASE_NAMES.has(databaseName)) {
    throw new Error(
      `Tests verweigert: DATABASE_URL zeigt auf die Live-Datenbank "${databaseName}". ` +
        "Bitte DATABASE_URL auf eine separate Test-Datenbank setzen.",
    );
  }
}
