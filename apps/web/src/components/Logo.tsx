import { cn } from '../lib/cn';

/** Carrier wordmark in the signature navy oval. */
export function Logo({ className, variant = 'dark' }: { className?: string; variant?: 'dark' | 'light' }) {
  const fill = variant === 'dark' ? '#0033A0' : '#ffffff';
  const text = variant === 'dark' ? '#ffffff' : '#0033A0';
  return (
    <svg viewBox="0 0 320 128" className={cn('h-9 w-auto', className)} role="img" aria-label="Carrier">
      <ellipse cx="160" cy="64" rx="156" ry="58" fill={fill} />
      <ellipse cx="160" cy="64" rx="146" ry="50" fill="none" stroke={text} strokeWidth="3" />
      <text
        x="160"
        y="86"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="700"
        fontSize="64"
        fill={text}
      >
        Carrier
      </text>
    </svg>
  );
}
