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
    tokenExpiry = Date.now() + (json.expires_in - 60) * 1000
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

export async function getRoomAvailability(): Promise<JoanRoom[]> {
  const token = await getToken()
  if (!token) return []

  const now = new Date()
  const over2u = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const nowIso = now.toISOString()

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

  if (!roomsRes.ok) return []

  const roomsJson = await roomsRes.json() as { results: JoanRoomRaw[] }
  const rooms = roomsJson.results ?? []

  const eventGroups: JoanEventGroup[] = eventsRes.ok ? await eventsRes.json() : []

  // Bouw map: room email → actief event op dit moment
  const actiefPerRuimte = new Map<string, JoanEvent>()
  for (const group of eventGroups) {
    const actief = group.events.find(e => e.start <= nowIso && e.end > nowIso)
    if (actief) actiefPerRuimte.set(group.room.email, actief)
  }

  return rooms.map(r => {
    const event = actiefPerRuimte.get(r.email)
    if (!event) return { id: r.email, naam: r.name, bezet: false, capacity: r.capacity }

    const tot = new Date(event.end).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
    const rawNaam = event.organizer?.displayName ?? event.organizer?.email?.split('@')[0] ?? ''
    const geboektDoor = stripBedrijfsnaam(rawNaam)

    return { id: r.email, naam: r.name, bezet: true, tot, geboektDoor, capacity: r.capacity }
  })
}
