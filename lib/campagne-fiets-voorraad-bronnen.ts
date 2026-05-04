/**
 * Voor campagnefietsen alleen relevante voorraadregels per winkel:
 * - Wilmar: GET Articles/Stock per barcode (geen volledige Bicycles/Parts)
 * - CycleSoftware: GET dealer met ?barcode= per code; bij grote response (= volledige catalogus) één keer filteren
 * - Vendit: vendit_stock met .in() op barcodes én leveranciersnummers
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseVoorraadItems } from '@/lib/campagne-fiets-stock'

const WILMAR_BASE = 'https://api.v2.wilmarinfo.nl'

export type CampagneFietsLite = {
  ean_code: string
  bestelnummer_leverancier: string
}

export type WinkelVoorraadBron = {
  id: number
  naam: string
  kassa_nummer: string | null
  api_type: string | null
  wilmar_organisation_id: number | null
  wilmar_branch_id: number | null
}

function isAuthBodyError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  if (o?.error !== true) return false
  const msg = String(o?.error_message ?? o?.message ?? o?.msg ?? '')
    .toLowerCase()
    .trim()
  return (
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('not authorized') ||
    msg.includes('not authorised')
  )
}

/** Zelfde bron-keuze als /api/voorraad */
export function resolveVoorraadBron(w: WinkelVoorraadBron): 'wilmar' | 'vendit' | 'cyclesoftware' {
  const t = w.api_type
  if (t === 'vendit' || t === 'vendit_api') return 'vendit'
  if (t === 'wilmar') return 'wilmar'
  if (w.wilmar_organisation_id && w.wilmar_branch_id) return 'wilmar'
  return 'cyclesoftware'
}

export function campaignLookupCodes(bikes: CampagneFietsLite[]): string[] {
  const s = new Set<string>()
  for (const b of bikes) {
    const e = String(b.ean_code ?? '').trim()
    const p = String(b.bestelnummer_leverancier ?? '').trim()
    if (e) s.add(e)
    if (p) s.add(p)
  }
  return [...s]
}

function dealerVariantsForVendit(dealerNummer: string): (string | number)[] {
  const d = String(dealerNummer).trim()
  const dNorm = d.replace(/^0+/, '') || '0'
  const variants: (string | number)[] = [...new Set([d, dNorm])]
  const dNum = parseInt(dNorm, 10)
  if (!Number.isNaN(dNum)) variants.push(dNum)
  return variants
}

async function getWilmarToken(): Promise<string> {
  const key = process.env.WILMAR_API_KEY
  const password = process.env.WILMAR_PASSWORD
  if (!key?.trim() || !password?.trim()) {
    throw new Error('Wilmar API niet geconfigureerd')
  }
  const res = await fetch(`${WILMAR_BASE}/api/v1/Account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ apiKey: key, password }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Wilmar login mislukt: ${res.status} ${text}`)
  }
  const data = await res.json()
  return data.accessToken as string
}

function wilmarBearer(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
}

async function fetchWilmarItemsForCodes(
  token: string,
  organisationId: number,
  branchId: number,
  codes: string[]
): Promise<{ items: Record<string, unknown>[]; err?: string }> {
  const items: Record<string, unknown>[] = []
  for (const code of codes) {
    const url = new URL(`${WILMAR_BASE}/api/v1/Articles/Stock`)
    url.searchParams.set('organisationId', String(organisationId))
    url.searchParams.set('branchId', String(branchId))
    url.searchParams.set('barcode', code)
    const res = await fetch(url.toString(), { headers: wilmarBearer(token), cache: 'no-store' })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { items: [], err: `Wilmar stock (${code}): ${res.status} ${detail.slice(0, 120)}` }
    }
    const data = await res.json().catch(() => null)
    const rows = Array.isArray(data) ? data : []
    for (const item of rows) {
      items.push({
        BARCODE: item.barcode,
        STOCK: item.stock,
        AVAILABLE_STOCK: item.freeStock,
        SUPPLIER_PRODUCT_NUMBER: item.articleNumber ?? item.supplierArticleNumber ?? '',
        _source: 'wilmar',
      })
    }
  }
  return { items }
}

const CYCLE_FULL_CATALOG_THRESHOLD = 120

async function fetchCycleSoftwareItemsForCodes(
  dealerNummer: string,
  codes: string[]
): Promise<{ items: Record<string, unknown>[]; err?: string }> {
  const base = process.env.CYCLESOFTWARE_BASE_URL?.replace(/\/$/, '')
  const user = process.env.CYCLESOFTWARE_USER
  const pass = process.env.CYCLESOFTWARE_PASS
  if (!base || !user || !pass) {
    return { items: [], err: 'CycleSoftware niet geconfigureerd' }
  }
  const credentials = Buffer.from(`${user}:${pass}`).toString('base64')
  const headers = {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
  }
  const paramName = process.env.CYCLESOFTWARE_STOCK_BARCODE_QUERY_PARAM?.trim() || 'barcode'
  const unique = [...new Set(codes.map(c => c.trim()).filter(Boolean))]
  if (unique.length === 0) return { items: [] }

  async function oneFetch(code: string): Promise<
    | { err: string; items: null }
    | { err: null; items: Record<string, unknown>[] }
  > {
    const url = new URL(`${base}/${dealerNummer}`)
    url.searchParams.set(paramName, code)
    const response = await fetch(url.toString(), { headers, cache: 'no-store' })
    if (response.status === 401 || response.status === 403) {
      return { err: 'CycleSoftware: geen API-toestemming voor deze winkel', items: null }
    }
    if (!response.ok) {
      return { err: `CycleSoftware: HTTP ${response.status}`, items: null }
    }
    const data = await response.json().catch(() => null)
    if (isAuthBodyError(data)) {
      return { err: 'CycleSoftware: niet geautoriseerd', items: null }
    }
    return { err: null, items: parseVoorraadItems(data) }
  }

  const first = await oneFetch(unique[0])
  if (first.err) return { items: [], err: first.err }
  const firstItems = first.items ?? []

  if (firstItems.length >= CYCLE_FULL_CATALOG_THRESHOLD) {
    const want = new Set(unique.map(c => c.toLowerCase()))
    const filtered = firstItems.filter(it => {
      const bc = String(it.BARCODE ?? it.barcode ?? '').trim().toLowerCase()
      const sup = String(
        it.SUPPLIER_PRODUCT_NUMBER ?? (it as Record<string, unknown>).supplierProductNumber ?? ''
      ).trim().toLowerCase()
      return (bc && want.has(bc)) || (sup && want.has(sup))
    })
    return { items: filtered }
  }

  const merged: Record<string, unknown>[] = [...firstItems]
  for (let i = 1; i < unique.length; i++) {
    const r = await oneFetch(unique[i])
    if (r.err) return { items: [], err: r.err }
    merged.push(...(r.items ?? []))
  }
  return { items: merged }
}

const FALLBACK_BRANDS = [
  'Dutch ID', 'Van Raam', 'Sparta', 'Batavus', 'Gazelle', 'Trek', 'Specialized', 'Cannondale',
  'Giant', 'Cube', 'Kalkhoff', 'Riese & Müller', 'Stromer', 'Koga', 'Cortina', 'Papa',
  'Bergamont', 'Victoria', 'Diamant', 'Hercules', 'Kettler', 'Mongoose', 'Scott',
]

function extractBrandFromDescription(desc: string, brandFromDb: string, knownBrands: string[]): string {
  if (brandFromDb?.trim()) return brandFromDb.trim()
  const d = String(desc ?? '').trim()
  if (!d) return ''
  const dLower = d.toLowerCase()
  for (const brand of knownBrands) {
    const bLower = brand.toLowerCase()
    if (dLower === bLower || dLower.startsWith(bLower + ' ') || dLower.startsWith(bLower + '\t')) {
      return brand
    }
  }
  const firstWord = d.split(/\s+/)[0] || ''
  return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase() : ''
}

function groepZonderCijfers(s: string): string {
  const t = String(s ?? '').trim()
  if (!t) return t
  return t.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
}

async function fetchVenditCampagneItems(
  supabase: SupabaseClient,
  dealerNummer: string,
  codes: string[]
): Promise<{ items: Record<string, unknown>[]; err?: string }> {
  if (!dealerNummer?.trim() || codes.length === 0) return { items: [] }

  const variants = dealerVariantsForVendit(dealerNummer)

  const { data: brandsRows } = await supabase.from('bekende_merken').select('label')
  const fromDb = (brandsRows ?? []).map((r: { label?: string }) => String(r?.label ?? '').trim()).filter(Boolean)
  const knownBrands = (fromDb.length > 0 ? fromDb : FALLBACK_BRANDS).sort((a, b) => b.length - a.length)

  const [{ data: byBarcode, error: e1 }, { data: bySupplier, error: e2 }] = await Promise.all([
    supabase.from('vendit_stock').select('*').in('dealer_number', variants).in('barcode', codes),
    supabase.from('vendit_stock').select('*').in('dealer_number', variants).in('supplier_product_number', codes),
  ])

  if (e1 && e2) {
    return { items: [], err: `Vendit: ${e1.message ?? e2.message}` }
  }

  const seen = new Set<string>()
  const rows: Record<string, unknown>[] = []
  for (const row of [...(byBarcode ?? []), ...(bySupplier ?? [])]) {
    const r = row as Record<string, unknown>
    const id = `${r.id ?? ''}:${String(r.barcode ?? '')}:${String(r.dealer_number ?? '')}:${String(r.supplier_product_number ?? '')}`
    if (seen.has(id)) continue
    seen.add(id)
    rows.push(r)
  }

  const items = rows.map(row => {
    const gro1 =
      row.group_description_1 ?? row.GROUP_DESCRIPTION_1 ?? row.group_name ?? row.group_description ?? row.category ?? ''
    const gro2 =
      row.group_description_2 ?? row.GROUP_DESCRIPTION_2 ?? row.subgroup_description ?? row.subcategory ?? ''
    const productDesc = row.product_description ?? row.PRODUCT_DESCRIPTION ?? row.name ?? row.description ?? ''
    const brandFromDb = row.brand_name ?? row.BRAND_NAME ?? row.brand ?? ''
    const brand = extractBrandFromDescription(String(productDesc), String(brandFromDb), knownBrands)
    return {
      PRODUCT_DESCRIPTION: productDesc,
      BRAND_NAME: brand,
      BARCODE: String(row.barcode ?? row.BARCODE ?? row.ean ?? row.EAN ?? '').trim() || '',
      ARTICLE_NUMBER: row.article_number ?? row.ARTICLE_NUMBER ?? '',
      STOCK: Number(row.stock ?? row.STOCK ?? row.quantity ?? row.qty ?? 0) || 0,
      AVAILABLE_STOCK:
        Number(row.available_stock ?? row.AVAILABLE_STOCK ?? row.available_stc ?? row.AVAILABLE_STC ?? row.stock ?? row.quantity ?? 0) || 0,
      SALES_PRICE_INC: row.sales_price_inc ?? row.SALES_PRICE_INC ?? row.price ?? null,
      GROUP_DESCRIPTION_1: groepZonderCijfers(String(gro1)),
      GROUP_DESCRIPTION_2: gro2,
      SUPPLIER_PRODUCT_NUMBER:
        row.supplier_product_number ??
        row.SUPPLIER_PRODUCT_NUMBER ??
        row.supplier_prod ??
        row.SUPPLIER_PROD ??
        row.supplier_prod_stock ??
        row.SUPPLIER_PROD_STOCK ??
        row.article_number ??
        '',
      SUPPLIER_NAME: row.supplier_name ?? row.SUPPLIER_NAME ?? '',
      COLOR: row.color ?? row.COLOR ?? '',
      FRAME_HEIGHT: row.frame_height ?? row.FRAME_HEIGHT ?? '',
      MODEL_YEAR: row.model_year ?? row.MODEL_YEAR ?? '',
      WHEEL_SIZE: row.wheel_size ?? row.WHEEL_SIZE ?? '',
      GEAR: row.gear ?? row.GEAR ?? '',
      LOCATION: row.location ?? row.LOCATION ?? '',
      _type: 'fiets',
      _source: 'vendit',
    }
  })

  return { items }
}

export async function fetchCampagneVoorraadItemsVoorWinkel(
  supabase: SupabaseClient,
  winkel: WinkelVoorraadBron,
  bikes: CampagneFietsLite[],
  wilmarToken: string | null
): Promise<{ items: Record<string, unknown>[]; err?: string }> {
  const codes = campaignLookupCodes(bikes)
  if (codes.length === 0) return { items: [] }

  const bron = resolveVoorraadBron(winkel)

  if (bron === 'vendit') {
    const d = String(winkel.kassa_nummer ?? '').trim()
    if (!d) return { items: [], err: 'Geen kassa_nummer' }
    return fetchVenditCampagneItems(supabase, d, codes)
  }

  if (bron === 'wilmar') {
    const org = winkel.wilmar_organisation_id
    const br = winkel.wilmar_branch_id
    if (org == null || br == null) {
      return { items: [], err: 'Wilmar: organisation/branch ontbreekt' }
    }
    if (!wilmarToken) {
      return { items: [], err: 'Wilmar: geen token' }
    }
    return fetchWilmarItemsForCodes(wilmarToken, org, br, codes)
  }

  const dealer = String(winkel.kassa_nummer ?? '').trim()
  if (!dealer) return { items: [], err: 'Geen kassa_nummer' }
  return fetchCycleSoftwareItemsForCodes(dealer, codes)
}

export async function getWilmarTokenForCampagne(): Promise<string | null> {
  try {
    return await getWilmarToken()
  } catch {
    return null
  }
}
