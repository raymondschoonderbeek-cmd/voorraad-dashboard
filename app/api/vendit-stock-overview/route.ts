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
  groupId?: number
  productKindId?: number
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

    // 2. Unieke product IDs - ophalen in batches (API-limiet vaak ~100-200 per call)
    const productIds = [...new Set(stockWithAvailable.map(s => s.productId ?? (s as Record<string, unknown>).ProductId).filter((id): id is number => typeof id === 'number' && id > 0))]

    const productsMap: Record<number, ProductEntity> = {}
    const PRODUCT_BATCH = 100
    for (let i = 0; i < productIds.length; i += PRODUCT_BATCH) {
      const batch = productIds.slice(i, i + PRODUCT_BATCH)
      const prodRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Products/GetMultiple`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryKeys: batch }),
        cache: 'no-store',
      })
      const prodData = (await prodRes.json().catch(() => ({}))) as { items?: ProductEntity[] }
      const items = Array.isArray(prodData?.items) ? prodData.items : []
      for (const p of items) {
        const id = p.productId ?? p.id
        if (id != null) productsMap[id] = p
      }
    }

    // 3. Brands, Offices, ProductKinds, ProductGroups ophalen (parallel)
    const groupIds = [...new Set(Object.values(productsMap).map(p => p.groupId).filter((id): id is number => typeof id === 'number' && id > 0))]
    const [brandsRes, officesRes, kindsRes, groupsRes] = await Promise.all([
      fetch(`${VENDIT_BASE}/VenditPublicApi/Brands/GetAll`, { method: 'GET', headers, cache: 'no-store' }),
      fetch(`${VENDIT_BASE}/VenditPublicApi/Offices/GetAll`, { method: 'GET', headers, cache: 'no-store' }),
      fetch(`${VENDIT_BASE}/VenditPublicApi/Lookups/ProductKinds/GetAll`, { method: 'GET', headers, cache: 'no-store' }),
      groupIds.length > 0
        ? fetch(`${VENDIT_BASE}/VenditPublicApi/ProductGroups/GetMultiple`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ primaryKeys: groupIds }),
            cache: 'no-store',
          })
        : Promise.resolve({ ok: true, json: async () => ({ items: [] }) }),
    ])

    // 4. Verkoopprijzen + adviesprijs: eerst bulk (1 call), anders per-product als fallback
    const pricesMap = new Map<string, { salesPriceEx?: number; recommendedSalesPriceEx?: number }>()
    const addPrice = (pr: Record<string, unknown>) => {
      const pid = (pr.productId ?? pr.ProductId ?? 0) as number
      const oid = (pr.officeId ?? pr.OfficeId ?? 0) as number
      const scid = (pr.productSizeColorId ?? pr.ProductSizeColorId ?? 0) as number
      const key = `${pid}|${oid}|${scid}`
      const salesEx = (pr.salesPriceEx ?? pr.SalesPriceEx) as number | undefined
      const recEx = (pr.recommendedSalesPriceEx ?? pr.RecommendedSalesPriceEx) as number | undefined
      if (pid > 0) pricesMap.set(key, { salesPriceEx: salesEx, recommendedSalesPriceEx: recEx })
    }
    try {
      const pricesRes = await fetch(`${VENDIT_BASE}/VenditPublicApi/Products/GetProductSalePricesChangedSince/0`, { method: 'GET', headers, cache: 'no-store' })
      const pricesData = (await pricesRes.json().catch(() => ({}))) as { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
      const priceItems = Array.isArray(pricesData) ? pricesData : (Array.isArray((pricesData as { items?: unknown }).items) ? (pricesData as { items: Array<Record<string, unknown>> }).items : [])
      for (const pr of priceItems) addPrice(pr as Record<string, unknown>)

      // Fallback: GetProductSalePricesChangedSince levert vaak niets op → per-product GetPrices
      if (priceItems.length === 0 && productIds.length > 0) {
        const BATCH = 8
        for (let i = 0; i < productIds.length; i += BATCH) {
          const batch = productIds.slice(i, i + BATCH)
          const results = await Promise.all(batch.map(pid =>
            fetch(`${VENDIT_BASE}/VenditPublicApi/Products/${pid}/GetPrices/0/-1`, { method: 'GET', headers, cache: 'no-store' }).then(r => r.json().catch(() => ({})))
          ))
          for (let j = 0; j < batch.length; j++) {
            const pid = batch[j]
            const data = results[j]
            const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [])
            for (const pr of items) addPrice({ ...(pr as Record<string, unknown>), productId: (pr as Record<string, unknown>).productId ?? pid })
          }
        }
      }
    } catch {
      // Prijzen overslaan bij netwerkfout
    }

    const brandsMap: Record<number, string> = {}
    const brandData = (await brandsRes.json().catch(() => ({}))) as { items?: { brandId?: number; id?: number; brandName?: string; BrandName?: string }[] }
    const brandItems = Array.isArray(brandData?.items) ? brandData.items : (Array.isArray(brandData) ? brandData : [])
    for (const b of brandItems) {
      const id = b.brandId ?? (b as { id?: number }).id
      const name = b.brandName ?? (b as { BrandName?: string }).BrandName
      if (id != null && name) brandsMap[id] = String(name)
    }

    const officesMap: Record<number, string> = {}
    const officeData = (await officesRes.json().catch(() => ({}))) as { items?: { officeId?: number; id?: number; officeName?: string; OfficeName?: string }[] }
    const officeItems = Array.isArray(officeData?.items) ? officeData.items : (Array.isArray(officeData) ? officeData : [])
    for (const o of officeItems) {
      const id = o.officeId ?? (o as { id?: number }).id
      const name = o.officeName ?? (o as { OfficeName?: string }).OfficeName
      if (id != null && name) officesMap[id] = String(name)
    }

    const kindsMap: Record<number, string> = {}
    const kindsData = (await kindsRes.json().catch(() => ({}))) as { items?: { productKindId?: number; id?: number; kindDescription?: string }[] }
    const kindItems = Array.isArray(kindsData?.items) ? kindsData.items : (Array.isArray(kindsData) ? kindsData : [])
    for (const k of kindItems) {
      const id = k.productKindId ?? (k as { id?: number }).id
      const name = k.kindDescription
      if (id != null && name) kindsMap[id] = String(name)
    }

    const groupsMap: Record<number, string> = {}
    const groupsData = (await groupsRes.json().catch(() => ({}))) as { items?: { groupId?: number; id?: number; groupDescription?: string; groupName?: string }[] }
    const groupItems = Array.isArray(groupsData?.items) ? groupsData.items : []
    for (const g of groupItems) {
      const id = g.groupId ?? (g as { id?: number }).id
      const name = g.groupDescription ?? g.groupName
      if (id != null && name) groupsMap[id] = String(name)
    }

    const enriched = stockWithAvailable.map(s => {
      const pid = s.productId ?? (s as Record<string, unknown>).ProductId
      const p = pid ? productsMap[pid as number] : undefined
      const productName = p
        ? (p.productDescription?.trim() || p.productNumber?.trim() || p.articleNumber?.trim() || p.barcode?.trim() || `Product #${pid}`)
        : (pid ? `Product #${pid}` : '—')

      const result: Record<string, unknown> = { ...s, productName }
      const officeIdVal = s.officeId ?? (s as Record<string, unknown>).officeId
      if (typeof officeIdVal === 'number' && officesMap[officeIdVal]) result.officeName = officesMap[officeIdVal]

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
        const setPrice = (key: string, val: unknown) => {
          result[key] = val != null && val !== '' ? val : null
        }
        const barcode = get(['barcode', 'Barcode'])
          ?? (Array.isArray(p.barcodes) && p.barcodes[0] && typeof p.barcodes[0] === 'object'
            ? (p.barcodes[0] as { barcode?: string; Barcode?: string })?.barcode ?? (p.barcodes[0] as { barcode?: string; Barcode?: string })?.Barcode : undefined)
        set('barcode', barcode)
        set('productNumber', get(['productNumber', 'ProductNumber', 'articleNumber', 'ArticleNumber']))
        set('articleNumber', get(['articleNumber', 'ArticleNumber', 'productNumber', 'ProductNumber']))
        set('brandName', get(['brandName', 'BrandName'])
          ?? (p.brandId ? brandsMap[p.brandId] : undefined)
          ?? (p.brand && typeof p.brand === 'object' ? (p.brand as { name?: string; brandName?: string }).name ?? (p.brand as { name?: string; brandName?: string }).brandName : undefined))
        set('groupName', get(['groupName', 'GroupName']) ?? (p.groupId ? groupsMap[p.groupId] : undefined))
        set('kindDescription', get(['kindDescription', 'KindDescription']) ?? (p.productKindId ? kindsMap[p.productKindId] : undefined))
        set('frameNumber', get(['frameNumber', 'FrameNumber']))
        set('serialNumber', get(['serialNumber', 'SerialNumber']))
        set('productSubdescription', get(['productSubdescription', 'ProductSubdescription']))
        set('productSize', get(['productSize', 'ProductSize']))
        set('productColor', get(['productColor', 'ProductColor']))
        set('productType', get(['productType', 'ProductType']))
        set('modelSeason', get(['modelSeason', 'ModelSeason']))
        const pid = (s.productId ?? (s as Record<string, unknown>).ProductId ?? 0) as number
        const oid = (s.officeId ?? (s as Record<string, unknown>).officeId ?? 0) as number
        const scid = (s.sizeColorId ?? (s as Record<string, unknown>).productSizeColorId ?? 0) as number
        const priceInfo = pricesMap.get(`${pid}|${oid}|${scid}`) ?? pricesMap.get(`${pid}|${oid}|0`) ?? pricesMap.get(`${pid}|0|${scid}`) ?? pricesMap.get(`${pid}|0|0`)

        // Prijs uit API, anders uit product.salesPrices (geneste array), anders uit product zelf
        let salesEx = priceInfo?.salesPriceEx ?? get(['salesPriceEx', 'SalesPriceEx'])
        let recEx = priceInfo?.recommendedSalesPriceEx ?? get(['recommendedSalesPriceEx', 'RecommendedSalesPriceEx'])
        const salesPrices = (p as Record<string, unknown>).salesPrices ?? (p as Record<string, unknown>).productSalesPrices
        if ((salesEx == null || recEx == null) && Array.isArray(salesPrices) && salesPrices.length > 0) {
          const first = salesPrices[0] as Record<string, unknown>
          const match = salesPrices.find((sp: unknown) => {
            const x = sp as Record<string, unknown>
            const so = (x.officeId ?? x.OfficeId ?? 0) as number
            const sc = (x.productSizeColorId ?? x.ProductSizeColorId ?? 0) as number
            return (oid === 0 || so === oid) && (scid === 0 || sc === scid)
          }) as Record<string, unknown> | undefined
          const sp = match ?? (salesPrices[0] as Record<string, unknown>)
          if (salesEx == null) salesEx = (sp.salesPriceEx ?? sp.SalesPriceEx) as number | undefined
          if (recEx == null) recEx = (sp.recommendedSalesPriceEx ?? sp.RecommendedSalesPriceEx) as number | undefined
        }

        setPrice('salesPriceEx', salesEx)
        setPrice('salesPriceInc', get(['salesPriceInc', 'SalesPriceInc']))
        setPrice('recommendedSalesPriceEx', recEx)
        setPrice('recommendedSalesPriceInc', get(['recommendedSalesPriceInc', 'RecommendedSalesPriceInc']))
        setPrice('purchasePriceEx', get(['purchasePriceEx', 'PurchasePriceEx']))
        setPrice('minSalesPriceEx', get(['minSalesPriceEx', 'MinSalesPriceEx']))
        setPrice('internetSalesPriceEx', get(['internetSalesPriceEx', 'InternetSalesPriceEx']))
        setPrice('productSalesPriceEx', get(['productSalesPriceEx', 'ProductSalesPriceEx']))
        setPrice('productSalesPriceInc', get(['productSalesPriceInc', 'ProductSalesPriceInc']))
        setPrice('productPurchasePriceEx', get(['productPurchasePriceEx', 'ProductPurchasePriceEx']))
        setPrice('avgPurchasePriceEx', get(['avgPurchasePriceEx', 'AvgPurchasePriceEx', 'productAvgPurchasePriceEx']))
        setPrice('brutoPurchasePriceEx', get(['brutoPurchasePriceEx', 'BrutoPurchasePriceEx']))
        set('productDescription', get(['productDescription', 'ProductDescription']))
        set('productImageUrl', get(['productImageUrl', 'ProductImageUrl']))
        Object.entries(p).forEach(([k, v]) => {
          if (!['productId', 'id', 'ProductId', 'Id'].includes(k) && v != null && v !== '' && !(k in result)) {
            result[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
              ? JSON.stringify(v) : v
          }
        })
      } else {
        // Zonder product: prijsvelden altijd tonen (als null) zodat kolommen zichtbaar zijn
        const priceCols = ['salesPriceEx', 'salesPriceInc', 'recommendedSalesPriceEx', 'recommendedSalesPriceInc', 'purchasePriceEx', 'minSalesPriceEx', 'internetSalesPriceEx', 'productSalesPriceEx', 'productSalesPriceInc', 'productPurchasePriceEx', 'avgPurchasePriceEx', 'brutoPurchasePriceEx']
        for (const k of priceCols) result[k] = null
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
