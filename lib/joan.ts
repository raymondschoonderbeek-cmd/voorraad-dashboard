const JOAN_TOKEN_URL = 'https://portal.getjoan.com/api/token/'
const JOAN_BASE = 'https://portal.getjoan.com/api/2.0'

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

    if (!roomsRes.ok) return { ruimtes: [], joanDebug: `rooms HTTP ${roomsRes.status}` }

    const roomsJson = await roomsRes.json() as { results?: JoanRoomRaw[] } | JoanRoomRaw[]
    const rooms = Array.isArray(roomsJson) ? roomsJson : (roomsJson.results ?? [])

    const eventGroups: JoanEventGroup[] = eventsRes.ok ? await eventsRes.json() : []

    // Rooms worden geïdentificeerd via email of key (v1=email, v2=key)
    const eventsPerRuimte = new Map<string, JoanEvent[]>()
    for (const group of eventGroups) {
      const roomKey = group.room.email ?? group.room.key ?? ''
      const gesorteerd = [...group.events].sort((a, b) => a.start.localeCompare(b.start))
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

    return { ruimtes, joanDebug: `ok: ${rooms.length} rooms, events HTTP ${eventsRes.status}, ${ruimtes.filter(r => r.bezet).length} bezet` }
  } catch (e) {
    return { ruimtes: [], joanDebug: `exception: ${String(e)}` }
  }
}
