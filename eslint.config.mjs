import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Module boundaries. NOTE: eslint flat-config does NOT merge no-restricted-imports
  // across config objects — for a given file the LAST matching object wins. So each
  // block below restates the FULL pattern set that applies to its file scope.
  //
  // Base (all files): lib/crm/internal and lib/wms/internal are private — import
  // from the corresponding /public surface instead.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/crm/internal/*", "**/lib/crm/internal/*"],
              message: "Import from @/lib/crm/public instead — lib/crm/internal is private.",
            },
            {
              group: ["@/lib/wms/internal/*", "**/lib/wms/internal/*"],
              message: "Import from @/lib/wms/public instead — lib/wms/internal is private.",
            },
          ],
        },
      ],
    },
  },
  // CRM module's own files may use lib/crm/internal, but still not lib/wms/internal.
  {
    files: ["lib/crm/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/wms/internal/*", "**/lib/wms/internal/*"],
              message: "Import from @/lib/wms/public instead — lib/wms/internal is private.",
            },
          ],
        },
      ],
    },
  },
  // WMS core (lib/wms) must be extractable: zero imports of host/CRM/app code.
  // Dependency direction is host → wms only. It may use its OWN internal; the
  // one allowed bridge is the generated Prisma *types* (not banned here).
  // See docs/design/2026-05-22-wms-module-seam.md.
  {
    files: ["lib/wms/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db", "**/lib/db"],
              message: "WMS core must not import the host db singleton — the client is injected (DbClientPort).",
            },
            {
              group: ["@/lib/crm/*", "**/lib/crm/*"],
              message: "WMS core must not import CRM. Stock is host-agnostic.",
            },
            {
              group: ["@/app/actions/*", "**/app/actions/*", "@/components/*", "**/components/*"],
              message: "WMS core must not import host app/actions/components. Dependency direction is host → wms only.",
            },
            {
              group: ["@/lib/wms-host", "@/lib/wms-host/*", "**/lib/wms-host/*"],
              message: "WMS core must not import its host adapter — the adapter wires the core, not vice versa.",
            },
          ],
        },
      ],
    },
  },
  // Programmatic navigation must go through useProgressRouter() so the global
  // NavigationProgress bar fires. Ban raw router.push/replace everywhere; the
  // provider (which owns the real router) is exempted below. router.refresh/
  // back/forward/prefetch are unaffected.
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='router'][callee.property.name=/^(push|replace)$/]",
          message:
            "Use useProgressRouter() from @/components/shared/NavigationProgressProvider instead of router.push/replace, so the global NavigationProgress bar fires. (router.refresh/back/forward are fine.)",
        },
      ],
    },
  },
  // The provider owns the real router and is the one place raw push/replace
  // is allowed.
  {
    files: ["components/shared/NavigationProgressProvider.tsx"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
