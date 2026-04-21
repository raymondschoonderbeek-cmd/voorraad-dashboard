const JOAN_TOKEN_URL = 'https://portal.getjoan.com/api/token/'
const JOAN_BASE = 'https://portal.getjoan.com/api/2.0/portal'

let cachedToken: string | null = null
let tokenExpiry = 0

type TokenResult = { token: string; debug: string } | { token: null; debug: string }

async function getToken(): Promise<TokenResult> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return { token: cachedToken, debug: 'cached' }
  }

  const clientId = process.env.JOAN_CLIENT_ID
  const clientSecret = process.env.JOAN_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { token: null, debug: 'env vars missing: ' + (!clientId ? 'JOAN_CLIENT_ID ' : '') + (!clientSecret ? 'JOAN_CLIENT_SECRET' : '') }
  }

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
    const json = await res.json() as { access_token?: string; expires_in?: number; detail?: string }
    if (!res.ok || !json.access_token) {
      return { token: null, debug: `token HTTP ${res.status}: ${JSON.stringify(json)}` }
    }
    cachedToken = json.access_token
    tokenExpiry = Date.now() + ((json.expires_in ?? 3600) - 60) * 1000
    return { token: cachedToken, debug: 'new token ok' }
  } catch (e) {
    return { token: null, debug: `token fetch exception: ${String(e)}` }
  }
}

type JoanEvent = {
  id: string
  summary: string
  start: string
  end: string
  organizer?: { displayName?: string; email?: string }
}

type JoanEventGroup = {
  room: { name: string; email: string }
  events: JoanEvent[]
}

type JoanRoomRaw = {
  name: string
  email: string
  capacity: number
  status: number
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
  const { token, debug: tokenDebug } = await getToken()
  if (!token) return { ruimtes: [], joanDebug: tokenDebug }

  const now = new Date()
  const nowIso = now.toISOString()

  // Hele dag ophalen zodat lopende boekingen (gestart voor nu) ook meekomen
  const beginVanDag = new Date()
  beginVanDag.setHours(0, 0, 0, 0)
  const eindVanDag = new Date()
  eindVanDag.setHours(23, 59, 59, 999)

  try {
    const [roomsRes, eventsRes] = await Promise.all([
      fetch(`${JOAN_BASE}/rooms/`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      }),
      fetch(`${JOAN_BASE}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      }),
    ])

    if (!roomsRes.ok) {
      return { ruimtes: [], joanDebug: `rooms HTTP ${roomsRes.status}` }
    }

    const roomsJson = await roomsRes.json() as unknown
    const roomsArr: unknown[] = Array.isArray(roomsJson) ? roomsJson
      : (roomsJson as { results?: unknown[] })?.results ?? []

    const eersteRuimte = roomsArr[0] as { id?: number; key?: string; calendar?: { id?: string } }
    const firstCalendarId = eersteRuimte?.calendar?.id
    const firstRoomId = eersteRuimte?.id

    const endpointCandidates = [
      ...(firstCalendarId ? [
        `calendars/${firstCalendarId}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
        `calendars/${firstCalendarId}/schedule/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
        `calendars/${firstCalendarId}/bookings/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
      ] : []),
      ...(firstRoomId ? [
        `rooms/${firstRoomId}/calendar/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`,
      ] : []),
    ]
    const probeResults: Record<string, number> = {}
    let eventsRaw: unknown = null

    for (const ep of endpointCandidates) {
      const r = await fetch(`${JOAN_BASE}/${ep}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      })
      probeResults[ep.split('?')[0]] = r.status
      if (r.ok && !eventsRaw) {
        eventsRaw = await r.json()
      }
    }

    const rooms = roomsArr as JoanRoomRaw[]
    const eventGroups: JoanEventGroup[] = Array.isArray(eventsRaw) ? eventsRaw : []

    // Bouw map: room email → gesorteerde events van vandaag
    const eventsPerRuimte = new Map<string, JoanEvent[]>()
    for (const group of eventGroups) {
      const gesorteerd = [...group.events].sort((a, b) => a.start.localeCompare(b.start))
      eventsPerRuimte.set(group.room.email, gesorteerd)
    }

    const ruimtes = rooms.map(r => {
      const events = eventsPerRuimte.get(r.email) ?? []
      const actief = events.find(e => e.start <= nowIso && e.end > nowIso)
      const boekingen: Boeking[] = events.map(e => ({ van: tijdLabel(e.start), tot: tijdLabel(e.end) }))

      if (!actief) {
        return { id: r.email, naam: r.name, bezet: false, capacity: r.capacity, boekingen }
      }

      const tot = tijdLabel(actief.end)
      const rawNaam = actief.organizer?.displayName ?? actief.organizer?.email?.split('@')[0] ?? ''
      const geboektDoor = stripBedrijfsnaam(rawNaam)
      return { id: r.email, naam: r.name, bezet: true, tot, geboektDoor, capacity: r.capacity, boekingen }
    })

    return { ruimtes, joanDebug: `eersteRuimte: ${JSON.stringify(eersteRuimte)} | probes: ${JSON.stringify(probeResults)} | eventsRaw: ${JSON.stringify(eventsRaw).slice(0, 400)}` }
  } catch (e) {
    return { ruimtes: [], joanDebug: `exception: ${String(e)}` }
  }
}
