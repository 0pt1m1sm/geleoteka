import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "sharp"],
  experimental: {
    // View Transitions API — Next 16 wires <ViewTransition> + browser API for
    // page-to-page cross-fade and shared element morphs.
    // Field name verified in next/dist/server/config-shared.d.ts:687.
    viewTransition: true,
  },
  /**
   * Постоянные переезды статей.
   *
   * Две статьи про стоимость обслуживания конкурировали друг с другом в
   * выдаче и обе оставались тонкими. Слиты в одну; прежний адрес переезжает
   * НАВСЕГДА (308), чтобы накопленные ссылки и позиции достались уцелевшей
   * странице, а не превратились в 404.
   */
  async redirects() {
    return [
      {
        source: "/blog/dorog-li-gelik-v-obsluzhivanii",
        destination: "/blog/skolko-stoit-obsluzhivanie-gelendvagena",
        permanent: true,
      },
    ];
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
