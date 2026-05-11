import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Providers } from "./providers";
import { ThemeInit } from "@/components/shared/ThemeInit";
import { MyCarInit } from "@/components/shared/MyCarInit";

// Sync theme bootstrap. Must run before first paint to eliminate the
// dark-flash FOUC on light-theme reloads. `<Script strategy="beforeInteractive">`
// gives no such guarantee in Next 16 App Router (the tag can land after
// the body opens), so we inline a minimal IIFE directly in <head> via
// dangerouslySetInnerHTML — that's the canonical Next.js pattern for
// theme persistence.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"){document.documentElement.classList.add("light");}else if(t==="dark"){document.documentElement.classList.add("dark");}else if(window.matchMedia("(prefers-color-scheme: light)").matches){document.documentElement.classList.add("light");}else{document.documentElement.classList.add("dark");}}catch(e){document.documentElement.classList.add("dark");}})();`;

// Single variable family for both headings and body. The variable axis
// (200–800) covers light body weight + heavy display weight from one woff2.
const fontManrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  display: "swap",
  variable: "--font-manrope",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Geleoteka — специализированный сервис Mercedes-Benz G-Class",
    template: "%s | Geleoteka",
  },
  description:
    "Специализированный сервис Mercedes-Benz. Онлайн-запись, личный кабинет, отслеживание статуса ремонта в реальном времени.",
  keywords: [
    "Mercedes-Benz сервис",
    "ремонт Mercedes",
    "автосервис Mercedes",
    "ТО Mercedes",
  ],
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Geleoteka",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  const fontClasses = `${fontManrope.variable} ${fontMono.variable}`;
  return (
    <html lang="ru" className={`${fontClasses} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Inline theme bootstrap — applies html.light or html.dark
            BEFORE first paint. Inlining (vs external script) is required
            in Next 16 App Router; `<Script strategy="beforeInteractive">`
            can land after the body opens, producing a dark flash on
            reload for light-theme users. ThemeInit (below) re-syncs the
            class on hydration if storage changed in another tab. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--background)]">
        <ThemeInit />
        {/* MyCarInit reads useSearchParams — must be wrapped in Suspense per Next.js. */}
        <Suspense fallback={null}>
          <MyCarInit />
        </Suspense>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
