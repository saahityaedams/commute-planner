/** Small line glyphs for each travel mode. Drawn on a 16px grid, coloured by currentColor. */
const paths: Record<string, React.ReactNode> = {
  walk: (
    <>
      <circle cx="9" cy="2.6" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8.6 5.2 7 9.4l2.4 1.9.8 3.6M8.6 5.2l2.2 2.4 2 .6M7.6 7.6l-2.3 1M7 9.4l-1.6 5.2" />
    </>
  ),
  bus: (
    <>
      <rect x="3" y="1.8" width="10" height="11" rx="2" />
      <path d="M3 8h10M5 1.8v0M5.4 13v1.6M10.6 13v1.6" />
      <circle cx="5.6" cy="10.6" r=".55" fill="currentColor" />
      <circle cx="10.4" cy="10.6" r=".55" fill="currentColor" />
    </>
  ),
  metro: (
    <>
      <rect x="3.5" y="1.8" width="9" height="10.4" rx="3" />
      <path d="M3.5 7.2h9M6 14.6l1-2.4M10 14.6l-1-2.4" />
      <circle cx="6.2" cy="9.8" r=".55" fill="currentColor" />
      <circle cx="9.8" cy="9.8" r=".55" fill="currentColor" />
    </>
  ),
  auto: (
    <>
      <path d="M2 11.4V7.6C2 4.8 4 3 6.8 3h2.6c1.4 0 2.3.7 2.8 1.9l1.4 3.4h.4v3.1" />
      <path d="M7.4 3v5.3h6.2M2 8.3h3.4" />
      <circle cx="4.4" cy="12" r="1.5" />
      <circle cx="11.8" cy="12" r="1.5" />
    </>
  ),
};

export function ModeIcon({ mode, className = "h-3.5 w-3.5" }: { mode: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[mode] ?? <circle cx="8" cy="8" r="3" fill="currentColor" />}
    </svg>
  );
}
