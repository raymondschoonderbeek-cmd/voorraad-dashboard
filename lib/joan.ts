const JOAN_TOKEN_URL = 'https://portal.getjoan.com/api/token/'
const JOAN_PORTAL = 'https://portal.getjoan.com/api/2.0/portal'
const JOAN_BASE = 'https://portal.getjoan.com/api/2.0'
const JOAN_V1 = 'https://portal.getjoan.com/api/v1.0'

let cachedToken: string | null = null
let tokenExpiry = 0

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const clientId = process.env.JOAN_CLIENT_ID
  const clientSecret = process.env.JOAN_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  try {
    const res = await fetch(JOAN_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) return null
    const json = await res.json() as { access_token: string; expires_in: number }
    cachedToken = json.access_token
    tokenExpiry = Date.now() + ((json.expires_in ?? 3600) - 60) * 1000
    return cachedToken
  } catch { return null }
}

type JoanEvent = {
  id: string
  summary: string
  start: string
  end: string
  organizer?: { displayName?: string; email?: string }
}

type JoanEventGroup = {
  room: { name: string; email?: string; key?: string }
  events: JoanEvent[]
}

type JoanRoomRaw = {
  id: number
  key: string
  name: string
  capacity: number
  email?: string
}

export type Boeking = { van: string; tot: string }

export type JoanRoom = {
  id: string
  naam: string
  bezet: boolean
  tot?: string
  geboektDoor?: string
  capacity: number
  boekingen: Boeking[]
}

function stripBedrijfsnaam(naam: string): string {
  return naam.replace(/\s*-\s*Dynamo Retail Group$/i, '').trim()
}

function tijdLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
}

export async function getRoomAvailability(): Promise<{ ruimtes: JoanRoom[]; joanDebug: string }> {
  const token = await getToken()
  if (!token) return { ruimtes: [], joanDebug: 'geen token' }

  const now = new Date()
  const nowIso = now.toISOString()
  const beginVanDag = new Date(); beginVanDag.setHours(0, 0, 0, 0)
  const eindVanDag = new Date(); eindVanDag.setHours(23, 59, 59, 999)

  try {
    const roomsRes = await fetch(`${JOAN_PORTAL}/rooms/`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    })

    if (!roomsRes.ok) return { ruimtes: [], joanDebug: `rooms HTTP ${roomsRes.status}` }

    const roomsJson = await roomsRes.json() as { results?: JoanRoomRaw[] } | JoanRoomRaw[]
    const rooms = Array.isArray(roomsJson) ? roomsJson : (roomsJson.results ?? [])

    if (rooms.length === 0) return { ruimtes: [], joanDebug: 'geen ruimtes' }

    // Zoek werkend events endpoint via eerste kamer
    const eerste = rooms[0] as JoanRoomRaw & { calendar?: { id?: string } }
    const calId = (eerste as { calendar?: { id?: string } }).calendar?.id
    const roomId = eerste.id

    const d = beginVanDag.toISOString().slice(0, 10)
    const tz = 'Europe/Amsterdam'
    const kandidaten = [
      // Bevestigd werkend door Joan support (2.0 API)
      `${JOAN_PORTAL}/rooms/reservations/schedule/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}&tz=${encodeURIComponent(tz)}`,
      // v1.0 events — trailing slash verplicht (bevestigd door Joan support)
      `${JOAN_V1}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
      `${JOAN_V1}/events/?start=${d}&end=${d}`,
      // Overige 2.0 kandidaten als fallback
      `${JOAN_PORTAL}/rooms/${roomId}/bookings/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
      `${JOAN_PORTAL}/rooms/${roomId}/schedule/?date=${d}`,
      `${JOAN_PORTAL}/bookings/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
      `${JOAN_PORTAL}/reservations/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
      ...(calId ? [
        `${JOAN_PORTAL}/calendars/${calId}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
        `${JOAN_BASE}/calendars/${calId}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
      ] : []),
      `${JOAN_PORTAL}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
      `${JOAN_BASE}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
    ]

    const probes: string[] = []
    let werkendPattern: string | null = null
    let eventsRaw: unknown = null

    for (const url of kandidaten) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 0 } })
      probes.push(`${url.replace(/https:\/\/portal\.getjoan\.com\/api\/2\.0\/?/, '').split('?')[0]}=${r.status}`)
      if (r.ok && !eventsRaw) {
        eventsRaw = await r.json()
        werkendPattern = url
      }
    }

    if (!werkendPattern) {
      return { ruimtes: rooms.map(r => ({ id: r.email ?? r.key, naam: r.name, bezet: false, capacity: r.capacity, boekingen: [] })), joanDebug: `events niet gevonden: ${probes.join(' | ')} | eerste: ${JSON.stringify(eerste).slice(0, 600)}` }
    }

    const rawArray: unknown[] = Array.isArray(eventsRaw) ? eventsRaw : []

    const eventsPerRuimte = new Map<string, JoanEvent[]>()
    for (const group of rawArray) {
      if (!group || typeof group !== 'object') continue
      const g = group as Record<string, unknown>

      // Haal room-key op (meerdere veldnamen proberen)
      const room = (g.room ?? g.space ?? {}) as Record<string, unknown>
      const roomKey = String(room.email ?? room.key ?? room.id ?? g.room_id ?? g.space_id ?? '')
      if (!roomKey) continue

      // events / reservations / bookings — Joan gebruikt wisselende namen
      const eventList = (Array.isArray(g.events) ? g.events : Array.isArray(g.reservations) ? g.reservations : Array.isArray(g.bookings) ? g.bookings : []) as unknown[]

      const parsed: JoanEvent[] = eventList.flatMap(ev => {
        if (!ev || typeof ev !== 'object') return []
        const e = ev as Record<string, unknown>
        const start = String(e.start ?? e.start_time ?? e.dtstart ?? '')
        const end = String(e.end ?? e.end_time ?? e.dtend ?? '')
        if (!start || !end) return []
        const org = (e.organizer ?? e.organiser ?? {}) as Record<string, unknown>
        return [{ id: String(e.id ?? ''), summary: String(e.summary ?? e.title ?? e.subject ?? ''), start, end, organizer: { displayName: String(org.displayName ?? org.name ?? ''), email: String(org.email ?? '') } }]
      })

      const gesorteerd = parsed.sort((a, b) => a.start.localeCompare(b.start))
      eventsPerRuimte.set(roomKey, gesorteerd)
    }

    const ruimtes = rooms.map(r => {
      const roomKey = r.email ?? r.key
      const events = eventsPerRuimte.get(roomKey) ?? []
      const actief = events.find(e => e.start <= nowIso && e.end > nowIso)
      const boekingen: Boeking[] = events.map(e => ({ van: tijdLabel(e.start), tot: tijdLabel(e.end) }))

      if (!actief) return { id: roomKey, naam: r.name, bezet: false, capacity: r.capacity, boekingen }

      const tot = tijdLabel(actief.end)
      const rawNaam = actief.organizer?.displayName ?? actief.organizer?.email?.split('@')[0] ?? ''
      return { id: roomKey, naam: r.name, bezet: true, tot, geboektDoor: stripBedrijfsnaam(rawNaam), capacity: r.capacity, boekingen }
    })

    return { ruimtes, joanDebug: `ok via ${werkendPattern?.split('?')[0].replace('https://portal.getjoan.com/api/2.0/', '')} | ${rooms.length} rooms, ${ruimtes.filter(r => r.bezet).length} bezet` }
  } catch (e) {
    return { ruimtes: [], joanDebug: `exception: ${String(e)}` }
  }
}
