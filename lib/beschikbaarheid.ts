/**
 * Beschikbaarheidslogica — per-dag werktijden + OOF + statuscalculatie.
 */

export type BeschikbaarheidStatus = 'beschikbaar' | 'out-of-office' | 'buiten-werktijd' | 'onbekend'

export type DagNaam = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface DagSchema {
  enabled: boolean
  start: string   // 'HH:MM'
  end: string     // 'HH:MM'
}

export type WeekSchema = Record<DagNaam, DagSchema>

export const DEFAULT_WEEK_SCHEMA: WeekSchema = {
  monday:    { enabled: true,  start: '09:00', end: '17:00' },
  tuesday:   { enabled: true,  start: '09:00', end: '17:00' },
  wednesday: { enabled: true,  start: '09:00', end: '17:00' },
  thursday:  { enabled: true,  start: '09:00', end: '17:00' },
  friday:    { enabled: true,  start: '09:00', end: '17:00' },
  saturday:  { enabled: false, start: '09:00', end: '17:00' },
  sunday:    { enabled: false, start: '09:00', end: '17:00' },
}

export interface BeschikbaarheidRecord {
  user_id: string
  oof_status: string
  oof_start: string | null
  oof_end: string | null
  oof_internal_msg: string | null
  oof_external_msg: string | null
  work_schedule: WeekSchema | null
  work_timezone: string
  graph_synced_at: string | null
  updated_at: string
}

export interface GebruikerStatus {
  user_id: string
  email: string
  naam: string | null
  afdeling: string | null
  status: BeschikbaarheidStatus
  oof_end: string | null
  oof_start: string | null
  work_schedule: WeekSchema | null
  work_timezone: string
  next_available_label: string | null
}

/** Windows-tijdzonenamen → IANA. */
const WINDOWS_TO_IANA: Record<string, string> = {
  'W. Europe Standard Time':       'Europe/Amsterdam',
  'Central Europe Standard Time':  'Europe/Budapest',
  'Central European Standard Time':'Europe/Warsaw',
  'Romance Standard Time':         'Europe/Paris',
  'GMT Standard Time':             'Europe/London',
  'UTC':                           'UTC',
  'Eastern Standard Time':         'America/New_York',
  'Pacific Standard Time':         'America/Los_Angeles',
  'Mountain Standard Time':        'America/Denver',
  'Central Standard Time':         'America/Chicago',
  'AUS Eastern Standard Time':     'Australia/Sydney',
  'Tokyo Standard Time':           'Asia/Tokyo',
  'China Standard Time':           'Asia/Shanghai',
  'India Standard Time':           'Asia/Kolkata',
  'Arab Standard Time':            'Asia/Riyadh',
  'FLE Standard Time':             'Europe/Helsinki',
  'GTB Standard Time':             'Europe/Athens',
  'Turkey Standard Time':          'Europe/Istanbul',
}

export function toIana(windowsTz: string): string {
  return WINDOWS_TO_IANA[windowsTz] ?? 'Europe/Amsterdam'
}

/** Bereken de beschikbaarheidsstatus voor een gebruiker op tijdstip `now`. */
export function berekenStatus(rec: BeschikbaarheidRecord, now: Date = new Date()): BeschikbaarheidStatus {
  const schema = rec.work_schedule ?? DEFAULT_WEEK_SCHEMA
  const iana = toIana(rec.work_timezone ?? 'W. Europe Standard Time')

  const dayName = now
    .toLocaleDateString('en-US', { weekday: 'long', timeZone: iana })
    .toLowerCase() as DagNaam

  const dag = schema[dayName]

  // 1. Niet-werkdag heeft altijd voorrang — ook als OOF aanstaat
  if (!dag?.enabled) return 'buiten-werktijd'

  // 2. Out of Office (alleen op werkdagen)
  if (rec.oof_status === 'alwaysEnabled') return 'out-of-office'
  if (rec.oof_status === 'scheduled' && rec.oof_start && rec.oof_end) {
    if (now >= new Date(rec.oof_start) && now <= new Date(rec.oof_end)) return 'out-of-office'
  }

  // 3. Buiten werktijden op een werkdag
  const hhmm = now.toLocaleTimeString('nl-NL', {
    hour: '2-digit', minute: '2-digit',
    timeZone: iana, hour12: false,
  })

  if (hhmm < dag.start || hhmm >= dag.end) return 'buiten-werktijd'

  return 'beschikbaar'
}

/** Label voor weergave. */
export function statusLabel(status: BeschikbaarheidStatus): string {
  switch (status) {
    case 'beschikbaar':     return 'Beschikbaar'
    case 'out-of-office':   return 'Out of office'
    case 'buiten-werktijd': return 'Buiten werktijd'
    default:                return 'Onbekend'
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

export const DAG_LABELS: Record<DagNaam, string> = {
  monday:    'Maandag',
  tuesday:   'Dinsdag',
  wednesday: 'Woensdag',
  thursday:  'Donderdag',
  friday:    'Vrijdag',
  saturday:  'Zaterdag',
  sunday:    'Zondag',
}

export const ALLE_DAGEN: DagNaam[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]

/**
 * Bereken wanneer de gebruiker eerstvolgens beschikbaar is.
 * Geeft een leesbaar label terug, bijv. "Vandaag om 09:00", "Morgen om 09:00",
 * "Maandag om 09:00", "Terug 15 mei", of null als nu al beschikbaar.
 */
export function berekenVolgendeLabel(rec: BeschikbaarheidRecord, now: Date = new Date()): string | null {
  const status = berekenStatus(rec, now)
  if (status === 'beschikbaar') return null

  // Out of Office
  if (status === 'out-of-office') {
    if (rec.oof_status === 'alwaysEnabled') return 'Onbepaalde tijd'
    if (rec.oof_status === 'scheduled' && rec.oof_end) {
      const end = new Date(rec.oof_end)
      if (!Number.isNaN(end.getTime())) {
        // Terugdatum = dag ná het einde van OOF
        // Bijv. OOF t/m 17 april → "Terug 18 april"
        const terug = new Date(end.getTime() + 86_400_000)
        const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
        if (terug.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
        return `Terug ${terug.toLocaleDateString('nl-NL', opts)}`
      }
    }
    return null
  }

  // Buiten werktijd — zoek eerstvolgende werkdag + begintijd
  const schema = rec.work_schedule ?? DEFAULT_WEEK_SCHEMA
  const iana = toIana(rec.work_timezone ?? 'W. Europe Standard Time')

  for (let i = 0; i <= 7; i++) {
    // Bereken datum i dagen vooruit
    const check = new Date(now.getTime() + i * 86_400_000)
    const dayName = check
      .toLocaleDateString('en-US', { weekday: 'long', timeZone: iana })
      .toLowerCase() as DagNaam
    const dag = schema[dayName]
    if (!dag?.enabled) continue

    if (i === 0) {
      // Vandaag: alleen als de werkdag nog niet begonnen is
      const hhmm = now.toLocaleTimeString('nl-NL', {
        hour: '2-digit', minute: '2-digit',
        timeZone: iana, hour12: false,
      })
      if (hhmm < dag.start) return `Vandaag om ${dag.start}`
      continue // Werkdag van vandaag is al voorbij
    }

    if (i === 1) return `Morgen om ${dag.start}`
    return `${DAG_LABELS[dayName]} om ${dag.start}`
  }

  return null
}

export const TIJDZONE_OPTIES = [
  { value: 'W. Europe Standard Time',       label: 'Nederland / België (CET/CEST)' },
  { value: 'GMT Standard Time',             label: 'Londen (GMT/BST)' },
  { value: 'Romance Standard Time',         label: 'Parijs / Brussel (CET/CEST)' },
  { value: 'Central Europe Standard Time',  label: 'Midden-Europa (CET/CEST)' },
  { value: 'FLE Standard Time',             label: 'Helsinki / Riga (EET/EEST)' },
  { value: 'GTB Standard Time',             label: 'Athene / Boekarest (EET/EEST)' },
  { value: 'Turkey Standard Time',          label: 'Istanbul (TRT)' },
  { value: 'UTC',                           label: 'UTC' },
  { value: 'Eastern Standard Time',         label: 'New York (ET)' },
  { value: 'Central Standard Time',         label: 'Chicago (CT)' },
  { value: 'Mountain Standard Time',        label: 'Denver (MT)' },
  { value: 'Pacific Standard Time',         label: 'Los Angeles (PT)' },
]
