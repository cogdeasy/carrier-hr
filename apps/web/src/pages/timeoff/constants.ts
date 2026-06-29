import type { TimeOffType } from '@collins-hr/shared';

export const TYPE_LABELS: Record<TimeOffType, string> = {
  vacation: 'Vacation',
  sick: 'Sick',
  personal: 'Personal',
  bereavement: 'Bereavement',
  jury_duty: 'Jury duty',
  parental: 'Parental',
  unpaid: 'Unpaid',
};

export const TYPE_OPTIONS = Object.entries(TYPE_LABELS) as [TimeOffType, string][];

export function typeLabel(type: string): string {
  return TYPE_LABELS[type as TimeOffType] ?? type;
}

const ACCRUAL_TYPES = new Set<TimeOffType>(['vacation', 'sick', 'personal']);
export function isAccrual(type: string): boolean {
  return ACCRUAL_TYPES.has(type as TimeOffType);
}

/** Mirrors the server's working-day count: weekdays minus company holidays. */
export function workingDaysBetween(start: string, end: string, holidays: Set<string>): number {
  if (!start || !end || end < start) return 0;
  let days = 0;
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const dow = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
