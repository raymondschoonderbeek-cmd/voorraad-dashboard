/** ISO weekdag: 1 = maandag … 7 = zondag */
export const WEEKDAYS_NL: { iso: number; label: string; short: string }[] = [
  { iso: 1, label: 'Maandag', short: 'Ma' },
  { iso: 2, label: 'Dinsdag', short: 'Di' },
  { iso: 3, label: 'Woensdag', short: 'Wo' },
  { iso: 4, label: 'Donderdag', short: 'Do' },
  { iso: 5, label: 'Vrijdag', short: 'Vr' },
  { iso: 6, label: 'Zaterdag', short: 'Za' },
  { iso: 7, label: 'Zondag', short: 'Zo' },
]

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseLocalYmd(ymd: string): Date | null {
  const m = YMD.exec(ymd.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null
  const dt = new Date(y, mo, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null
  return dt
}

/** ISO-dag 1–7 uit lokale datum */
export function isoWeekdayFromDate(d: Date): number {
  const w = d.getDay()
  return w === 0 ? 7 : w
}

export function ymdFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function normalizeOrderWeekdays(arr: unknown): number[] | null {
  if (!Array.isArray(arr)) return null
  const set = new Set<number>()
  for (const x of arr) {
    const n = typeof x === 'number' ? x : Number(x)
    if (!Number.isInteger(n) || n < 1 || n > 7) return null
    set.add(n)
  }
  const out = [...set].sort((a, b) => a - b)
  return out.length > 0 ? out : null
}

export function normalizeClosedDates(arr: unknown): string[] | null {
  if (!Array.isArray(arr)) return null
  const set = new Set<string>()
  for (const x of arr) {
    if (typeof x !== 'string') return null
    const s = x.trim()
    if (!YMD.test(s)) return null
    if (!parseLocalYmd(s)) return null
    set.add(s)
  }
  return [...set].sort()
}

export type OrderDateCheck =
  | { ok: true }
  | { ok: false; message: string }

export function checkOrderDateAllowed(
  orderDateYmd: string,
  orderWeekdays: number[],
  closedDatesYmd: string[]
): OrderDateCheck {
  const d = parseLocalYmd(orderDateYmd)
  if (!d) return { ok: false, message: 'Ongeldige besteldatum.' }

  if (closedDatesYmd.includes(orderDateYmd)) {
    return { ok: false, message: 'Deze dag is gesloten; er kan niet voor besteld worden.' }
  }

  const iso = isoWeekdayFromDate(d)
  if (!orderWeekdays.includes(iso)) {
    return { ok: false, message: 'Er kan op deze weekdag niet besteld worden.' }
  }

  return { ok: true }
}
