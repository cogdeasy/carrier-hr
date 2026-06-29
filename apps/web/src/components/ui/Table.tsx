import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50">{children}</thead>;
}

export function TH({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}

export function TR({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(onClick && 'cursor-pointer hover:bg-slate-50', className)}
    >
      {children}
    </tr>
  );
}

export function TD({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-slate-700', className)}>{children}</td>;
}
