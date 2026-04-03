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
  | {
      ok: false
      variant: 'closed' | 'weekday' | 'invalid'
      title: string
      /** Volledige uitleg voor gebruiker (ook voor API-fouttekst) */
      description: string
    }

/**
 * Eerste kalenderdag op of na fromYmd waarvan de ISO-weekdag in orderWeekdays zit (geen closed_dates-check).
 * Gebruikt voor: geen herinneringsmail als díe eerstvolgende besteldag expliciet gesloten is.
 */
export function firstOrderWeekdayOnOrAfter(fromYmd: string, orderWeekdays: number[]): string | null {
  const from = parseLocalYmd(fromYmd)
  if (!from || orderWeekdays.length === 0) return null
  const set = new Set(orderWeekdays)
  for (let i = 0; i <= 366; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    const ymd = ymdFromDate(d)
    const iso = isoWeekdayFromDate(d)
    if (set.has(iso)) return ymd
  }
  return null
}

export function checkOrderDateAllowed(
  orderDateYmd: string,
  orderWeekdays: number[],
  closedDatesYmd: string[]
): OrderDateCheck {
  const d = parseLocalYmd(orderDateYmd)
  if (!d) {
    return {
      ok: false,
      variant: 'invalid',
      title: 'Ongeldige datum',
      description: 'De gekozen datum is ongeldig. Selecteer een geldige datum in de kalender.',
    }
  }

  if (closedDatesYmd.includes(orderDateYmd)) {
    const pretty = d.toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    return {
      ok: false,
      variant: 'closed',
      title: 'Deze dag is gesloten',
      description: `Op ${pretty} is niet mogelijk om te bestellen — deze dag staat als gesloten in de agenda. Kies een andere datum om je broodjes te bestellen.`,
    }
  }

  const iso = isoWeekdayFromDate(d)
  if (!orderWeekdays.includes(iso)) {
    const dayName = WEEKDAYS_NL.find(w => w.iso === iso)?.label ?? 'Deze dag'
    return {
      ok: false,
      variant: 'weekday',
      title: 'Bestellen niet mogelijk op deze dag',
      description: `Op ${dayName} is niet mogelijk om te bestellen. Alleen op de door de beheerder ingestelde dagen kun je een lunch bestellen — kies een andere datum.`,
    }
  }

  return { ok: true }
}
