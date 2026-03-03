import { NextResponse } from 'next/server'

const WILMAR_BASE = 'https://api.v2.wilmarinfo.nl'
const WILMAR_KEY = process.env.WILMAR_API_KEY!
const WILMAR_PASSWORD = process.env.WILMAR_PASSWORD!

async function getWilmarToken(): Promise<string> {
  const res = await fetch(`${WILMAR_BASE}/api/v1/Account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ apiKey: WILMAR_KEY, password: WILMAR_PASSWORD }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.accessToken
}

export async function GET() {
  try {
    const token = await getWilmarToken()
    const res = await fetch(`${WILMAR_BASE}/swagger.json`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json({ error: 'Swagger ophalen mislukt', detail }, { status: 502 })
    }
    const json = await res.json()
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Onbekende fout' }, { status: 502 })
  }
}