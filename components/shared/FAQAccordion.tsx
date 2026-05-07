"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface FAQItem {
  question: string;
  /** Pre-rendered answer node (e.g. markdown rendered server-side). */
  answerNode: ReactNode;
}

/**
 * Accordion using the modern grid-template-rows 0fr → 1fr trick for smooth
 * height transitions without measuring. The answer node stays in the DOM;
 * the wrapper grid row collapses/expands.
 */
export function FAQAccordion({ items }: { items: FAQItem[] }): React.ReactElement {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        const panelId = `faq-panel-${i}`;
        return (
          <div key={i} className="card">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between text-left active:opacity-70 transition-opacity"
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span className="font-medium pr-4">{item.question}</span>
              <ChevronDown
                className={`w-5 h-5 shrink-0 text-[var(--foreground-muted)] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            <div
              id={panelId}
              className="grid overflow-hidden"
              style={{
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                transition: "grid-template-rows 280ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              aria-hidden={!isOpen}
            >
              <div className="min-h-0">{item.answerNode}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
