import { cn } from '../lib/cn';

/**
 * Collins Aerospace wordmark. The brand is a text-only logotype (no symbol):
 * "Collins Aerospace" set in a single-weight humanist sans in deep blue.
 */
export function Logo({ className, variant = 'dark' }: { className?: string; variant?: 'dark' | 'light' }) {
  const fill = variant === 'dark' ? '#00205B' : '#ffffff';
  return (
    <svg
      viewBox="0 0 300 40"
      className={cn('h-8 w-auto', className)}
      role="img"
      aria-label="Collins Aerospace"
    >
      <text
        x="0"
        y="30"
        fontFamily="Inter, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="500"
        fontSize="32"
        letterSpacing="0.2"
        fill={fill}
      >
        Collins Aerospace
      </text>
    </svg>
  );
}
