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

export type JoanRoom = {
  id: string
  naam: string
  bezet: boolean
  tot?: string
  geboektDoor?: string
  capacity: number
}

function stripBedrijfsnaam(naam: string): string {
  return naam.replace(/\s*-\s*Dynamo Retail Group$/i, '').trim()
}

export async function getRoomAvailability(): Promise<{ ruimtes: JoanRoom[]; joanDebug: string }> {
  const { token, debug: tokenDebug } = await getToken()
  if (!token) return { ruimtes: [], joanDebug: tokenDebug }

  const now = new Date()
  const over2u = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const nowIso = now.toISOString()

  try {
    const [roomsRes, eventsRes] = await Promise.all([
      fetch(`${JOAN_BASE}/rooms/`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      }),
      fetch(`${JOAN_BASE}/events/?start=${now.toISOString()}&end=${over2u.toISOString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      }),
    ])

    if (!roomsRes.ok) {
      return { ruimtes: [], joanDebug: `rooms HTTP ${roomsRes.status}` }
    }

    const roomsJson = await roomsRes.json() as { results?: JoanRoomRaw[] } | JoanRoomRaw[]
    const rooms = Array.isArray(roomsJson) ? roomsJson : (roomsJson.results ?? [])

    const eventGroups: JoanEventGroup[] = eventsRes.ok ? await eventsRes.json() : []

    const actiefPerRuimte = new Map<string, JoanEvent>()
    for (const group of eventGroups) {
      const actief = group.events.find(e => e.start <= nowIso && e.end > nowIso)
      if (actief) actiefPerRuimte.set(group.room.email, actief)
    }

    const ruimtes = rooms.map(r => {
      const event = actiefPerRuimte.get(r.email)
      if (!event) return { id: r.email, naam: r.name, bezet: false, capacity: r.capacity }
      const tot = new Date(event.end).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
      const rawNaam = event.organizer?.displayName ?? event.organizer?.email?.split('@')[0] ?? ''
      const geboektDoor = stripBedrijfsnaam(rawNaam)
      return { id: r.email, naam: r.name, bezet: true, tot, geboektDoor, capacity: r.capacity }
    })

    return { ruimtes, joanDebug: `ok: ${rooms.length} rooms, ${actiefPerRuimte.size} bezet` }
  } catch (e) {
    return { ruimtes: [], joanDebug: `exception: ${String(e)}` }
  }
}
