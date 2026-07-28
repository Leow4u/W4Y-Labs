import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { getSiteLocale, htmlLang } from "@/lib/site-locale";
import "./globals.css";

// Brand typography (W4Y): one sans for UI + display, one mono for code.
// Variable fonts, self-hosted by next/font — no runtime requests to Google.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Work4You",
  description: "Work4You — plataforma de agentes de IA autônomos",
};

// `lang` must match the language actually served: Chrome decides whether to
// offer its translate bar from it, screen readers pick pronunciation from it,
// and search engines index the page's language by it.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getSiteLocale();

  return (
    <html
      lang={htmlLang(locale)}
      className={`${jakarta.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
