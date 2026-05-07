import ReactMarkdown, { type Components } from "react-markdown";

interface MarkdownProps {
  source: string;
  /** Per-element overrides — passed through to react-markdown `components`. */
  components?: Components;
  /** Optional wrapper class. Renders inside a `<div>` — markdown produces block elements. */
  className?: string;
}

/**
 * Renders trusted markdown source. `react-markdown` v10 escapes HTML by
 * default (no `rehype-raw`); we intentionally do not pass that plugin so a
 * `<script>` in the source becomes literal text. Suitable for admin-edited
 * content where the threat model treats admins as trusted but mistakes
 * (accidental copy-paste of HTML) should be safe.
 */
export function Markdown({
  source,
  components,
  className,
}: MarkdownProps): React.ReactElement {
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{source}</ReactMarkdown>
    </div>
  );
}
