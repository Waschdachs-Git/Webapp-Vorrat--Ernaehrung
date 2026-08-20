import type { Unit } from '@/db/types';
import { daysUntil } from './date';

/** Unit label for the German UI ('pcs' must never reach the screen). */
export function unitLabel(unit: Unit): string {
  return unit === 'pcs' ? 'Stück' : unit;
}

/** Drop a trailing ",0" so 1,0 kg reads as 1 kg. */
function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

/**
 * Human amount: scales up to kg/l past 1000 so the list shows "1 kg"
 * instead of "1000 g".
 */
export function formatAmount(amount: number, unit: Unit): string {
  if (unit === 'pcs') return `${trim(amount)} ${unitLabel(unit)}`;
  if (amount >= 1000) {
    return `${trim(amount / 1000)} ${unit === 'g' ? 'kg' : 'l'}`;
  }
  return `${trim(amount)} ${unit}`;
}

/**
 * Best-before as a relative phrase. Absolute dates are hard to scan in a
 * list — the exact date stays in the detail view.
 */
export function relativeBestBefore(isoDate: string): string {
  const days = daysUntil(isoDate);
  if (days < 0) {
    const n = -days;
    return n === 1 ? 'Seit 1 Tag abgelaufen' : `Seit ${n} Tagen abgelaufen`;
  }
  if (days === 0) return 'Heute fällig';
  if (days === 1) return 'Morgen fällig';
  if (days <= 13) return `In ${days} Tagen`;
  if (days <= 60) {
    const w = Math.round(days / 7);
    return w === 1 ? 'In 1 Woche' : `In ${w} Wochen`;
  }
  const m = Math.round(days / 30);
  return m === 1 ? 'In 1 Monat' : `In ${m} Monaten`;
}
