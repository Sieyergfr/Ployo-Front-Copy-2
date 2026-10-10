import "server-only";
import QRCode from "qrcode";

/** Pfad aus public/logo_square_brand.svg (viewBox 0 0 100 100). */
const PLOYO_LOGO_PATH =
  "M72 0C87.464 0 100 12.536 100 28V72C100 87.464 87.464 100 72 100H28C12.536 100 6.44299e-08 87.464 0 72V28C0 12.536 12.536 6.4426e-08 28 0H72ZM76.2539 71.5332C80.1931 64.7292 82.8067 51.3359 61.75 52.1953C40.6935 53.055 26.1183 68.668 21.4629 76.3672C20.3886 78.3368 20.4965 81.6319 29.5205 79.0537C33.4597 78.3375 44.3465 77.3348 56.3789 79.0537C68.4112 80.7725 74.6424 74.7561 76.2539 71.5332ZM50.0068 21C42.2936 21 36.0412 27.2527 36.041 34.9658C36.041 42.6791 42.2935 48.9326 50.0068 48.9326C57.7201 48.9326 63.9727 42.6791 63.9727 34.9658C63.9724 27.2527 57.72 21 50.0068 21Z";

/** Anteil der QR-Kantenlänge (ohne Rand) für das weiße Feld bzw. das Logo darin. */
const LOGO_BACKDROP_RATIO = 0.26;
const LOGO_RATIO = 0.2;

/**
 * SVG-Markup des Stempel-QR-Codes mit dem Ployo-Logo in der Mitte.
 * Fehlerkorrektur "H" (bis ~30 % der Module rekonstruierbar): das weiße
 * Logofeld verdeckt rund 7 % der Fläche, es bleibt also reichlich Reserve
 * für verschmutzte/zerknitterte Ausdrucke.
 */
export async function renderClockQrSvg(payload: string): Promise<string> {
  const margin = 1;
  const svg = await QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "H", margin });
  const viewBox = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);

  if (!viewBox) return svg;

  const size = Number(viewBox[1]);
  const modules = size - margin * 2;
  const backdrop = modules * LOGO_BACKDROP_RATIO;
  const logo = modules * LOGO_RATIO;
  const backdropAt = (size - backdrop) / 2;
  const logoAt = (size - logo) / 2;
  const overlay =
    `<g shape-rendering="geometricPrecision">` +
    `<rect x="${backdropAt}" y="${backdropAt}" width="${backdrop}" height="${backdrop}" rx="${backdrop * 0.22}" fill="#ffffff"/>` +
    `<path transform="translate(${logoAt} ${logoAt}) scale(${logo / 100})" fill="#0D0D0D" d="${PLOYO_LOGO_PATH}"/>` +
    `</g>`;

  return svg.replace(/<\/svg>\s*$/, `${overlay}</svg>`);
}
