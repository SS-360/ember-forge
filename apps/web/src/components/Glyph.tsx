import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  check: <path d="m5 12.5 4.2 4.2L19 6.8" />,
  reject: <><path d="m7 7 10 10M17 7 7 17" /></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" /></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  folder: <><path d="M3 6.5h6l2 2h10v9H3z" /><path d="M3 9h18" /></>,
  file: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6m-6 3h6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  close: <><path d="m6 6 12 12m0-12L6 18" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  scale: <><path d="M12 3v17m-7 0h14M5 7h14M7 7l-3 6h6L7 7Zm10 0-3 6h6l-3-6Z" /></>
};

export function Glyph({ name, className }: { name: string; className?: string }) {
  return <svg className={className ?? "glyph"} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {paths[name] ?? paths.info}
  </svg>;
}
