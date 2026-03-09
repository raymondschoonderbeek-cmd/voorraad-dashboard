import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

const VENDIT_OAUTH = 'https://oauth.vendit.online/Api/GetToken'
const VENDIT_BASE = 'https://api2.vendit.online'

async function getVenditToken(apiKey: string, username: string, password: string): Promise<string> {
  const params = new URLSearchParams({ apiKey, username, password })
  const res = await fetch(`${VENDIT_OAUTH}?${params}`, { method: 'POST', cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token ophalen mislukt: ${res.status} ${text}`)
  }
  const data = await res.json()
  const token = data?.access_token ?? data?.token ?? data?.accessToken
  if (!token) throw new Error('Geen token in response')
  return token
}

type OrderEntity = {
  customerOrderHeaderId?: number
  customerOrderNumber?: string
  creationDatetime?: string
  customerId?: number
  orderStatusId?: number
  [key: string]: unknown
}

type CustomerEntity = {
  customerId?: number
  id?: number
  companyName?: string
  firstName?: string
  lastName?: string
  [key: string]: unknown
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth

  const body = await request.json().catch(() => ({}))
  const { winkel_id, paginationOffset = 0 } = body as { winkel_id?: number; paginationOffset?: number }

  if (!winkel_id) {
    return NextResponse.json({ error: 'winkel_id is verplicht' }, { status: 400 })
  }

  const { data: winkel, error: winkelError } = await supabase
    .from('winkels')
    .select('id, naam, vendit_api_key, vendit_api_username, vendit_api_password, api_type')
    .eq('id', winkel_id)
    .single()

  if (winkelError || !winkel) {
    return NextResponse.json({ error: 'Winkel niet gevonden' }, { status: 404 })
  }
  if (winkel.api_type !== 'vendit_api') {
    return NextResponse.json({ error: 'Winkel is geen Vendit API-winkel.' }, { status: 400 })
  }
  const key = (winkel.vendit_api_key ?? '').trim()
  const username = (winkel.vendit_api_username ?? '').trim()
  const password = (winkel.vendit_api_password ?? '').trim()
  if (!key || !username || !password) {
    return NextResponse.json({ error: 'Vendit API credentials ontbreken.' }, { status: 400 })
  }

  try {
    const token = await getVenditToken(key, username, password)
    const headers: Record<string, string> = {
      ApiKey: key,
      Token: token,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }

    // 1. Orders/Find met includeEntities: true
    const findRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Orders/Find`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fieldFilters: [],
        paginationOffset: Number(paginationOffset) || 0,
        includeEntities: true,
      }),
      cache: 'no-store',
    })
    const findData = (await findRes.json().catch(() => ({}))) as {
      entities?: OrderEntity[]
      results?: number[]
      paginationRowCount?: number
      paginationOffset?: number
    }
    if (!findRes.ok) {
      return NextResponse.json({ error: findData?.message ?? `Orders ophalen mislukt: ${findRes.status}` }, { status: 502 })
    }

    const orders = Array.isArray(findData.entities) ? findData.entities : []
    const totalCount = findData.paginationRowCount ?? orders.length

    if (orders.length === 0) {
      return NextResponse.json({
        orders: [],
        totalCount,
        paginationOffset: findData.paginationOffset ?? paginationOffset,
      })
    }

    // 2. Unieke customer IDs verzamelen
    const customerIds = [...new Set(orders.map(o => o.customerId).filter((id): id is number => typeof id === 'number' && id > 0))]

    const customersMap: Record<number, string> = {}
    if (customerIds.length > 0) {
      const custRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Customers/GetMultiple`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ primaryKeys: customerIds }),
        cache: 'no-store',
      })
      const custData = (await custRes.json().catch(() => ({}))) as { items?: CustomerEntity[] }
      const items = Array.isArray(custData?.items) ? custData.items : []
      for (const c of items) {
        const id = c.customerId ?? c.id
        if (id != null) {
          const name = c.companyName?.trim() || [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `Klant #${id}`
          customersMap[id] = name
        }
      }
    }

    const enriched = orders.map(o => ({
      ...o,
      customerName: o.customerId ? (customersMap[o.customerId] ?? `Klant #${o.customerId}`) : '—',
    }))

    return NextResponse.json({
      orders: enriched,
      totalCount,
      paginationOffset: findData.paginationOffset ?? paginationOffset,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
