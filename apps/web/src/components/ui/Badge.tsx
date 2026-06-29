import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'collins';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700',
  collins: 'bg-collins-100 text-collins-800',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, BadgeTone> = {
  active: 'success',
  approved: 'success',
  completed: 'success',
  open: 'success',
  published: 'success',
  pending: 'warning',
  submitted: 'info',
  in_progress: 'info',
  draft: 'neutral',
  on_leave: 'warning',
  rejected: 'danger',
  cancelled: 'neutral',
  terminated: 'danger',
  closed: 'neutral',
  overdue: 'danger',
  not_started: 'neutral',
};

export function statusTone(status: string): BadgeTone {
  return STATUS_TONES[status] ?? 'neutral';
}
