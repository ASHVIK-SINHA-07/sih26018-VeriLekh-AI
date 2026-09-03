import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Land records are in Devanagari; Geist has no Devanagari coverage, so raw
// OCR text renders in this face. See docs/01_PRD.md on regional scripts.
const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari", "latin"],
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
        className={`${geistSans.variable} ${geistMono.variable} ${notoDevanagari.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
