import type { Metadata } from "next";
import { Inter, Lora, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

/**
 * Two faces, used for two jobs.
 *
 * Lora sets headings and the large figures — a serif reads as an official
 * register rather than a product dashboard. Inter carries body text, controls
 * and tabular data, where a neutral sans is easier to scan.
 */
const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/** Land records are in Devanagari; neither face above covers that script. */
const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Land record digitization",
  description:
    "Back-office pipeline for digitizing and validating legacy land records.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${lora.variable} ${inter.variable} ${notoDevanagari.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
