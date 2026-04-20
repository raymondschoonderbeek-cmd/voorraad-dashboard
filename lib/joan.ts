const JOAN_BASE = 'https://portal.getjoan.com/api/v1.0'

let cachedToken: string | null = null
let tokenExpiry = 0

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const clientId = process.env.JOAN_CLIENT_ID
  const clientSecret = process.env.JOAN_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  try {
    const res = await fetch(`${JOAN_BASE}/auth/token/`, {
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

export type JoanRoom = {
  id: string
  naam: string
  bezet: boolean
  tot?: string
  geboektDoor?: string
}

export async function getRoomAvailability(): Promise<JoanRoom[]> {
  const token = await getToken()
  if (!token) return []

  const now = new Date()
  const over2u = new Date(now.getTime() + 2 * 60 * 60 * 1000)

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

  const rooms = await roomsRes.json() as Array<{ id: string; name: string }>
  const events = eventsRes.ok
    ? await eventsRes.json() as Array<{
        room?: { id: string }
        start: string
        end: string
        organizer?: { displayName?: string; email?: string }
        summary?: string
      }>
    : []

  const nowIso = now.toISOString()
  const actieveEvents = events.filter(e => e.start <= nowIso && e.end > nowIso)

  return rooms.map(r => {
    const event = actieveEvents.find(e => e.room?.id === r.id)
    if (!event) return { id: r.id, naam: r.name, bezet: false }
    const tot = new Date(event.end).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    const geboektDoor = event.organizer?.displayName ?? event.organizer?.email?.split('@')[0]
    return { id: r.id, naam: r.name, bezet: true, tot, geboektDoor }
  })
}
