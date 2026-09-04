import { auth } from "@/lib/auth";

async function logout(request: Request) {
  // Direkt im Prozess statt per Self-Fetch auf die eigene öffentliche URL:
  // Ein Self-Fetch verlässt den Prozess über das Netzwerk und kann hinter
  // Reverse-Proxy/Hairpin-NAT-Setups mit ERR_SSL_WRONG_VERSION_NUMBER
  // scheitern (führte zu HTTP 500 auf /logout). Das Session-Cookie wird
  // vom nextCookies()-Plugin (lib/auth.ts) automatisch auf die Response
  // dieses Route Handlers geschrieben.
  await auth.api.signOut({ headers: request.headers });

  // Relatives `Location` statt `NextResponse.redirect(new URL(…, request.url))`:
  // hinter dem Reverse-Proxy ist `request.url` die Upstream-Adresse
  // (`https://localhost:3000/logout`), der Browser wurde also auf
  // `https://localhost:3000/login` geschickt — dort kommt er nicht an. Sichtbar
  // war das als "Abmelden tut nichts": die Sitzung war serverseitig beendet und
  // die Cookies gelöscht, nur die Navigation lief ins Leere, bis man von Hand
  // neu lud. Ein relativer Pfad löst der Browser gegen die aufgerufene Adresse
  // auf und trifft damit immer den richtigen Host (RFC 7231, § 7.1.2).
  return new Response(null, {
    status: 303,
    headers: { Location: "/login" },
  });
}

export async function POST(request: Request) {
  return logout(request);
}

// `konto-loeschung/page.tsx` verlinkt "Abmelden" als normalen <Link>, der
// als GET navigiert — ohne GET-Handler wäre das ein 405.
export async function GET(request: Request) {
  return logout(request);
}
