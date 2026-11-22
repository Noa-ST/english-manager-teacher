import type { Metadata } from "next";
import { Be_Vietnam_Pro, Caveat, Geist_Mono, Inter, Lora } from "next/font/google";

import "./globals.css";
import { BrandThemeSync } from "@/components/shared/brand-theme-sync";

// Be Vietnam Pro: crafted specifically for Vietnamese diacritics & modern editorial headings.
const fontHeading = Be_Vietnam_Pro({
  variable: "--font-heading",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  display: "swap",
});

// Lora: authoritative academic serif for editorial titles, pull-quotes, and endorsements.
const fontSerif = Lora({
  variable: "--font-serif",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

// Caveat: handwritten script for "Learn English. Grow Together." signature.
const fontScript = Caveat({
  variable: "--font-script",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

// Inter: high-legibility body copy, tables, and form controls.
const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const fontMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "English Manager · Academic English & Mentorship",
    template: "%s · English Manager",
  },
  description:
    "Nền tảng học thuật, bản tin Podcast, thư viện tài liệu và quản lý lớp học tiếng Anh chuyên sâu.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${fontHeading.variable} ${fontSerif.variable} ${fontScript.variable} ${fontSans.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <BrandThemeSync />
        {children}
      </body>
    </html>
  );
}
