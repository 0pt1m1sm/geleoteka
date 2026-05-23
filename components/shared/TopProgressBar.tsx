/**
 * Indeterminate top-of-viewport progress bar — a 2px gold sweep that loops
 * (`animate-nav-progress` in globals.css) for as long as it is mounted.
 *
 * Pure markup, no hooks: safe in both server components (route `loading.tsx`
 * fallbacks, shown during link navigations while the segment loads) and client
 * components (NavigationProgress, shown during programmatic transitions). Both
 * render this so the bar looks identical regardless of how navigation started.
 */
export function TopProgressBar(): React.ReactElement {
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[2px] z-[100] overflow-hidden pointer-events-none"
    >
      <div className="absolute inset-y-0 left-0 w-1/3 bg-[var(--color-accent)] animate-nav-progress" />
    </div>
  );
}
