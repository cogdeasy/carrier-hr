import { cn } from '../lib/cn';

/** Collins Aerospace wordmark. */
export function Logo({ className, variant = 'dark' }: { className?: string; variant?: 'dark' | 'light' }) {
  const primary = variant === 'dark' ? '#0033A0' : '#ffffff';
  const accent = variant === 'dark' ? '#00A3E0' : '#bccdff';
  return (
    <svg
      viewBox="0 0 320 80"
      className={cn('h-9 w-auto', className)}
      role="img"
      aria-label="Collins Aerospace"
    >
      <path d="M4 40 q34 -30 70 0 q34 30 70 0" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" />
      <text
        x="2"
        y="58"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="800"
        fontSize="34"
        letterSpacing="-0.5"
        fill={primary}
      >
        Collins
      </text>
      <text
        x="150"
        y="58"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="400"
        fontSize="34"
        letterSpacing="3"
        fill={primary}
      >
        Aerospace
      </text>
    </svg>
  );
}
