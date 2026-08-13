import type { Metadata } from "next";
import { CookieConsent } from "@/components/CookieConsent";
import { ToastProvider } from "@/components/Toasts";
import { UniversalPopupProvider } from "@/components/UniversalPopup";
import "./globals.css";
import { inter, jetbrainsMono, spaceGrotesk } from "./fonts";

export const metadata: Metadata = {
  title: {
    default: "Ployo",
    template: "Ployo | %s",
  },
  description:
    "Ployo – die digitale Personalakte für kleine und mittlere Unternehmen: Mitarbeiterverwaltung, Schichtplanung, Urlaub und Dokumente an einem Ort.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <UniversalPopupProvider>{children}</UniversalPopupProvider>
        </ToastProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
