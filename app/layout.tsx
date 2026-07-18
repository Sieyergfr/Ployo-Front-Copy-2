import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/Toasts";
import { UniversalPopupProvider } from "@/components/UniversalPopup";
import "./globals.css";
import { inter, jetbrainsMono, spaceGrotesk } from "./fonts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ployo",
    template: "Ployo | %s",
  },
  description: "Ployo Personalakte",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <UniversalPopupProvider>{children}</UniversalPopupProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
