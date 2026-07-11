import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The lib/wms-host → lib/db import chain constructs the Prisma client at
    // module load. Tests never run a query against it (they inject the fake
    // DbClientPort), but the constructor needs a datasource URL to exist.
    env: { DATABASE_URL: "postgresql://vitest:vitest@localhost:5432/never-connected" },
  },
});
