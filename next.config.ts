import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "sharp"],
  experimental: {
    // View Transitions API — Next 16 wires <ViewTransition> + browser API for
    // page-to-page cross-fade and shared element morphs.
    // Field name verified in next/dist/server/config-shared.d.ts:687.
    viewTransition: true,
  },
};

export default nextConfig;
