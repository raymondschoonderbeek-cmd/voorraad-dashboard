import {
  getAmsterdamYmd,
  amsterdamMinutesSinceMidnight,
  parseHHmmToMinutes,
} from '@/lib/amsterdam-time'
import { checkOrderDateAllowed, parseLocalYmd, ymdFromDate } from '@/lib/lunch-schedule'

export function normalizeOrderEndTimeLocal(s: string | null | undefined): string {
  const d = parseHHmmToMinutes(s?.trim() ?? '')
  if (d == null) return '10:30'
  const h = Math.floor(d / 60)
  const m = d % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** NL-weergave, bijv. "10.30 uur" */
export function formatOrderEndTimeNl(endTimeHHmm: string): string {
  const m = parseHHmmToMinutes(endTimeHHmm)
  if (m == null) return endTimeHHmm
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${h}.${String(min).padStart(2, '0')} uur`
}

export function nextAllowedOrderDateStrictlyAfter(
  fromYmd: string,
  orderWeekdays: number[],
  closedDates: string[]
): string | null {
  const from = parseLocalYmd(fromYmd)
  if (!from) return null
  for (let i = 1; i <= 366; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const ymd = ymdFromDate(d)
    if (checkOrderDateAllowed(ymd, orderWeekdays, closedDates).ok) return ymd
  }
  return null
}

export function nextAllowedOrderDateOnOrAfter(
  fromYmd: string,
  orderWeekdays: number[],
  closedDates: string[]
): string | null {
  const from = parseLocalYmd(fromYmd)
  if (!from) return null
  for (let i = 0; i <= 366; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const ymd = ymdFromDate(d)
    if (checkOrderDateAllowed(ymd, orderWeekdays, closedDates).ok) return ymd
  }
  return null
}

/**
 * Besteldag in de herinneringsmail (magic link): vandaag vóór/eind uiterste tijd, anders eerstvolgende toegestane dag.
 */
export function effectiveOrderDateForReminderAt(
  now: Date,
  orderWeekdays: number[],
  closedDates: string[],
  orderEndTimeLocal: string
): string | null {
  const todayYmd = getAmsterdamYmd(now)
  const endMin = parseHHmmToMinutes(orderEndTimeLocal) ?? 10 * 60 + 30
  const nowMin = amsterdamMinutesSinceMidnight(now)
  const todayAllowed = checkOrderDateAllowed(todayYmd, orderWeekdays, closedDates)

  if (todayAllowed.ok) {
    if (nowMin <= endMin) return todayYmd
    return nextAllowedOrderDateStrictlyAfter(todayYmd, orderWeekdays, closedDates)
  }
  return nextAllowedOrderDateOnOrAfter(todayYmd, orderWeekdays, closedDates)
}

/** Geen bestelling meer voor deze kalenderdag (verleden of vandaag na eindtijd). */
export function isOrderClosedForDate(orderDateYmd: string, now: Date, orderEndTimeLocal: string): boolean {
  const todayYmd = getAmsterdamYmd(now)
  const endMin = parseHHmmToMinutes(orderEndTimeLocal) ?? 10 * 60 + 30
  const nowMin = amsterdamMinutesSinceMidnight(now)

  if (orderDateYmd < todayYmd) return true
  if (orderDateYmd > todayYmd) return false
  return nowMin > endMin
}
