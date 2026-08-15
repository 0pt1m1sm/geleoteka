import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "sharp"],
  experimental: {
    // View Transitions API — Next 16 wires <ViewTransition> + browser API for
    // page-to-page cross-fade and shared element morphs.
    // Field name verified in next/dist/server/config-shared.d.ts:687.
    viewTransition: true,
  },
  // Базовая гигиена (аудит 2026-08-15): реферер наружу — только origin,
  // никакого сниффинга типов и чужих iframe'ов. Полноценный CSP сознательно
  // не включён: инлайновые JSON-LD и Метрика потребуют nonce-инфраструктуру.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
