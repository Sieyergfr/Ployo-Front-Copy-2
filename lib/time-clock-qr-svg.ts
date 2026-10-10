import "server-only";
import QRCode from "qrcode";

/** SVG-Markup des Stempel-QR-Codes — Fehlerkorrektur "M" verkraftet leicht verschmutzte/zerknitterte Ausdrucke. */
export function renderClockQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
}
