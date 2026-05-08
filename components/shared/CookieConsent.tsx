"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import { acceptCookieConsent, useCookieConsentVisible } from "@/lib/cookie-consent";

interface CookieConsentProps {
  text: string;
  buttonLabel: string;
}

// Override `<p>` from react-markdown so it doesn't nest a block-level element
// inside the inline-flow banner. Markdown features (links, bold) still work.
const INLINE_COMPONENTS: Components = {
  p: ({ children }) => <span>{children}</span>,
};

export function CookieConsent({ text, buttonLabel }: CookieConsentProps): React.ReactElement | null {
  const visible = useCookieConsentVisible();
  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-[var(--card)] border-t border-[var(--border)]">
      <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-[var(--foreground-muted)]">
          <ReactMarkdown components={INLINE_COMPONENTS}>{text}</ReactMarkdown>
        </div>
        <button
          type="button"
          onClick={acceptCookieConsent}
          className="btn btn-primary text-sm shrink-0"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
