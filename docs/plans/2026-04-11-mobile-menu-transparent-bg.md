# Mobile Menu Transparent Background Fix Plan

Created: 2026-04-11
Author: aspiskov@student.42abudhabi.ae
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary

**Symptom:** Mobile menu sidebar panel appears transparent — page content visible behind it, nav links unreadable.

**Trigger:** Open hamburger menu on mobile viewport on any page with the public layout.

**Root Cause:** `app/(public)/layout.tsx:15` — The `<header>` has `backdrop-filter: blur(8px)` (from Tailwind `backdrop-blur`). Per CSS spec, `backdrop-filter` on an ancestor creates a new containing block for `position: fixed` descendants. The `MobileMenu` component renders its fixed-position panel and backdrop **inside** this header. As a result, `h-full` and `inset-0` resolve to the header's 64px height instead of the viewport. The panel background IS `#141414` and opaque — but the element is only 64px tall, so the rest of the screen has no coverage.

## Investigation

- **Browser automation confirmed:** `panel.getBoundingClientRect().height === 64`, not the viewport height.
- **Containing block chain:** `<header>` has `backdropFilter: "blur(8px)"` → creates containing block → `position: fixed` children are relative to header (64px), not viewport.
- **Additionally:** The `animate-slide-in` animation applies `transform: matrix(1,0,0,1,0,0)` to the panel itself, which ALSO creates a containing block (double-trapped).
- **The backdrop overlay** (`fixed inset-0 z-50 bg-black/60`) is also only 64px tall for the same reason.
- **All previous fix attempts** targeted background color — the wrong axis. Color was always correct; height was the real problem.

## Fix Approach

**Chosen:** Use a React portal to render the mobile menu overlay outside the header's DOM tree

**Why:** Portals escape the header's containing block entirely — the fixed positioning will use the viewport as its containing block. This is the correct React pattern for modals/overlays that need to escape ancestor layout constraints. No CSS hacks needed.

**Alternatives considered:**
- *Use `100vh`/`100dvh` instead of `h-full`* — fragile; doesn't fix the backdrop, and `100vh` has mobile browser address bar issues. The transform from `animate-slide-in` would still create a containing block for children.
- *Move `MobileMenu` outside `<header>` in layout* — works but breaks component colocation; the hamburger button should logically stay in the header.

**Files:**
- `components/shared/MobileMenu.tsx` — render overlay (backdrop + panel) via `createPortal` to `document.body`

**Strategy:** Keep the hamburger button inside the header. Only the overlay (backdrop + panel) gets portaled to `document.body`. This escapes the containing block while keeping the component API unchanged.

**Tests:** No unit test — this is a CSS layout bug. Browser automation verification is the acceptance test.

## Verification Scenario

### TS-001: Mobile Menu Covers Full Screen
**Preconditions:** Mobile viewport (375x812)

| Step | Action | Expected Result (after fix) |
|------|--------|-----------------------------|
| 1 | Navigate to production URL | Homepage loads |
| 2 | Click hamburger menu button | Slide-out panel covers full viewport height with solid background |
| 3 | Verify panel background is opaque | No page content visible behind panel, all nav links readable |
| 4 | Verify backdrop covers full screen | Dark semi-transparent overlay behind panel, full viewport |
| 5 | Click backdrop to close | Menu closes cleanly |

## Progress

- [x] Task 1: Fix mobile menu with portal
- [x] Task 2: Verify with browser automation
- [x] Task 3: Fix theme toggle double-click issue (bonus)
      **Tasks:** 3 | **Done:** 3

## Tasks

### Task 1: Fix mobile menu with portal

**Objective:** Render mobile menu overlay via React portal to escape header's containing block
**Files:** `components/shared/MobileMenu.tsx`
**TDD:** N/A (CSS layout bug — browser verification is the test)
**Verify:** Browser automation: open menu → screenshot → verify panel height equals viewport height

### Task 2: Verify with browser automation

**Objective:** Verify on deployed production that panel covers full viewport with opaque background
**Verify:** agent-browser: open site → click hamburger → screenshot → check panel dimensions → verify opacity
