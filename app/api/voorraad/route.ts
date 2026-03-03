import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    let bron: 'cyclesoftware' | 'wilmar' | null = null
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
      // Wilmar: alleen hoofdcategorie tonen (bijv. "Fietsen" i.p.v. "Fietsen Hybride Fietsen")
      const wilmarGroep = (raw: string) => {
        const s = String(raw ?? '').trim()
        const first = s.split(/\s+/)[0]
        return first || s
      }
      const bicycles = bicyclesList.map((item: any) => ({
        PRODUCT_DESCRIPTION: item.name ?? item.webshopDescription ?? '',
        BRAND_NAME: item.manufacturer ?? item.brand ?? '',
        BARCODE: item.barcode ?? item.stockBarcode ?? item.supplierBarcode ?? '',
        ARTICLE_NUMBER: item.articleNumber ?? '',
        STOCK: item.quantity ?? 1,
        AVAILABLE_STOCK: item.isReserved ? 0 : (item.quantity ?? 1),
        SALES_PRICE_INC: item.sellPrice ?? item.defaultSellPrice ?? item.recommendedSellPrice ?? null,
        GROUP_DESCRIPTION_1: wilmarGroep(item.category ?? item.registerGroup ?? ''),
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
            const catRaw = item.category ?? item.productGroup?.name ?? ''
            const cat = wilmarGroep(catRaw)
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

      const data = [...bicycles, ...partsList]

      if (zoekterm && Array.isArray(data)) {
        const needle = zoekterm.toLowerCase()
        const gefilterd = data.filter((item: any) =>
          Object.values(item).some(waarde => String(waarde).toLowerCase().includes(needle))
        )
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

    // 4) Normale dataflow: filter op zoekterm
    if (zoekterm && Array.isArray(data)) {
      const needle = zoekterm.toLowerCase()
      const gefilterd = data.filter((item: any) =>
        Object.values(item).some(waarde => String(waarde).toLowerCase().includes(needle))
      )
      return NextResponse.json(gefilterd)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Voorraad API fout:', err)
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: 'Er ging iets mis bij het ophalen van de voorraad.' },
      { status: 500 }
    )
  }
}