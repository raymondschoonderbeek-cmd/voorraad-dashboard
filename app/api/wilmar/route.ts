import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WILMAR_BASE = 'https://api.v2.wilmarinfo.nl'
const WILMAR_KEY = process.env.WILMAR_API_KEY!
const WILMAR_PASSWORD = process.env.WILMAR_PASSWORD!

// Haal een access token op via apiKey + password
async function getWilmarToken(): Promise<string> {
  const res = await fetch(`${WILMAR_BASE}/api/v1/Account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      apiKey: WILMAR_KEY,
      password: WILMAR_PASSWORD,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Wilmar login mislukt: ${res.status} ${text}`)
  }

  const data = await res.json()
  return data.accessToken
}

function wilmarHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  let token: string
  try {
    token = await getWilmarToken()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }

  if (action === 'stores') {
    const res = await fetch(`${WILMAR_BASE}/api/v1/Stores/all`, {
      headers: wilmarHeaders(token),
    })
    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json({ error: 'Wilmar stores ophalen mislukt', status: res.status, detail }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  }

  if (action === 'stock') {
    const organisationId = searchParams.get('organisationId')
    const branchId = searchParams.get('branchId')
    const barcode = searchParams.get('barcode') ?? ''

    if (!organisationId || !branchId) {
      return NextResponse.json({ error: 'organisationId en branchId zijn verplicht' }, { status: 400 })
    }

    const url = new URL(`${WILMAR_BASE}/api/v1/Articles/Stock`)
    url.searchParams.set('organisationId', organisationId)
    url.searchParams.set('branchId', branchId)
    if (barcode) url.searchParams.set('barcode', barcode)

    const res = await fetch(url.toString(), {
      headers: wilmarHeaders(token),
    })

    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json({ error: 'Wilmar stock ophalen mislukt', status: res.status, detail }, { status: 502 })
    }

    const data = await res.json()
    const normalized = data.map((item: any) => ({
      BARCODE: item.barcode,
      STOCK: item.stock,
      AVAILABLE_STOCK: item.freeStock,
      RESERVED: item.reserved,
      SOLD: item.sold,
      _source: 'wilmar',
    }))

    return NextResponse.json(normalized)
  }

  return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
}