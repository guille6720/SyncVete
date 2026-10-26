import { APP_LOCALE, APP_TIMEZONE } from '@sincvete/shared';

/** Hour 0–23 in clinic timezone — stable across SSR and client. */
export function getClinicHour(now: Date = new Date()): number {
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).format(now);
  const hour = Number.parseInt(raw, 10);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

export function getClinicGreeting(now: Date = new Date()): string {
  const hour = getClinicHour(now);
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function getClinicTodayLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
}
