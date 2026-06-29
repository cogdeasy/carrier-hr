import { describe, expect, it } from 'vitest';
import { formatCents, formatCurrency, formatDate, relativeDays, titleCase } from './format';

describe('format utilities', () => {
  it('formats whole-dollar currency without cents', () => {
    expect(formatCurrency(125000)).toBe('$125,000');
  });

  it('formats integer cents as dollars', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats valid dates and guards invalid ones', () => {
    expect(formatDate('2026-01-15')).toBe('Jan 15, 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('title-cases snake_case enum values', () => {
    expect(titleCase('full_time')).toBe('Full Time');
    expect(titleCase('on_leave')).toBe('On Leave');
  });

  it('computes relative day labels', () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    expect(relativeDays(future)).toMatch(/^In \d+ days$/);
    expect(relativeDays(past)).toMatch(/^\d+ days ago$/);
  });
});
