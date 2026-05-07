import type { Metadata } from "next";
import Script from "next/script";
import { Playfair_Display, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Providers } from "./providers";
import { ThemeInit } from "@/components/shared/ThemeInit";
import { MyCarInit } from "@/components/shared/MyCarInit";

const fontDisplay = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  display: "swap",
  variable: "--font-playfair-display",
});

const fontBody = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ibm-plex-sans",
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
  const fontClasses = `${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`;
  return (
    <html lang="ru" className={`${fontClasses} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* theme-init.js applies html.light or html.dark BEFORE first paint, eliminating
            FOUC for users whose OS theme differs from app default. ThemeInit (below) is the
            React-side mirror that re-applies the class on hydration if localStorage changed. */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
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
