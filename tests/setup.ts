import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Lädt DATABASE_URL etc. aus .env für Tests, die (wie das DB-gestützte
// Rate-Limit) eine echte Verbindung brauchen.
config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
