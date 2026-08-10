/**
 * Decorative line-art building sketch for content-page hero sections
 * (Developers directory, Help). Pure inline SVG, no external asset — a
 * light editorial accent, not literal architecture. `aria-hidden` since it
 * carries no information.
 */
export function HeroSketch({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 200"
      fill="none"
      aria-hidden="true"
      className={className}
      stroke="currentColor"
      strokeWidth="1"
    >
      <line x1="4" y1="188" x2="316" y2="188" />
      <rect x="150" y="40" width="90" height="148" />
      <line x1="150" y1="60" x2="240" y2="60" />
      <line x1="150" y1="80" x2="240" y2="80" />
      <line x1="150" y1="100" x2="240" y2="100" />
      <line x1="150" y1="120" x2="240" y2="120" />
      <line x1="150" y1="140" x2="240" y2="140" />
      <line x1="150" y1="160" x2="240" y2="160" />
      <line x1="170" y1="40" x2="170" y2="188" />
      <line x1="195" y1="40" x2="195" y2="188" />
      <line x1="220" y1="40" x2="220" y2="188" />
      <rect x="250" y="90" width="46" height="98" />
      <line x1="250" y1="110" x2="296" y2="110" />
      <line x1="250" y1="130" x2="296" y2="130" />
      <line x1="250" y1="150" x2="296" y2="150" />
      <line x1="250" y1="170" x2="296" y2="170" />
      <path d="M60 188 V150 Q60 140 70 140 Q80 140 80 150 V188" />
      <line x1="70" y1="140" x2="70" y2="105" />
      <circle cx="70" cy="100" r="5" />
      <path d="M20 60 q6 -6 12 0 q6 -6 12 0" />
      <path d="M255 30 q6 -6 12 0 q6 -6 12 0" />
    </svg>
  );
}
