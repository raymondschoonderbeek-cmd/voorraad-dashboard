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

type StockRow = {
  productId?: number
  sizeColorId?: number
  officeId?: number
  availableStock?: number
  pendingProductPurchase?: number
  reserved?: number
  productStock?: number
  [key: string]: unknown
}

type ProductEntity = {
  productId?: number
  id?: number
  productDescription?: string
  productSubdescription?: string
  productNumber?: string
  articleNumber?: string
  barcode?: string
  brandName?: string
  brandId?: number
  frameNumber?: string
  serialNumber?: string
  productSize?: string
  productColor?: string
  productType?: string
  modelSeason?: string
  recommendedSalesPriceEx?: number
  recommendedSalesPriceInc?: number
  purchasePriceEx?: number
  salesPriceEx?: number
  salesPriceInc?: number
  [key: string]: unknown
}

function extractStockItems(data: unknown): StockRow[] {
  if (Array.isArray(data)) return data as StockRow[]
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.items)) return o.items as StockRow[]
    if (Array.isArray(o.data)) return o.data as StockRow[]
  }
  return []
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth

  const body = await request.json().catch(() => ({}))
  const { winkel_id, officeId = 0 } = body as { winkel_id?: number; officeId?: number }

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
    }

    // 1. ProductStock/GetChangedStockFromDate - unixMillisec=0 = alle wijzigingen, ensureZeroIncluded=true
    const stockUrl = `${VENDIT_BASE}/VenditPublicApi/ProductStock/GetChangedStockFromDate/0/true${Number(officeId) ? `?officeId=${officeId}` : ''}`
    const stockRes = await fetch(stockUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })
    const stockData = await stockRes.json().catch(() => ({}))
    if (!stockRes.ok) {
      return NextResponse.json({ error: (stockData as { message?: string }).message ?? `Voorraad ophalen mislukt: ${stockRes.status}` }, { status: 502 })
    }

    const stockRows = extractStockItems(stockData)
    const stockWithAvailable = stockRows.filter(s => (s.availableStock ?? 0) > 0)

    if (stockWithAvailable.length === 0) {
      return NextResponse.json({
        stock: [],
        totalCount: 0,
      })
    }

    // 2. Unieke product IDs
    const productIds = [...new Set(stockWithAvailable.map(s => s.productId).filter((id): id is number => typeof id === 'number' && id > 0))]

    const productsMap: Record<number, ProductEntity> = {}
    if (productIds.length > 0) {
      const prodRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Products/GetMultiple`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryKeys: productIds }),
        cache: 'no-store',
      })
      const prodData = (await prodRes.json().catch(() => ({}))) as { items?: ProductEntity[] }
      const items = Array.isArray(prodData?.items) ? prodData.items : []
      for (const p of items) {
        const id = p.productId ?? p.id
        if (id != null) productsMap[id] = p
      }
    }

    const enriched = stockWithAvailable.map(s => {
      const p = s.productId ? productsMap[s.productId] : undefined
      const productName = p
        ? (p.productDescription?.trim() || p.productNumber?.trim() || p.articleNumber?.trim() || p.barcode?.trim() || `Product #${s.productId}`)
        : (s.productId ? `Product #${s.productId}` : '—')

      const result: Record<string, unknown> = { ...s, productName }

      if (p) {
        const get = (keys: string[]) => {
          for (const k of keys) {
            const v = (s as Record<string, unknown>)[k] ?? (p as Record<string, unknown>)[k]
            if (v != null && v !== '') return v
          }
          return undefined
        }
        const set = (key: string, val: unknown) => {
          if (val != null && val !== '') result[key] = val
        }
        const barcode = get(['barcode', 'Barcode'])
          ?? (Array.isArray(p.barcodes) && p.barcodes[0] && typeof p.barcodes[0] === 'object'
            ? (p.barcodes[0] as { barcode?: string; Barcode?: string })?.barcode ?? (p.barcodes[0] as { barcode?: string; Barcode?: string })?.Barcode : undefined)
        set('barcode', barcode)
        set('productNumber', get(['productNumber', 'ProductNumber', 'articleNumber', 'ArticleNumber']))
        set('articleNumber', get(['articleNumber', 'ArticleNumber', 'productNumber', 'ProductNumber']))
        set('brandName', get(['brandName', 'BrandName'])
          ?? (p.brand && typeof p.brand === 'object' ? (p.brand as { name?: string; brandName?: string }).name ?? (p.brand as { name?: string; brandName?: string }).brandName : undefined))
        set('frameNumber', get(['frameNumber', 'FrameNumber']))
        set('serialNumber', get(['serialNumber', 'SerialNumber']))
        set('productSubdescription', get(['productSubdescription', 'ProductSubdescription']))
        set('productSize', get(['productSize', 'ProductSize']))
        set('productColor', get(['productColor', 'ProductColor']))
        set('productType', get(['productType', 'ProductType']))
        set('modelSeason', get(['modelSeason', 'ModelSeason']))
        set('recommendedSalesPriceEx', get(['recommendedSalesPriceEx', 'RecommendedSalesPriceEx']))
        set('recommendedSalesPriceInc', get(['recommendedSalesPriceInc', 'RecommendedSalesPriceInc']))
        set('purchasePriceEx', get(['purchasePriceEx', 'PurchasePriceEx']))
        set('salesPriceEx', get(['salesPriceEx', 'SalesPriceEx']))
        set('salesPriceInc', get(['salesPriceInc', 'SalesPriceInc']))
        set('productDescription', get(['productDescription', 'ProductDescription']))
        Object.entries(p).forEach(([k, v]) => {
          if (!['productId', 'id', 'ProductId', 'Id'].includes(k) && v != null && v !== '' && !(k in result)) {
            result[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
              ? JSON.stringify(v) : v
          }
        })
      }
      return result
    })

    return NextResponse.json({
      stock: enriched,
      totalCount: enriched.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
