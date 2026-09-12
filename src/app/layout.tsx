import type { Metadata } from "next";
import { Inter, Lora, Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Gurmukhi } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
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

/**
 * Indian scripts. Land records are in Devanagari, and the interface can be
 * shown in Hindi, Marathi, Bengali or Punjabi — neither face above covers any
 * of them. These are downloaded at build time and served from this server,
 * so choosing a language never calls out to a font host.
 */
const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari", "latin"],
  display: "swap",
});
const notoBengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
  display: "swap",
});
const notoGurmukhi = Noto_Sans_Gurmukhi({
  variable: "--font-gurmukhi",
  subsets: ["gurmukhi"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("app.name"), description: t("app.description") };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale } = await getI18n();

  // `lang` is what a screen reader uses to choose its voice and
  // pronunciation — the accessibility half of offering a language at all.
  return (
    <html lang={locale}>
      <body
        className={`${lora.variable} ${inter.variable} ${notoDevanagari.variable} ${notoBengali.variable} ${notoGurmukhi.variable} antialiased`}
      >
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
