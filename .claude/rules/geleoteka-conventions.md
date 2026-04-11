# Geleoteka — Coding Conventions

## Prisma Type Pattern

Prisma generates to `app/generated/prisma/` with `@ts-nocheck`. Results lose type inference through the `db` singleton. Use explicit type assertions:

```tsx
// ❌ Won't compile — implicit any
const parts = await db.part.findMany();
parts.map(p => p.name); // error: p is any

// ✅ Explicit interface or inline cast
const parts = await db.part.findMany({ select: { id: true, name: true } });
parts.map((p: { id: string; name: string }) => p.name);

// ✅ Or cast entire result
const part = await db.part.findUnique({ where: { id } });
const p = part as Record<string, unknown>;
const name = p.name as string;
```

## useSyncExternalStore for localStorage

**NEVER use `useState` + `useEffect` for localStorage.** React 19 strict mode blocks `setState` in effects. Use `useSyncExternalStore` with **cached snapshots**:

```tsx
// ❌ Infinite loop — creates new object every call
function getSnapshot() {
  return JSON.parse(localStorage.getItem("key") || "{}");
}

// ✅ Cache by raw string — same reference when unchanged
let cachedRaw: string | null = null;
let cachedValue: MyType = INITIAL;
function getSnapshot(): MyType {
  const raw = localStorage.getItem("key");
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = raw ? JSON.parse(raw) : INITIAL;
  }
  return cachedValue;
}
```

## CSS Design System

All styles via CSS variables in `globals.css`. Component classes: `.btn`, `.btn-primary`, `.btn-secondary`, `.card`, `.card-hover`, `.input`, `.badge`, `.alert-error`, `.alert-success`.

- **Colors:** `var(--color-accent)`, `var(--background)`, `var(--foreground)`, `var(--card)`, `var(--border)`
- **No hardcoded hex** — always use CSS variables
- **Border radius:** sharp (2-8px via `var(--radius-*)`)
- **Light theme:** triggered by `html.light` class

## Auth in Pages

```tsx
// Public page — no auth check needed
export default async function PublicPage() { ... }

// Portal page — redirect if not logged in
const session = await getSession();
if (!session) redirect("/login");

// Admin page — redirect if not admin/manager
const session = await getSession();
if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
  redirect("/login");
}
```

**IMPORTANT:** Don't use `requireRole()` in page components — it throws and causes unhandled errors. Use `getSession()` + `redirect()` instead.

## Server Actions

All in `app/actions/*.ts`. For `useActionState`-compatible actions, first param is `_prevState`:

```tsx
export async function myAction(
  _prevState: { error: string | null } | null,
  formData: FormData
): Promise<{ error: string | null }> { ... }
```

## File Naming

- Pages: `page.tsx` in route directories
- Components: PascalCase (`StatusChanger.tsx`)
- Actions: kebab-case (`part-orders.ts`)
- Lib: kebab-case (`models-data.ts`)
