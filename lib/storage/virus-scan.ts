import net from "node:net";
import { logger } from "@/lib/logger";

// Ubuntu-Standardpfad des `clamav-daemon`-Sockets (LocalSocket in
// /etc/clamav/clamd.conf). Läuft auf demselben Host wie die App (kein
// Docker-Netzwerk dazwischen), daher reicht ein Unix-Socket statt TCP.
const CLAMD_SOCKET_PATH = "/var/run/clamav/clamd.ctl";
const SCAN_TIMEOUT_MS = 30_000;
const CHUNK_SIZE = 64 * 1024;

/**
 * Schickt `buffer` per clamd-INSTREAM-Protokoll (Unix-Socket) an den
 * ClamAV-Daemon, statt ihn erst auf die Platte zu schreiben — vermeidet
 * Dateisystem-Rechteprobleme (clamd läuft als eigener `clamav`-User) und
 * scannt exakt die Bytes, die auch in den Storage gehen. Antwort ist
 * null-Byte-terminiert (`z`-Präfix des Kommandos).
 */
function scanViaClamd(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(CLAMD_SOCKET_PATH);
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      run();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("Virenscan-Zeitüberschreitung.")));
    }, SCAN_TIMEOUT_MS);

    socket.on("error", (error) => finish(() => reject(error)));

    socket.on("data", (data) => {
      chunks.push(data);
      const combined = Buffer.concat(chunks);
      const terminatorIndex = combined.indexOf(0);

      if (terminatorIndex !== -1) {
        finish(() => resolve(combined.subarray(0, terminatorIndex).toString("utf8")));
      }
    });

    socket.on("close", () => {
      finish(() => resolve(Buffer.concat(chunks).toString("utf8")));
    });

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");

      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
        const sizeHeader = Buffer.alloc(4);
        sizeHeader.writeUInt32BE(chunk.length, 0);
        socket.write(sizeHeader);
        socket.write(chunk);
      }

      // Chunk der Länge 0 beendet den Stream (clamd-Protokoll).
      socket.write(Buffer.alloc(4));
    });
  });
}

/**
 * Virenscan für Datei-Uploads via ClamAV, bevor sie im Objekt-Storage
 * landen. Fail-closed: Ist der Scan nicht zu bekommen (Daemon down,
 * Timeout, unerwartete Antwort), wird der Upload abgelehnt statt
 * ungescannt durchgereicht — sonst ließe sich der Scan durch einen
 * überlasteten/toten Daemon einfach umgehen.
 */
export async function assertNoVirus(buffer: Buffer, meta?: { fileName?: string }): Promise<void> {
  let response: string;

  try {
    response = await scanViaClamd(buffer);
  } catch (error) {
    logger.error("Virenscan nicht erreichbar", {
      fileName: meta?.fileName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Virenscan derzeit nicht verfügbar. Bitte versuche es später erneut.");
  }

  if (response.includes("FOUND")) {
    const signature = response.replace(/^stream:\s*/, "").replace(/\s*FOUND\s*$/, "").trim();

    logger.warn("Virenscan: Datei abgelehnt", { fileName: meta?.fileName, signature });
    throw new Error("Die Datei wurde vom Virenscan als schädlich erkannt und konnte nicht hochgeladen werden.");
  }

  if (!response.includes("OK")) {
    logger.error("Virenscan: unerwartete Antwort", { fileName: meta?.fileName, response });
    throw new Error("Virenscan derzeit nicht verfügbar. Bitte versuche es später erneut.");
  }
}
