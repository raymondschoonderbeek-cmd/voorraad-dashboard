import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/api-middleware'

async function haalNederlandsAdresOp(postcode: string, huisnummer: string) {
  const q = `${postcode} ${huisnummer}`
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&fq=type:adres&rows=1`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return NextResponse.json({ error: 'Adres ophalen mislukt' }, { status: 502 })
  const data = await res.json()
  const doc = data?.response?.docs?.[0]
  if (!doc) return NextResponse.json({ error: 'Geen adres gevonden voor deze postcode en huisnummer' }, { status: 404 })
  let lat: number | null = null
  let lng: number | null = null
  const centroide = doc.centroide_ll
  if (typeof centroide === 'string' && centroide.startsWith('POINT(')) {
    const match = centroide.match(/POINT\(([\d.-]+)\s+([\d.-]+)\)/)
    if (match) { lng = parseFloat(match[1]); lat = parseFloat(match[2]) }
  }
  const straat = doc.straatnaam?.trim() ?? ''
  const stad = doc.woonplaatsnaam ?? ''
  return NextResponse.json({
    straat: straat || null,
    huisnummer: huisnummer || null,
    stad: stad || null,
    postcode: doc.postcode ?? postcode,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    weergavenaam: doc.weergavenaam ?? null,
  })
}

async function haalBelgischAdresOp(postcode: string, huisnummer: string) {
  const pc = postcode.replace(/\D/g, '')
  const q = `${pc} ${huisnummer}, Belgium`
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DynamoRetailDashboard/1.0' },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return NextResponse.json({ error: 'Adres ophalen mislukt' }, { status: 502 })
  const data = await res.json()
  const item = Array.isArray(data) ? data[0] : null
  if (!item) return NextResponse.json({ error: 'Geen adres gevonden voor deze postcode en huisnummer' }, { status: 404 })
  const addr = item.address ?? {}
  const straat = (addr.road ?? addr.street ?? addr.pedestrian ?? '').trim()
  const stad = (addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? '').trim()
  const postcodeResult = addr.postcode ?? (pc || postcode)
  return NextResponse.json({
    straat: straat || null,
    huisnummer: huisnummer || null,
    stad: stad || null,
    postcode: postcodeResult ?? postcode,
    lat: Number.isFinite(parseFloat(item.lat)) ? parseFloat(item.lat) : null,
    lng: Number.isFinite(parseFloat(item.lon)) ? parseFloat(item.lon) : null,
    weergavenaam: item.display_name ?? null,
  })
}

/**
 * Haalt adresgegevens op.
 * Nederland: PDOK Locatieserver (BAG)
 * België: Nominatim (OpenStreetMap)
 * GET /api/adres?postcode=1234AB&huisnummer=10&land=Netherlands
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const postcode = (searchParams.get('postcode') ?? '').replace(/\s/g, '').toUpperCase()
    const huisnummer = (searchParams.get('huisnummer') ?? '').trim()
    const land = searchParams.get('land') === 'Belgium' ? 'Belgium' : 'Netherlands'

    if (!postcode || !huisnummer) {
      return NextResponse.json(
        { error: 'Postcode en huisnummer zijn verplicht' },
        { status: 400 }
      )
    }

    if (land === 'Belgium') {
      return await haalBelgischAdresOp(postcode, huisnummer)
    }

    return await haalNederlandsAdresOp(postcode, huisnummer)
  } catch (err: unknown) {
    console.error('Adres API fout:', err)
    return NextResponse.json(
      { error: 'Er ging iets mis bij het ophalen van het adres' },
      { status: 500 }
    )
  }
}
