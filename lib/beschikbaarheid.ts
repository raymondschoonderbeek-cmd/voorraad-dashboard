/**
 * Beschikbaarheidslogica — berekent status op basis van OOF + werktijden.
 */

export type BeschikbaarheidStatus = 'beschikbaar' | 'out-of-office' | 'buiten-werktijd' | 'onbekend'

export interface BeschikbaarheidRecord {
  user_id: string
  oof_status: string
  oof_start: string | null
  oof_end: string | null
  oof_internal_msg: string | null
  oof_external_msg: string | null
  work_days: string[]
  work_start_time: string   // 'HH:MM'
  work_end_time: string     // 'HH:MM'
  work_timezone: string
  graph_synced_at: string | null
  updated_at: string
}

export interface GebruikerStatus {
  user_id: string
  email: string
  naam: string | null
  status: BeschikbaarheidStatus
  oof_end: string | null      // wanneer OOF afloopt (als scheduled)
  work_start_time: string
  work_end_time: string
  work_days: string[]
}

/**
 * Mapping van Windows-tijdzonenamen naar IANA-namen.
 * Uitgebreid voor meest voorkomende Europese en mondiale zones.
 */
const WINDOWS_TO_IANA: Record<string, string> = {
  'W. Europe Standard Time': 'Europe/Amsterdam',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'UTC': 'UTC',
  'Eastern Standard Time': 'America/New_York',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'China Standard Time': 'Asia/Shanghai',
  'India Standard Time': 'Asia/Kolkata',
  'Arab Standard Time': 'Asia/Riyadh',
  'E. Europe Standard Time': 'Europe/Minsk',
  'FLE Standard Time': 'Europe/Helsinki',
  'GTB Standard Time': 'Europe/Athens',
  'Turkey Standard Time': 'Europe/Istanbul',
}

function toIana(windowsTz: string): string {
  return WINDOWS_TO_IANA[windowsTz] ?? 'Europe/Amsterdam'
}

/** Bereken de beschikbaarheidsstatus voor een gebruiker op tijdstip `now`. */
export function berekenStatus(rec: BeschikbaarheidRecord, now: Date = new Date()): BeschikbaarheidStatus {
  // 1. Out of Office check
  if (rec.oof_status === 'alwaysEnabled') return 'out-of-office'
  if (rec.oof_status === 'scheduled' && rec.oof_start && rec.oof_end) {
    const start = new Date(rec.oof_start)
    const end = new Date(rec.oof_end)
    if (now >= start && now <= end) return 'out-of-office'
  }

  // 2. Werktijden check
  const iana = toIana(rec.work_timezone)
  const dayName = now
    .toLocaleDateString('en-US', { weekday: 'long', timeZone: iana })
    .toLowerCase()  // 'monday', 'tuesday', ...

  if (!rec.work_days.includes(dayName)) return 'buiten-werktijd'

  // Huidige tijd in de juiste tijdzone als "HH:MM"
  const currentTime = now.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: iana,
    hour12: false,
  })

  if (currentTime < rec.work_start_time || currentTime >= rec.work_end_time) return 'buiten-werktijd'

  return 'beschikbaar'
}

/** Label voor weergave in de UI. */
export function statusLabel(status: BeschikbaarheidStatus): string {
  switch (status) {
    case 'beschikbaar':    return 'Beschikbaar'
    case 'out-of-office':  return 'Out of office'
    case 'buiten-werktijd': return 'Buiten werktijd'
    default:               return 'Onbekend'
  }
}

/** Kleurset per status. */
export function statusKleur(status: BeschikbaarheidStatus): { bg: string; fg: string; dot: string } {
  switch (status) {
    case 'beschikbaar':     return { bg: '#dcfce7', fg: '#15803d', dot: '#16a34a' }
    case 'out-of-office':   return { bg: '#fff7ed', fg: '#c2410c', dot: '#ea580c' }
    case 'buiten-werktijd': return { bg: '#f1f5f9', fg: '#64748b', dot: '#94a3b8' }
    default:                return { bg: '#f8fafc', fg: '#94a3b8', dot: '#cbd5e1' }
  }
}

/** Dag-labels voor de UI. */
export const DAG_LABELS: Record<string, string> = {
  monday: 'Maandag',
  tuesday: 'Dinsdag',
  wednesday: 'Woensdag',
  thursday: 'Donderdag',
  friday: 'Vrijdag',
  saturday: 'Zaterdag',
  sunday: 'Zondag',
}

export const ALLE_DAGEN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** Windows-tijdzonenamen voor de dropdown. */
export const TIJDZONE_OPTIES = [
  { value: 'W. Europe Standard Time', label: 'Nederland / België (CET/CEST)' },
  { value: 'GMT Standard Time', label: 'Londen (GMT/BST)' },
  { value: 'Romance Standard Time', label: 'Parijs / Brussel (CET/CEST)' },
  { value: 'Central Europe Standard Time', label: 'Midden-Europa (CET/CEST)' },
  { value: 'FLE Standard Time', label: 'Helsinki / Riga (EET/EEST)' },
  { value: 'GTB Standard Time', label: 'Athene / Boekarest (EET/EEST)' },
  { value: 'Turkey Standard Time', label: 'Istanbul (TRT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Eastern Standard Time', label: 'New York (ET)' },
  { value: 'Central Standard Time', label: 'Chicago (CT)' },
  { value: 'Mountain Standard Time', label: 'Denver (MT)' },
  { value: 'Pacific Standard Time', label: 'Los Angeles (PT)' },
]
