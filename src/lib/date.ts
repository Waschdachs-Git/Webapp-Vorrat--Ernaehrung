/** Date helpers. All "local-day" logic works on the device's timezone. */

export function todayISO(): string {
  return toISODate(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ageFromBirthdate(birthdate: string): number {
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Whole days from today until the given date (negative = in the past). */
export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00');
  const now = new Date(todayISO() + 'T00:00:00');
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

/** UTC ISO bounds of a local calendar day — for indexed range queries. */
export function localDayBounds(isoDate: string): { start: string; end: string } {
  return {
    start: new Date(`${isoDate}T00:00:00`).toISOString(),
    end: new Date(`${isoDate}T23:59:59.999`).toISOString(),
  };
}

export function isSameLocalDay(isoDatetime: string, isoDate: string): boolean {
  return toISODate(new Date(isoDatetime)) === isoDate;
}

export function formatDay(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTime(isoDatetime: string): string {
  return new Date(isoDatetime).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
