import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeInit } from "@/components/shared/ThemeInit";

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
}>) {
  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[var(--background)]">
        <ThemeInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
