import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertNoVirus } from "@/lib/storage/virus-scan";

// EICAR-Testdatei: von jedem Virenscanner absichtlich als "Virus" erkannt,
// ohne echten Schadcode zu enthalten — Standard für AV-Integrationstests.
const EICAR = Buffer.from(
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
);

const CLAMD_SOCKET_PATH = "/var/run/clamav/clamd.ctl";

// Läuft nur, wenn clamd lokal erreichbar ist (Produktions-/Dev-Host) — in
// der CI (GitHub Actions) ist kein ClamAV installiert, dort wird der Block
// übersprungen statt die Pipeline mit einem ECONNREFUSED zu brechen.
describe.skipIf(!existsSync(CLAMD_SOCKET_PATH))("assertNoVirus (gegen echten clamd)", () => {
  it("lässt eine unauffällige Datei durch", async () => {
    await expect(assertNoVirus(Buffer.from("Hallo Welt"))).resolves.toBeUndefined();
  });

  it("lehnt die EICAR-Testdatei ab", async () => {
    await expect(assertNoVirus(EICAR)).rejects.toThrow("vom Virenscan als schädlich erkannt");
  });
});
