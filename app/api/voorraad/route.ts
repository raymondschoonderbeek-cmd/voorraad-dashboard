import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/api-middleware'

const WILMAR_BASE = 'https://api.v2.wilmarinfo.nl'
const WILMAR_KEY = process.env.WILMAR_API_KEY!
const WILMAR_PASSWORD = process.env.WILMAR_PASSWORD!

async function getWilmarToken(): Promise<string> {
  const res = await fetch(`${WILMAR_BASE}/api/v1/Account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
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
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
}

/** Haal categorienaam uit item (string of object) */
function extractCategory(item: any): string {
  const c = item?.category ?? item?.registerGroup
  if (typeof c === 'string') return c
  if (c && typeof c === 'object') return c?.name ?? c?.description ?? c?.value ?? ''
  return ''
}

/** Alleen hoofdcategorie tonen (bijv. "Fietsen" i.p.v. "Fietsen Stadsfietsen" of "Fietsen\Stadsfietsen") */
function alleenHoofdGroep(raw: any): string {
  let s = String(raw ?? '').trim()
  if (!s) return s
  // Wilmar gebruikt soms backslash als separator; normaliseer naar spaties
  s = s.replace(/\\/g, ' ').replace(/\s+/g, ' ').trim()
  const first = s.split(/\s+/)[0]
  return first || s
}

/** Aggregeer duplicaten: combinatie barcode + leverancier art. is uniek; voorraad optellen */
function aggregeerOpBarcodeEnLeverancierArt(items: any[]): any[] {
  if (!Array.isArray(items) || items.length === 0) return items
  const map = new Map<string, any>()
  for (const item of items) {
    const barcode = String(item?.BARCODE ?? item?.barcode ?? '').trim()
    const leverancierArt = String(item?.SUPPLIER_PRODUCT_NUMBER ?? item?.supplierProductNumber ?? item?.articleNumber ?? '').trim()
    const key = `${barcode}|||${leverancierArt}`
    const existing = map.get(key)
    const stock = Number(item.STOCK ?? item.stock ?? item.quantity) || 0
    const available = Number(item.AVAILABLE_STOCK ?? item.availableStock ?? item.available) || 0
    if (existing) {
      existing.STOCK = (Number(existing.STOCK) || 0) + stock
      existing.AVAILABLE_STOCK = (Number(existing.AVAILABLE_STOCK) || 0) + available
    } else {
      map.set(key, { ...item, STOCK: stock, AVAILABLE_STOCK: available })
    }
  }
  return Array.from(map.values())
}

/** Zoek op meerdere woorden: elk woord moet ergens in het item voorkomen (bijv. "gazelle grenoble" matcht merk Gazelle + product Grenoble) */
function matchesSearch(item: any, zoekterm: string): boolean {
  const words = zoekterm.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const allText = Object.values(item).map(v => String(v ?? '').toLowerCase()).join(' ')
  return words.every(word => allText.includes(word))
}

function isAuthBodyError(data: any) {
  if (!data || typeof data !== 'object') return false
  if (data?.error !== true) return false

  const msg =
    String(data?.error_message ?? data?.message ?? data?.msg ?? '')
      .toLowerCase()
      .trim()

  return msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('not authorized') || msg.includes('not authorised')
}

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const zoekterm = searchParams.get('q') || ''
    const dealerFromQuery = searchParams.get('dealer') || ''
    const winkelIdParam = searchParams.get('winkel')

    let dealerNummer = dealerFromQuery
    let bron: 'cyclesoftware' | 'wilmar' | 'vendit' | null = null
    let wilmarOrganisationId: number | null = null
    let wilmarBranchId: number | null = null

    if (winkelIdParam) {
      const winkelId = Number(winkelIdParam)
      if (!Number.isFinite(winkelId)) {
        return NextResponse.json({ error: 'Ongeldig winkel ID' }, { status: 400 })
      }

      const { data: winkel, error: winkelError } = await supabase
        .from('winkels')
        .select('*')
        .eq('id', winkelId)
        .single()

      if (winkelError) {
        console.error('Winkel laden mislukt in voorraad endpoint:', winkelError)
        return NextResponse.json({ error: 'Winkel ophalen mislukt' }, { status: 500 })
      }
      if (!winkel) {
        return NextResponse.json({ error: 'Winkel niet gevonden' }, { status: 404 })
      }

      dealerNummer = winkel.dealer_nummer || dealerNummer
      bron =
        winkel.api_type ??
        (winkel.wilmar_branch_id && winkel.wilmar_organisation_id ? 'wilmar' : 'cyclesoftware')
      wilmarOrganisationId = winkel.wilmar_organisation_id ?? null
      wilmarBranchId = winkel.wilmar_branch_id ?? null
    }

    // Standaard: als geen bron is vastgelegd, ga uit van CycleSoftware
    if (!bron) bron = 'cyclesoftware'

    // Vendit branch: voorraad uit Supabase vendit_stock op basis van dealer_nummer
    if (bron === 'vendit') {
      if (!dealerNummer) {
        return NextResponse.json({ error: 'Geen dealer opgegeven' }, { status: 400 })
      }
      const d = String(dealerNummer).trim()
      const dNorm = d.replace(/^0+/, '') || '0'
      const dealerVariants: (string | number)[] = [...new Set([d, dNorm])]
      const dNum = parseInt(dNorm, 10)
      if (!Number.isNaN(dNum)) dealerVariants.push(dNum)

      const BATCH = 1000
      let venditRows: any[] = []
      let offset = 0
      let hasMore = true
      while (hasMore) {
        const { data: batch, error: venditError } = await supabase
          .from('vendit_stock')
          .select('*')
          .in('dealer_number', dealerVariants)
          .range(offset, offset + BATCH - 1)

        if (venditError) {
          console.error('Vendit voorraad ophalen mislukt:', venditError)
          return NextResponse.json(
            { error: 'UPSTREAM_ERROR', message: 'Voorraad ophalen uit Vendit mislukt.' },
            { status: 502 }
          )
        }
        const rows = batch ?? []
        venditRows = venditRows.concat(rows)
        hasMore = rows.length === BATCH
        offset += BATCH
      }

      /** Bekende merken uit database (fallback: statische lijst) */
      const FALLBACK_BRANDS = [
        'Dutch ID', 'Van Raam', 'Sparta', 'Batavus', 'Gazelle', 'Trek', 'Specialized', 'Cannondale',
        'Giant', 'Cube', 'Kalkhoff', 'Riese & Müller', 'Stromer', 'Koga', 'Cortina', 'Papa',
        'Bergamont', 'Victoria', 'Diamant', 'Hercules', 'Kettler', 'Mongoose', 'Scott',
      ]
      const { data: brandsRows } = await supabase.from('bekende_merken').select('label')
      const fromDb = (brandsRows ?? []).map((r: any) => String(r?.label ?? '').trim()).filter(Boolean)
      const knownBrands = (fromDb.length > 0 ? fromDb : FALLBACK_BRANDS)
        .filter(b => b.length > 0)
        .sort((a, b) => b.length - a.length)

      /** Haal merk uit begin van productomschrijving (Vendit: merk staat vooraan) */
      function extractBrandFromDescription(desc: string, brandFromDb: string): string {
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

      /** Voor Vendit: strip cijfers uit group_description_1, behoud alleen tekst */
      function groepZonderCijfers(s: string): string {
        const t = String(s ?? '').trim()
        if (!t) return t
        return t.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
      }
      const items = (venditRows ?? []).map((row: any) => {
        const gro1 = row.group_description_1 ?? row.GROUP_DESCRIPTION_1 ?? row.group_name ?? row.group_description ?? row.category ?? ''
        const gro2 = row.group_description_2 ?? row.GROUP_DESCRIPTION_2 ?? row.subgroup_description ?? row.subcategory ?? ''
        const productDesc = row.product_description ?? row.PRODUCT_DESCRIPTION ?? row.name ?? row.description ?? ''
        const brandFromDb = row.brand_name ?? row.BRAND_NAME ?? row.brand ?? ''
        const brand = extractBrandFromDescription(productDesc, brandFromDb)
        return {
        PRODUCT_DESCRIPTION: productDesc,
        BRAND_NAME: brand,
        BARCODE: String(row.barcode ?? row.BARCODE ?? row.ean ?? row.EAN ?? '').trim() || '',
        ARTICLE_NUMBER: row.article_number ?? row.ARTICLE_NUMBER ?? '',
        STOCK: Number(row.stock ?? row.STOCK ?? row.quantity ?? row.qty ?? 0) || 0,
        AVAILABLE_STOCK: Number(row.available_stock ?? row.AVAILABLE_STOCK ?? row.available_stc ?? row.AVAILABLE_STC ?? row.stock ?? row.quantity ?? 0) || 0,
        SALES_PRICE_INC: row.sales_price_inc ?? row.SALES_PRICE_INC ?? row.price ?? null,
        GROUP_DESCRIPTION_1: groepZonderCijfers(gro1),
        GROUP_DESCRIPTION_1_ORIGINAL: gro1,
        GROUP_DESCRIPTION_2: gro2,
        SUPPLIER_PRODUCT_NUMBER: row.supplier_product_number ?? row.SUPPLIER_PRODUCT_NUMBER ?? row.supplier_prod ?? row.SUPPLIER_PROD ?? row.supplier_prod_stock ?? row.SUPPLIER_PROD_STOCK ?? row.article_number ?? '',
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

      let data = aggregeerOpBarcodeEnLeverancierArt(items)

      if (zoekterm && Array.isArray(data)) {
        const gefilterd = data.filter((item: any) => matchesSearch(item, zoekterm))
        return NextResponse.json(gefilterd)
      }
      return NextResponse.json(data)
    }

    // Wilmar branch
    if (bron === 'wilmar') {
      if (!wilmarOrganisationId || !wilmarBranchId) {
        return NextResponse.json(
          { error: 'CONFIG_ERROR', message: 'Winkel is als Wilmar ingesteld maar mist organisationId/branchId.' },
          { status: 400 }
        )
      }

      let token: string
      try {
        token = await getWilmarToken()
      } catch (e: any) {
        console.error('Wilmar token ophalen mislukt:', e)
        return NextResponse.json(
          { error: 'UPSTREAM_ERROR', message: 'Inloggen bij Wilmar mislukt.' },
          { status: 502 }
        )
      }

      // Haal fietsen én onderdelen parallel op
      const [bicyclesRes, partsRes] = await Promise.all([
        fetch(
          `${WILMAR_BASE}/api/v1/Bicycles?organisationId=${wilmarOrganisationId}&branchId=${wilmarBranchId}&stockState=OnStock`,
          { headers: wilmarHeaders(token), next: { revalidate: 60 } }
        ),
        fetch(
          `${WILMAR_BASE}/api/v1/Parts?organisationId=${wilmarOrganisationId}&branchId=${wilmarBranchId}`,
          { headers: wilmarHeaders(token), next: { revalidate: 60 } }
        ),
      ])

      if (!bicyclesRes.ok) {
        const detail = await bicyclesRes.text().catch(() => '')
        console.error('Wilmar fietsen fout:', bicyclesRes.status, detail)
        return NextResponse.json(
          { error: 'UPSTREAM_ERROR', message: 'Voorraad ophalen bij Wilmar mislukt.' },
          { status: 502 }
        )
      }

      const bicyclesRaw = await bicyclesRes.json().catch(() => null)
      const bicyclesList = Array.isArray(bicyclesRaw) ? bicyclesRaw : bicyclesRaw?.data ?? bicyclesRaw?.bicycles ?? []
      const bicycles = bicyclesList.map((item: any) => ({
        PRODUCT_DESCRIPTION: item.name ?? item.webshopDescription ?? '',
        BRAND_NAME: item.manufacturer ?? item.brand ?? '',
        BARCODE: item.barcode ?? item.stockBarcode ?? item.supplierBarcode ?? '',
        ARTICLE_NUMBER: item.articleNumber ?? '',
        STOCK: item.quantity ?? 1,
        AVAILABLE_STOCK: item.isReserved ? 0 : (item.quantity ?? 1),
        SALES_PRICE_INC: item.sellPrice ?? item.defaultSellPrice ?? item.recommendedSellPrice ?? null,
        GROUP_DESCRIPTION_1: alleenHoofdGroep(extractCategory(item)),
        GROUP_DESCRIPTION_2: item.registerSubGroup ?? '',
        SUPPLIER_PRODUCT_NUMBER: item.articleNumber ?? item.supplierBarcode ?? '',
        SUPPLIER_NAME: item.supplierName ?? '',
        COLOR: item.color ?? item.primaryBasicColor ?? '',
        FRAME_HEIGHT: item.frameHight ?? '',
        MODEL_YEAR: item.modelYear ?? '',
        WHEEL_SIZE: item.wheelSize ?? '',
        GEAR: item.gear ?? item.gearType ?? '',
        LOCATION: item.location ?? '',
        _type: 'fiets',
        _source: 'wilmar',
      }))

      const partsList: any[] = []
      if (partsRes.ok) {
        const partsRaw = await partsRes.json().catch(() => null)
        const rawList = Array.isArray(partsRaw) ? partsRaw : partsRaw?.data ?? partsRaw?.parts ?? []
        rawList.forEach((item: any) => {
          const stock = item.numberOnStock ?? item.totalNumberInShop ?? 0
          const reserved = item.reserved ?? 0
          if (stock > 0) {
            const catRaw = extractCategory(item) || (item.productGroup?.name ?? '')
            const cat = alleenHoofdGroep(catRaw)
            const subCat = item.size ?? item.productGroup?.sub ?? ''
            partsList.push({
              PRODUCT_DESCRIPTION: item.name ?? item.description ?? '',
              BRAND_NAME: item.brand ?? '',
              BARCODE: item.stockBarcode ?? item.catalogueBarcode ?? '',
              ARTICLE_NUMBER: item.articleNumber ?? '',
              STOCK: stock,
              AVAILABLE_STOCK: Math.max(0, stock - reserved),
              SALES_PRICE_INC: item.sellPrice ?? item.defaultSellPrice ?? null,
              GROUP_DESCRIPTION_1: cat,
              GROUP_DESCRIPTION_2: subCat,
              SUPPLIER_PRODUCT_NUMBER: item.articleNumber ?? '',
              SUPPLIER_NAME: item.supplierName ?? '',
              COLOR: item.color1 ?? item.color2 ?? item.color3 ?? '',
              FRAME_HEIGHT: item.size ?? '',
              MODEL_YEAR: '',
              WHEEL_SIZE: '',
              GEAR: '',
              LOCATION: '',
              _type: 'onderdeel',
              _source: 'wilmar',
            })
          }
        })
      }

      let data = aggregeerOpBarcodeEnLeverancierArt([...bicycles, ...partsList])

      if (zoekterm && Array.isArray(data)) {
        const gefilterd = data.filter((item: any) => matchesSearch(item, zoekterm))
        return NextResponse.json(gefilterd)
      }

      return NextResponse.json(data)
    }

    // CycleSoftware branch (default)
    if (!dealerNummer) {
      return NextResponse.json({ error: 'Geen dealer opgegeven' }, { status: 400 })
    }

    const credentials = Buffer.from(
      `${process.env.CYCLESOFTWARE_USER}:${process.env.CYCLESOFTWARE_PASS}`
    ).toString('base64')

    const response = await fetch(`${process.env.CYCLESOFTWARE_BASE_URL}/${dealerNummer}`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 60 },
    })

    // 1) HTTP auth-probleem
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          error: 'AUTH_REQUIRED',
          message: 'Deze winkel heeft nog geen toestemming gegeven om voorraad uit te lezen via CycleSoftware.',
          instructions: [
            'Log in bij CycleSoftware met het account van de winkel.',
            'Controleer/activeer API-toegang (koppeling/autorisatie voor voorraad).',
            'Sla op en probeer daarna opnieuw in het dashboard.',
          ],
        },
        { status: 403 }
      )
    }

    // 2) Andere upstream errors
    if (!response.ok) {
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'Voorraad ophalen bij CycleSoftware mislukt.' },
        { status: 502 }
      )
    }

    const data = await response.json().catch(() => null)

    // 3) Body auth-probleem (status 200 maar error true)
    if (isAuthBodyError(data)) {
      return NextResponse.json(
        {
          error: 'AUTH_REQUIRED',
          message:
            'CycleSoftware meldt dat deze winkel nog niet geautoriseerd is (Unauthorized). De winkel moet toestemming geven.',
          instructions: [
            'Log in bij CycleSoftware met het account van de winkel.',
            'Activeer/controleer de API-toestemming voor voorraad (autorisatie/koppeling).',
            'Probeer daarna opnieuw in het dashboard.',
          ],
          upstream: {
            error_message: data?.error_message ?? data?.message ?? data?.msg ?? null,
          },
        },
        { status: 403 }
      )
    }

    // 4) CycleSoftware: alleen hoofdcategorie tonen (bijv. "Fietsen" i.p.v. "Fietsen Stadsfietsen")
    const rawItems = Array.isArray(data) ? data : (data?.products ?? [])
    let items = rawItems.map((item: any) => {
      if (item && typeof item === 'object' && 'GROUP_DESCRIPTION_1' in item) {
        return { ...item, GROUP_DESCRIPTION_1: alleenHoofdGroep(item.GROUP_DESCRIPTION_1) }
      }
      return item
    })
    items = aggregeerOpBarcodeEnLeverancierArt(items)

    // 5) Filter op zoekterm
    if (zoekterm && items.length > 0) {
      const gefilterd = items.filter((item: any) => matchesSearch(item, zoekterm))
      return NextResponse.json(Array.isArray(data) ? gefilterd : { ...data, products: gefilterd })
    }

    return NextResponse.json(Array.isArray(data) ? items : { ...data, products: items })
  } catch (err: unknown) {
    console.error('Voorraad API fout:', err)
    const message = err instanceof Error ? err.message : 'Er ging iets mis bij het ophalen van de voorraad.'
    const isUpstream = /wilmar|cyclesoftware|fetch|network/i.test(message)
    return NextResponse.json(
      {
        error: isUpstream ? 'UPSTREAM_ERROR' : 'SERVER_ERROR',
        message: isUpstream ? 'De voorraad-bron is tijdelijk niet bereikbaar. Probeer het later opnieuw.' : message,
      },
      { status: 502 }
    )
  }
}