import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Providers } from "./providers";
import { LocaleProvider } from "@/components/shared/LocaleProvider";
import { tenantLocale } from "@/lib/i18n/server";
import { ThemeInit } from "@/components/shared/ThemeInit";
import { MyCarInit } from "@/components/shared/MyCarInit";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { ToastHost } from "@/components/ui/ToastHost";
import { NavigationProgress } from "@/components/shared/NavigationProgress";
import { NavigationProgressProvider } from "@/components/shared/NavigationProgressProvider";
import { SITE_URL } from "@/lib/site-url";

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

const SITE_TITLE = "Geleoteka — специализированный сервис Mercedes-Benz G-Class";
const SITE_DESCRIPTION =
  "Специализированный сервис Mercedes-Benz G-Class (Гелендваген): ремонт и ТО, оригинальные запчасти, аренда. Онлайн-запись, личный кабинет, отслеживание статуса ремонта в реальном времени.";

// generateMetadata вместо статичного экспорта: коды верификации Вебмастера и
// Search Console живут в Setting (правятся из админки без деплоя), а на этапе
// сборки БД недоступна — getSetting тихо падает в env-фолбэк и вернёт null.
export async function generateMetadata(): Promise<Metadata> {
  const { getSetting } = await import("@/lib/settings");
  const [yandex, google] = await Promise.all([
    getSetting("YANDEX_VERIFICATION"),
    getSetting("GOOGLE_SITE_VERIFICATION"),
  ]);
  return {
    ...BASE_METADATA,
    ...(yandex?.trim() || google?.trim()
      ? {
          verification: {
            ...(yandex?.trim() ? { yandex: yandex.trim() } : {}),
            ...(google?.trim() ? { google: google.trim() } : {}),
          },
        }
      : {}),
  };
}

const BASE_METADATA: Metadata = {
  // Required before any relative canonical/OG URL can resolve; without it Next
  // errors on build for URL-based metadata fields.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Geleoteka",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Гелендваген сервис",
    "ремонт Гелендвагена",
    "Mercedes-Benz G-Class сервис",
    "ремонт G-Class",
    "Gelandewagen сервис",
    "G63 AMG ремонт",
    "G500 ремонт",
    "W463 сервис",
    "ТО Mercedes G-Class",
    "запчасти Гелендваген",
    "аренда Гелендвагена",
    "автосервис Mercedes",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Geleoteka",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/images/hero/g-class-hero.jpg",
        width: 1920,
        height: 1080,
        alt: "Mercedes-Benz G-Class в сервисе Geleoteka",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/images/hero/g-class-hero.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): Promise<React.ReactElement> {
  const fontClasses = `${fontManrope.variable} ${fontMono.variable}`;
  // Настройки арендатора берутся один раз здесь и спускаются вниз: серверные
  // компоненты берут их у арендатора сами, клиентские в базу не ходят.
  const locale = await tenantLocale();
  // Язык документа — из локали арендатора, а не литералом: он важен для
  // экранных дикторов, переносов и предложения перевести страницу.
  const lang = locale.locale.split("-")[0];
  return (
    <html lang={lang} className={`${fontClasses} h-full antialiased`} suppressHydrationWarning>
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
        {/* Wraps the whole app so useProgressRouter() is available everywhere
            and the bar below can read the navigation transition's isPending. */}
        <NavigationProgressProvider>
          <ThemeInit />
          {/* MyCarInit reads useSearchParams — must be wrapped in Suspense per Next.js. */}
          <Suspense fallback={null}>
            <MyCarInit />
          </Suspense>
          {/* Top-of-viewport progress bar — reads useSearchParams so it
              must be wrapped in Suspense per Next.js App Router rules. */}
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <LocaleProvider settings={locale}>
            <Providers>{children}</Providers>
          </LocaleProvider>
          <ConfirmHost />
          <ToastHost />
        </NavigationProgressProvider>
      </body>
    </html>
  );
}
