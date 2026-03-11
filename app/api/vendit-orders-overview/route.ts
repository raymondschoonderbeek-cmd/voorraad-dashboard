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
  customerOrderCreationDatetime?: string
  orderDate?: string
  customerId?: number
  orderStatusId?: number
  orderDetails?: { items?: Record<string, unknown>[] }
  [key: string]: unknown
}

/** Order datum: creationDatetime, customerOrderCreationDatetime of orderDate (Vendit API) */
function getOrderDate(o: OrderEntity): Date | null {
  const raw = o.creationDatetime ?? o.customerOrderCreationDatetime ?? o.orderDate
  if (!raw) return null
  const d = new Date(raw as string)
  return isNaN(d.getTime()) ? null : d
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
  const { winkel_id, paginationOffset = 0, includeDetails = false, dateFrom, dateTo } = body as {
    winkel_id?: number
    paginationOffset?: number
    includeDetails?: boolean
    dateFrom?: string
    dateTo?: string
  }

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

    let orders: OrderEntity[] = []
    let totalCount = 0
    let currentOffset = Number(paginationOffset) || 0

    // Probeer eerst Orders/Find; bij 400 gebruik GetAllIds + GetMultiple
    const fieldFilters: { field: number; filterComparison: number; value?: string; value2?: string }[] = []
    const fromDate = dateFrom ? new Date(dateFrom) : null
    const toDate = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : null
    if (fromDate && toDate && !isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
      fieldFilters.push({
        field: 402,
        filterComparison: 12,
        value: fromDate.toISOString(),
        value2: toDate.toISOString(),
      })
    } else if (fromDate && !isNaN(fromDate.getTime())) {
      fieldFilters.push({ field: 402, filterComparison: 4, value: fromDate.toISOString() })
    } else if (toDate && !isNaN(toDate.getTime())) {
      fieldFilters.push({ field: 402, filterComparison: 5, value: toDate.toISOString() })
    }
    const findBody = {
      paginationOffset: Number(paginationOffset) || 0,
      includeEntities: true,
      ...(fieldFilters.length > 0 && { fieldFilters }),
    }
    const findRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Orders/Find`, {
      method: 'POST',
      headers,
      body: JSON.stringify(findBody),
      cache: 'no-store',
    })
    const findData = (await findRes.json().catch(() => ({}))) as {
      entities?: OrderEntity[]
      results?: number[]
      paginationRowCount?: number
      paginationOffset?: number
      message?: string
      error?: string
    }

    if (findRes.ok) {
      orders = Array.isArray(findData.entities) ? findData.entities : []
      totalCount = findData.paginationRowCount ?? orders.length
      currentOffset = findData.paginationOffset ?? currentOffset
      if (fieldFilters.length > 0) {
        const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0
        const toTs = dateTo ? new Date(dateTo + 'T23:59:59.999Z').getTime() : Number.MAX_SAFE_INTEGER
        orders = orders.filter((o) => {
          const d = getOrderDate(o)
          if (!d) return false
          const ts = d.getTime()
          return ts >= fromTs && ts <= toTs
        })
        totalCount = orders.length
      }
    } else if (findRes.status === 400 || findRes.status === 500) {
      // Fallback: GetAllIds + GetMultiple (Find faalt vaak met filters of 500)
      const idsRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Orders/GetAllIds`, {
        method: 'GET',
        headers: { ApiKey: key, Token: token, Accept: 'application/json' },
        cache: 'no-store',
      })
      const idsRaw = await idsRes.text()
      if (!idsRes.ok) {
        let errDetail: string
        try {
          const parsed = JSON.parse(idsRaw) as { message?: string; error?: string; Message?: string }
          errDetail = parsed?.message ?? parsed?.error ?? parsed?.Message ?? idsRaw.slice(0, 200)
        } catch {
          errDetail = idsRaw.slice(0, 200)
        }
        return NextResponse.json({ error: `Order-IDs ophalen mislukt (${idsRes.status}): ${errDetail}` }, { status: 502 })
      }
      const idsData = (() => { try { return JSON.parse(idsRaw) } catch { return [] } })() as number[] | { items?: number[] }
      const allIds = Array.isArray(idsData) ? idsData : (Array.isArray(idsData?.items) ? idsData.items : [])
      const offset = Number(paginationOffset) || 0
      const hasDateFilter = !!(dateFrom || dateTo)
      const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0
      const toTs = dateTo ? new Date(dateTo + 'T23:59:59.999Z').getTime() : Number.MAX_SAFE_INTEGER

      if (hasDateFilter) {
        // Met datumfilter: haal orders in batches op, filter op orderdatum, pagineer correct
        const BATCH = 100
        const filtered: OrderEntity[] = []
        for (let i = 0; i < allIds.length; i += BATCH) {
          const batchIds = allIds.slice(i, i + BATCH)
          const multRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Orders/GetMultiple`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ primaryKeys: batchIds }),
            cache: 'no-store',
          })
          const multRaw = await multRes.text()
          if (!multRes.ok) {
            const parsed = (() => { try { return JSON.parse(multRaw) } catch { return {} } })() as { message?: string }
            return NextResponse.json({ error: `Orders ophalen mislukt: ${parsed?.message ?? multRaw.slice(0, 150)}` }, { status: 502 })
          }
          const multData = (() => { try { return JSON.parse(multRaw) } catch { return {} } })() as { items?: OrderEntity[] }
          const batch = Array.isArray(multData?.items) ? multData.items : []
          for (const o of batch) {
            const d = getOrderDate(o)
            if (!d) continue
            const ts = d.getTime()
            if (ts >= fromTs && ts <= toTs) filtered.push(o)
          }
        }
        totalCount = filtered.length
        orders = filtered.slice(offset, offset + 100)
        currentOffset = offset
      } else {
        const pageIds = allIds.slice(offset, offset + 100)
        totalCount = allIds.length
        if (pageIds.length === 0) {
          return NextResponse.json({ orders: [], totalCount, paginationOffset: offset })
        }
        const multRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Orders/GetMultiple`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ primaryKeys: pageIds }),
          cache: 'no-store',
        })
        const multRaw = await multRes.text()
        if (!multRes.ok) {
          const parsed = (() => { try { return JSON.parse(multRaw) } catch { return {} } })() as { message?: string }
          return NextResponse.json({ error: `Orders ophalen mislukt: ${parsed?.message ?? multRaw.slice(0, 150)}` }, { status: 502 })
        }
        const multData = (() => { try { return JSON.parse(multRaw) } catch { return {} } })() as { items?: OrderEntity[] }
        orders = Array.isArray(multData?.items) ? multData.items : []
        currentOffset = offset
      }
    } else {
      const errMsg = findData?.message ?? findData?.error ?? (findData as { Message?: string })?.Message ?? `Orders ophalen mislukt: ${findRes.status}. Probeer het later opnieuw.`
      return NextResponse.json({ error: errMsg }, { status: 502 })
    }

    if (orders.length === 0) {
      return NextResponse.json({
        orders: [],
        totalCount,
        paginationOffset: currentOffset,
      })
    }

    // 2. Optioneel: GetWithDetails per order voor artikel details (orderDetails)
    if (includeDetails) {
      const CONCURRENCY = 5
      const orderIds = orders.map(o => o.customerOrderHeaderId).filter((id): id is number => typeof id === 'number' && id > 0)
      const detailsResults: OrderEntity[] = []
      for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
        const batch = orderIds.slice(i, i + CONCURRENCY)
        const batchResults = await Promise.all(
          batch.map(async (id) => {
            try {
              const res = await fetch(`${VENDIT_BASE}/VenditPublicApi/Orders/GetWithDetails/${id}`, {
                method: 'GET',
                headers: { ApiKey: key, Token: token, Accept: 'application/json' },
                cache: 'no-store',
              })
              if (!res.ok) return null
              return (await res.json().catch(() => null)) as OrderEntity
            } catch {
              return null
            }
          })
        )
        detailsResults.push(...batchResults.filter((r): r is OrderEntity => r != null))
      }
      const detailsMap = new Map<number, OrderEntity>()
      for (const d of detailsResults) {
        const id = d.customerOrderHeaderId
        if (id != null) detailsMap.set(id, d)
      }
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i]
        const id = o.customerOrderHeaderId
        const full = id != null ? detailsMap.get(id) : null
        if (full) orders[i] = { ...o, ...full }
      }
    }

    // 3. Unieke customer IDs verzamelen
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

    // 4. Order status namen ophalen
    const statusIds = [...new Set(orders.map(o => o.orderStatusId).filter((id): id is number => typeof id === 'number' && id > 0))]
    const statusMap: Record<number, string> = {}
    if (statusIds.length > 0) {
      try {
        const statusRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Lookups/OrderStatuses/GetAll`, {
          method: 'GET',
          headers: { ApiKey: key, Token: token, Accept: 'application/json' },
          cache: 'no-store',
        })
        if (statusRes.ok) {
          const raw = await statusRes.json().catch(() => [])
          const statusList = Array.isArray(raw) ? raw : (Array.isArray((raw as { items?: unknown[] })?.items) ? (raw as { items: unknown[] }).items : [])
          for (const s of statusList) {
            const item = s as Record<string, unknown>
            const id = (item.orderStatusId ?? item.id) as number | undefined
            const desc = (item.description ?? item.orderStatusDescription ?? item.name) as string | undefined
            if (id != null && desc) statusMap[id] = String(desc)
          }
        }
      } catch {}
    }

    const enriched = orders.map(o => ({
      ...o,
      customerName: o.customerId ? (customersMap[o.customerId] ?? `Klant #${o.customerId}`) : '—',
      orderStatusName: o.orderStatusId != null ? (statusMap[o.orderStatusId] ?? `Status ${o.orderStatusId}`) : undefined,
    }))

    // Platgeslagen orderregels voor tabelweergave (één rij per artikel)
    let orderLines: Record<string, unknown>[] = []
    if (includeDetails) {
      for (const o of enriched) {
        const od = o.orderDetails as { items?: Record<string, unknown>[] } | Record<string, unknown>[] | undefined
        const items = Array.isArray(od) ? od : (od?.items ?? [])
        if (items.length === 0) {
          orderLines.push({ ...o, _rowType: 'order_only' })
        } else {
          for (const item of items) {
            const { orderDetails: _od, ...orderWithoutDetails } = o
            orderLines.push({
              ...orderWithoutDetails,
              ...item,
              _rowType: 'order_line',
            })
          }
        }
      }
    }

    return NextResponse.json({
      orders: enriched,
      orderLines: includeDetails ? orderLines : undefined,
      totalCount,
      paginationOffset: currentOffset,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
