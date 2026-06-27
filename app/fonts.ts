import localFont from "next/font/local";

export const spaceGrotesk = localFont({
  src: "../public/fonts/SpaceGrotesk-VariableFont_wght.ttf",
  variable: "--font-space-grotesk",
  display: "swap",
});

export const inter = localFont({
  src: "../public/fonts/Inter-VariableFont.ttf",
  variable: "--font-inter",
  display: "swap",
});

export const jetbrainsMono = localFont({
  src: "../public/fonts/jetBrainsMono-VariableFont.ttf",
  variable: "--font-jetbrains-mono",
  display: "swap",
});