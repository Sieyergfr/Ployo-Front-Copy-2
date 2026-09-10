import type { Metadata, Viewport } from "next";
import { CookieConsent } from "@/components/CookieConsent";
import { ToastProvider } from "@/components/Toasts";
import { UniversalPopupProvider } from "@/components/UniversalPopup";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { inter, jetbrainsMono, spaceGrotesk } from "./fonts";

// Gleiche Quelle wie app/robots.ts/app/sitemap.ts — einzige Stelle, die die
// Produktions-URL kennen muss.
const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const description =
  "Ployo – die digitale Personalakte für kleine und mittlere Unternehmen: Mitarbeiterverwaltung, Schichtplanung, Urlaub und Dokumente an einem Ort.";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Ployo",
    template: "Ployo | %s",
  },
  description,
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Ployo",
    description,
    url: "/",
    siteName: "Ployo",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Ployo" }],
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ployo",
    description,
    images: ["/og-image.png"],
  },
};

// Deprecated in `metadata` seit Next 14 (siehe
// node_modules/next/dist/docs/.../generate-viewport.md) — themeColor gehört
// seither in den eigenen `viewport`-Export.
export const viewport: Viewport = {
  themeColor: "#0D0D0D",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html
      lang={locale}
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            <UniversalPopupProvider>{children}</UniversalPopupProvider>
          </ToastProvider>
          <CookieConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
