/**
 * Microsoft Graph – mailboxSettings (out-of-office + werktijden)
 * Vereist applicatiemachtiging: MailboxSettings.ReadWrite.All
 */

export type OofStatus = 'disabled' | 'alwaysEnabled' | 'scheduled'

export interface MailboxOof {
  status: OofStatus
  start: string | null  // ISO datetime string (UTC)
  end: string | null
  internalMsg: string
  externalMsg: string
}

export interface MailboxWorkHours {
  days: string[]       // ['monday','tuesday',...]
  startTime: string    // 'HH:MM'
  endTime: string      // 'HH:MM'
  timezone: string     // Windows TZ name, e.g. 'W. Europe Standard Time'
}

const PORTAL_WERKLOCATIE_SUBJECT_PREFIX = '[Portal Werklocatie]'

function normalizeGraphDayName(day: string): string {
  return day.trim().toLowerCase()
}

function toGraphDayEnum(day: string): string {
  const d = normalizeGraphDayName(day)
  return d.charAt(0).toUpperCase() + d.slice(1)
}

export interface MailboxSettings {
  oof: MailboxOof
  workHours: MailboxWorkHours
}

/** Haal een Azure AD token op via client credentials. */
async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Azure omgevingsvariabelen ontbreken (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET).')
  }
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error_description?: string }
    throw new Error(`Azure token ophalen mislukt: ${err.error_description ?? res.statusText}`)
  }
  const data = await res.json() as { access_token: string }
  return data.access_token
}

/** Controleer of de Azure Graph-koppeling geconfigureerd is. */
export function isGraphConfigured(): boolean {
  return !!(
    process.env.AZURE_TENANT_ID?.trim() &&
    process.env.AZURE_CLIENT_ID?.trim() &&
    process.env.AZURE_CLIENT_SECRET?.trim()
  )
}

/** Normaliseer tijd "09:00:00.0000000" → "09:00" */
function normTime(raw: string | null | undefined): string {
  if (!raw) return '09:00'
  return raw.substring(0, 5)
}

/** Haal mailboxSettings op voor een gebruiker (via UPN/email). */
export async function getMailboxSettings(upn: string): Promise<MailboxSettings> {
  const token = await getGraphToken()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/mailboxSettings`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Graph mailboxSettings ophalen mislukt (${res.status}): ${err.error?.message ?? res.statusText}`)
  }
  const data = await res.json() as {
    automaticRepliesSetting?: {
      status?: string
      scheduledStartDateTime?: { dateTime?: string; timeZone?: string }
      scheduledEndDateTime?: { dateTime?: string; timeZone?: string }
      internalReplyMessage?: string
      externalReplyMessage?: string
    }
    workingHours?: {
      daysOfWeek?: string[]
      startTime?: string
      endTime?: string
      timeZone?: { name?: string }
    }
  }

  const oof = data.automaticRepliesSetting ?? {}
  const wh = data.workingHours ?? {}

  // Converteer Graph datetime naar ISO UTC string
  function graphDtToIso(dt?: { dateTime?: string; timeZone?: string }): string | null {
    if (!dt?.dateTime) return null
    if ((dt.timeZone ?? 'UTC') === 'UTC') {
      return dt.dateTime.endsWith('Z') ? dt.dateTime : `${dt.dateTime}Z`
    }
    // Als niet UTC: gebruik als-is (Graph geeft vaak al UTC terug)
    return dt.dateTime.endsWith('Z') ? dt.dateTime : `${dt.dateTime}Z`
  }

  return {
    oof: {
      status: (oof.status as OofStatus) ?? 'disabled',
      start: graphDtToIso(oof.scheduledStartDateTime),
      end: graphDtToIso(oof.scheduledEndDateTime),
      internalMsg: oof.internalReplyMessage ?? '',
      externalMsg: oof.externalReplyMessage ?? '',
    },
    workHours: {
      days: (wh.daysOfWeek ?? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']).map(normalizeGraphDayName),
      startTime: normTime(wh.startTime),
      endTime: normTime(wh.endTime),
      timezone: wh.timeZone?.name ?? 'W. Europe Standard Time',
    },
  }
}

export type WerklocatieType = 'thuis' | 'kantoor' | 'anders' | null

/**
 * Haal de werklocatie van vandaag op via de Graph Calendar API.
 * Vereist Calendars.Read applicatiemachtiging.
 * Geeft null terug als de gebruiker geen werklocatie heeft ingesteld.
 */
export async function getWerklocatie(upn: string, datum?: Date): Promise<{ type: WerklocatieType; label: string | null }> {
  const token = await getGraphToken()
  const dag = datum ?? new Date()

  // Zet datum om naar YYYY-MM-DD in UTC
  const yyyy = dag.getUTCFullYear()
  const mm = String(dag.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dag.getUTCDate()).padStart(2, '0')
  const start = `${yyyy}-${mm}-${dd}T00:00:00Z`
  const end   = `${yyyy}-${mm}-${dd}T23:59:59Z`

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/calendarView` +
    `?startDateTime=${start}&endDateTime=${end}` +
    `&$select=type,locations,subject` +
    `&$top=10`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return { type: null, label: null }

  const data = await res.json() as {
    value?: Array<{
      type?: string
      subject?: string
      locations?: Array<{ locationType?: string; displayName?: string }>
    }>
  }

  const event = (data.value ?? []).find(e => e.type === 'workingLocation')
  if (!event) return { type: null, label: null }

  const loc = event.locations?.[0]
  const locType = loc?.locationType?.toLowerCase() ?? ''

  if (locType === 'homeoffice' || locType === 'home') {
    return { type: 'thuis', label: 'Thuis' }
  }
  if (locType === 'businessaddress' || locType === 'office' || locType === 'conferenceroom') {
    return { type: 'kantoor', label: loc?.displayName?.trim() || 'Kantoor' }
  }
  if (loc?.displayName?.trim()) {
    return { type: 'anders', label: loc.displayName.trim() }
  }
  return { type: null, label: null }
}

/**
 * Haal het standaard werklocatieschema per dag op via de Graph Calendar API.
 * Queryt de komende 14 dagen. Accepteert zowel:
 * - type='workingLocation' (eenmalig ingesteld)
 * - type='occurrence' met isAllDay=true (recurring werklocatie-events, wekelijks schema)
 * Gebruikt displayName als primair label zodat Outlook-labels (bijv. "Extern") behouden blijven.
 */
export async function getWerklocatieSchema(upn: string): Promise<Partial<Record<string, string>>> {
  const token = await getGraphToken()
  const now = new Date()
  const start = now.toISOString().split('T')[0] + 'T00:00:00Z'
  const eind = new Date(now.getTime() + 14 * 86_400_000).toISOString().split('T')[0] + 'T23:59:59Z'

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/calendarView` +
    `?startDateTime=${start}&endDateTime=${eind}` +
    `&$select=subject,type,isAllDay,locations,start,showAs` +
    `&$top=100`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return {}

  const data = await res.json() as {
    value?: Array<{
      subject?: string
      type?: string
      isAllDay?: boolean
      showAs?: string
      start?: { dateTime?: string; timeZone?: string }
      locations?: Array<{ locationType?: string; displayName?: string }>
    }>
  }

  // Bekende werklocatie-typen (locationType van het locatie-object)
  const WERKLOCATIE_TYPES = new Set([
    'homeoffice', 'home', 'businessaddress', 'officelocation', 'office', 'conferenceroom',
  ])

  const schema: Partial<Record<string, string>> = {}
  for (const event of data.value ?? []) {
    if (!event.start?.dateTime) continue

    const isDirectWorkingLocation = event.type === 'workingLocation'
    // Recurring werklocatie-events komen als 'occurrence' met isAllDay=true en showAs='free'
    const isRecurringWerklocatie = event.type === 'occurrence' && event.isAllDay === true && event.showAs === 'free'
    const isPortalEvent = (event.subject ?? '').startsWith(PORTAL_WERKLOCATIE_SUBJECT_PREFIX)
      && event.isAllDay === true
      && event.showAs === 'free'

    if (!isDirectWorkingLocation && !isRecurringWerklocatie && !isPortalEvent) continue

    const loc = event.locations?.[0]
    const locType = (loc?.locationType ?? '').toLowerCase()

    // Bij recurring events: alleen accepteren als het een bekend werklocatie-type heeft
    if (isRecurringWerklocatie && !isPortalEvent && !WERKLOCATIE_TYPES.has(locType)) continue

    // Label: displayName van Outlook heeft prioriteit (bijv. "Extern", "Kantoor")
    // Valt terug op type-gebaseerd label als displayName leeg is
    let label: string | null = null
    if (loc?.displayName?.trim()) {
      label = loc.displayName.trim()
    } else if (locType === 'homeoffice' || locType === 'home') {
      label = 'Thuis'
    } else if (WERKLOCATIE_TYPES.has(locType)) {
      label = 'Kantoor'
    }

    if (!label) continue

    // Bepaal dag van de week (UTC)
    const dagDatum = new Date(event.start.dateTime.endsWith('Z')
      ? event.start.dateTime
      : event.start.dateTime + 'Z')
    const dagNaam = dagDatum
      .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
      .toLowerCase()

    // Eerste locatie per dag wint
    if (!schema[dagNaam]) schema[dagNaam] = label
  }

  return schema
}

/** Converteer een portaallocatie-label naar een Graph Location-object. */
function locatieNaarGraphLocation(locatie: string | null): { locationType: string; displayName: string } {
  if (!locatie || locatie.trim() === '') return { locationType: 'default', displayName: '' }
  if (locatie === 'Thuis') return { locationType: 'homeOffice', displayName: 'Home' }
  if (locatie === 'Kantoor') return { locationType: 'businessAddress', displayName: 'Office' }
  return { locationType: 'default', displayName: locatie.trim() }
}

/**
 * Werk de werklocatie van vandaag bij via de Graph Calendar API.
 * PATCHt het bestaande workingLocation-event als dat bestaat.
 * Maakt een nieuw all-day vrij-event aan als er geen workingLocation-event is.
 * Vereist Calendars.ReadWrite applicatiemachtiging.
 */
export async function patchWerklocatieVandaag(upn: string, locatie: string | null): Promise<void> {
  const token = await getGraphToken()
  const nu = new Date()
  const yyyy = nu.getUTCFullYear()
  const mm = String(nu.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(nu.getUTCDate()).padStart(2, '0')
  const startDt = `${yyyy}-${mm}-${dd}T00:00:00Z`
  const eindDt  = `${yyyy}-${mm}-${dd}T23:59:59Z`

  // Zoek bestaand workingLocation event voor vandaag
  const listUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/calendarView` +
    `?startDateTime=${startDt}&endDateTime=${eindDt}&$select=id,type,locations&$top=25`
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Kalender ophalen mislukt (${listRes.status}): ${err.error?.message ?? listRes.statusText}`)
  }
  const listData = await listRes.json() as { value?: Array<{ id: string; type?: string }> }
  const bestaand = (listData.value ?? []).find(e => e.type === 'workingLocation')

  const locationBody = [locatieNaarGraphLocation(locatie)]

  if (bestaand) {
    const patchRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/events/${bestaand.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: locationBody }),
      }
    )
    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(`Werklocatie vandaag bijwerken mislukt (${patchRes.status}): ${err.error?.message ?? patchRes.statusText}`)
    }
  } else if (locatie) {
    // Geen bestaand workingLocation-event: maak een all-day vrij-event aan
    const postRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `Werklocatie: ${locatie}`,
          isAllDay: true,
          showAs: 'free',
          start: { dateTime: `${yyyy}-${mm}-${dd}T00:00:00`, timeZone: 'UTC' },
          end:   { dateTime: `${yyyy}-${mm}-${dd}T00:00:00`, timeZone: 'UTC' },
          locations: locationBody,
        }),
      }
    )
    if (!postRes.ok) {
      const err = await postRes.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(`Werklocatie vandaag aanmaken mislukt (${postRes.status}): ${err.error?.message ?? postRes.statusText}`)
    }
  }
}

/**
 * Werk het standaard werklocatieschema per dag bij via de Graph Calendar API.
 * PATCHt bestaande workingLocation-events in het komende 14-dagenvenster.
 * Nieuwe events worden niet aangemaakt (recurring events zijn complex om te creëren via de API).
 * Vereist Calendars.ReadWrite applicatiemachtiging.
 */
export async function patchWerklocatieSchema(
  upn: string,
  schema: Partial<Record<string, string>>
): Promise<void> {
  const token = await getGraphToken()
  const now = new Date()
  const start = now.toISOString().split('T')[0] + 'T00:00:00Z'
  const eind  = new Date(now.getTime() + 14 * 86_400_000).toISOString().split('T')[0] + 'T23:59:59Z'

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/calendarView` +
    `?startDateTime=${start}&endDateTime=${eind}&$select=id,subject,isAllDay,showAs&$top=200`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return // silent fail: geen kalendertoegang

  const data = await res.json() as {
    value?: Array<{ id: string; subject?: string; isAllDay?: boolean; showAs?: string }>
  }

  // Verwijder eerst eerder door de portal aangemaakte werklocatie-events in dit venster.
  const portalEventIds = (data.value ?? [])
    .filter(e =>
      (e.subject ?? '').startsWith(PORTAL_WERKLOCATIE_SUBJECT_PREFIX) &&
      e.isAllDay === true &&
      e.showAs === 'free'
    )
    .map(e => e.id)

  await Promise.allSettled(
    portalEventIds.map(eventId =>
      fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/events/${eventId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      )
    )
  )

  // Maak daarna events aan voor de komende 14 dagen op basis van weekdagschema.
  const createBodies: Array<Record<string, unknown>> = []
  for (let i = 0; i < 14; i++) {
    const dag = new Date(now.getTime() + i * 86_400_000)
    const dagNaam = dag.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase()
    const waarde = (schema[dagNaam] ?? '').trim()
    if (!waarde) continue
    const yyyy = dag.getUTCFullYear()
    const mm = String(dag.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dag.getUTCDate()).padStart(2, '0')
    createBodies.push({
      subject: `${PORTAL_WERKLOCATIE_SUBJECT_PREFIX} ${waarde}`,
      isAllDay: true,
      showAs: 'free',
      start: { dateTime: `${yyyy}-${mm}-${dd}T00:00:00`, timeZone: 'UTC' },
      end: { dateTime: `${yyyy}-${mm}-${dd}T00:00:00`, timeZone: 'UTC' },
      locations: [locatieNaarGraphLocation(waarde)],
    })
  }

  await Promise.allSettled(
    createBodies.map(body =>
      fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/events`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
    )
  )
}

/** Sla OOF-instellingen op via Microsoft Graph. */
export async function patchMailboxOof(upn: string, oof: MailboxOof): Promise<void> {
  const token = await getGraphToken()

  const payload: Record<string, unknown> = {
    automaticRepliesSetting: {
      status: oof.status,
      internalReplyMessage: oof.internalMsg,
      externalReplyMessage: oof.externalMsg,
      ...(oof.status === 'scheduled' && oof.start && oof.end
        ? {
            scheduledStartDateTime: { dateTime: oof.start.replace('Z', ''), timeZone: 'UTC' },
            scheduledEndDateTime: { dateTime: oof.end.replace('Z', ''), timeZone: 'UTC' },
          }
        : {}),
    },
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/mailboxSettings`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`OOF bijwerken mislukt (${res.status}): ${err.error?.message ?? res.statusText}`)
  }
}

/** Sla werktijden op via Microsoft Graph. Geeft verzonden waarden + wat Graph ná de PATCH teruggeeft. */
export async function patchMailboxWorkHours(
  upn: string,
  wh: MailboxWorkHours,
): Promise<{ sent: MailboxWorkHours; graphAfter: MailboxWorkHours | null }> {
  const token = await getGraphToken()

  const payload = {
    workingHours: {
      daysOfWeek: wh.days.map(toGraphDayEnum),
      startTime: `${wh.startTime}:00.0000000`,
      endTime: `${wh.endTime}:00.0000000`,
      timeZone: { name: wh.timezone },
    },
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/mailboxSettings`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Werktijden bijwerken mislukt (${res.status}): ${err.error?.message ?? res.statusText}`)
  }

  // Lees direct terug: bevestigt of Graph de waarde echt heeft opgeslagen
  try {
    const readBack = await getMailboxSettings(upn)
    return { sent: wh, graphAfter: readBack.workHours }
  } catch {
    return { sent: wh, graphAfter: null }
  }
}
