# Project: Geleoteka

**Last Updated:** 2026-05-04

## Overview

G-Class specialist auto service platform. Three layers: public marketing site, client portal (cabinet), admin panel. Plus parts shop and rental cars module.

## Technology Stack

- **Framework:** Next.js 16.2.3 (App Router, Turbopack)
- **Language:** TypeScript (strict)
- **UI:** React 19.2, Tailwind CSS v4, CSS Variables for theming
- **Database:** PostgreSQL + Prisma 6 ORM
- **Auth:** Custom JWT in httpOnly cookies (`lib/auth.ts`)
- **State:** React Query (polling), `useSyncExternalStore` (localStorage)
- **Package Manager:** npm (`package-lock.json`)

## Directory Structure

```
app/
  (public)/    # Marketing site — SSR, SEO
  (portal)/    # Client cabinet — auth required
  (admin)/     # Manager panel — ADMIN/MANAGER role
  (cabinet)/   # Alternative portal layout
  actions/     # Server Actions (all mutations)
  api/         # API routes (auth, parts, repair-orders, slots, upload)
components/
  admin/       # Admin-specific components
  booking/     # Booking wizard (5-step)
  parts/       # Parts shop components
  portal/      # Client portal components (EstimateReview, StatusBoard)
  rentals/     # Rental car components
  shared/      # Cross-cutting (Header, Footer, ThemeToggle, etc.)
  ui/          # Reserved for shared UI primitives (currently empty)
lib/           # Shared utilities (auth, db, sms, splus, utils)
prisma/        # Schema, migrations, seed
public/images/ # Static images (hero, parts, rentals, logo)
```

## Development Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 443, HTTPS) |
| Build | `npm run build` |
| Production | `npm start` (binds to `$PORT` or 443) |
| Lint | `npm run lint` |
| DB migrate | `npx prisma migrate dev --name <name>` |
| DB generate | `npx prisma generate` |
| DB seed | `npx prisma db seed` |
| DB validate | `npx prisma validate` |

## Key Patterns

- **Prisma client** imports from `@/app/generated/prisma/client` (custom output path), NOT `@prisma/client`
- **DB singleton** at `lib/db.ts` — import as `import { db } from "@/lib/db"`
- **Auth helpers:** `getSession()` (optional), `requireAuth()` (throws), `requireRole(["ADMIN"])` (throws)
- **Dynamic pages** use `export const dynamic = "force-dynamic"` for DB queries
- **Server Actions** in `app/actions/*.ts` — all mutations via `"use server"`
- **Theme:** dark default, light via `html.light` class. Toggle saves to localStorage. Init script at `/public/theme-init.js`
- **Branding:** "Geleoteka" — gold (#d4af37) on black. NEVER use "AMG Service" or "amgservice.ru"

## Credentials (Dev)

- **Admin:** `admin@geleoteka.ru` / `admin123`
- **Client:** `client@test.ru` / `admin123`
- **DB:** `postgresql://alex@localhost:5432/geleoteka`

## Deploy

- **Hosting:** Railway (auto-deploy from GitHub `main`)
- **Repo:** `github.com/0pt1m1sm/geleoteka`
- **Start:** `next start -H 0.0.0.0 -p ${PORT:-443}`
