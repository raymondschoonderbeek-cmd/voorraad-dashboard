import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * Haalt adresgegevens op via PDOK Locatieserver (BAG) op basis van postcode + huisnummer.
 * GET /api/adres?postcode=1234AB&huisnummer=10
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

    if (!postcode || !huisnummer) {
      return NextResponse.json(
        { error: 'Postcode en huisnummer zijn verplicht' },
        { status: 400 }
      )
    }

    // PDOK Locatieserver - zoek op adres (type:adres voor exacte adressen)
    const q = `${postcode} ${huisnummer}`
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&fq=type:adres&rows=1`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Adres ophalen mislukt' },
        { status: 502 }
      )
    }

    const data = await res.json()
    const docs = data?.response?.docs ?? []
    const doc = docs[0]

    if (!doc) {
      return NextResponse.json(
        { error: 'Geen adres gevonden voor deze postcode en huisnummer' },
        { status: 404 }
      )
    }

    // Parse centroide_ll "POINT(lng lat)" voor coördinaten
    let lat: number | null = null
    let lng: number | null = null
    const centroide = doc.centroide_ll
    if (typeof centroide === 'string' && centroide.startsWith('POINT(')) {
      const match = centroide.match(/POINT\(([\d.-]+)\s+([\d.-]+)\)/)
      if (match) {
        lng = parseFloat(match[1])
        lat = parseFloat(match[2])
      }
    }

    const straat = doc.straatnaam?.trim() ?? ''
    const stad = doc.woonplaatsnaam ?? ''

    return NextResponse.json({
      straat: straat || null,
      stad: stad || null,
      postcode: doc.postcode ?? postcode,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      weergavenaam: doc.weergavenaam ?? null,
    })
  } catch (err) {
    console.error('Adres API fout:', err)
    return NextResponse.json(
      { error: 'Er ging iets mis bij het ophalen van het adres' },
      { status: 500 }
    )
  }
}
