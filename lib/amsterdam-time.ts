const TZ = 'Europe/Amsterdam'

/** ISO weekdag 1 = maandag … 7 = zondag, in Europe/Amsterdam */
export function getAmsterdamIsoWeekday(d: Date): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d)
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return map[s.slice(0, 3)] ?? 1
}

/** YYYY-MM-DD in Europe/Amsterdam */
export function getAmsterdamYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function getAmsterdamHourMinute(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  return { hour, minute }
}

/** Minuten sinds middernacht Amsterdam (0–1439) */
export function amsterdamMinutesSinceMidnight(d: Date): number {
  const { hour, minute } = getAmsterdamHourMinute(d)
  return hour * 60 + minute
}

/** Parse "HH:mm" naar minuten; null bij ongeldig */
export function parseHHmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/**
 * Binnen 5 minuten na geconfigureerde tijd (voor cron die elke 5 min pingt).
 */
export function isWithinReminderWindow(now: Date, configuredMinutes: number): boolean {
  const t = amsterdamMinutesSinceMidnight(now)
  return t >= configuredMinutes && t < configuredMinutes + 5
}
