import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, canAccessCampagneFietsen } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { stockForCampagneFiets } from '@/lib/campagne-fiets-stock'
import {
  fetchCampagneVoorraadItemsVoorWinkel,
  getWilmarTokenForCampagne,
  resolveVoorraadBron,
  type WinkelVoorraadBron,
} from '@/lib/campagne-fiets-voorraad-bronnen'

type CampagneFietsRow = {
  id: string
  merk: string
  omschrijving_fiets: string
  ean_code: string
  bestelnummer_leverancier: string
  kleur: string
  framemaat: string
  foto_url: string
  active: boolean
}

type WinkelRow = WinkelVoorraadBron & {
  stad: string | null
  lat: number | null
  lng: number | null
}

const FETCH_CONCURRENCY = 6

async function mapInBatches<T, R>(items: T[], batchSize: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const part = await Promise.all(batch.map(fn))
    out.push(...part)
  }
  return out
}

function bronLabel(w: WinkelRow): string {
  return resolveVoorraadBron(w)
}

/** GET: voorraad campagnefietsen over alle winkels (actieve fietsen) */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canAccessCampagneFietsen(supabase, user.id))) {
    return NextResponse.json({ error: 'Geen toegang tot Campagnefietsen' }, { status: 403 })
  }

  const { data: fietsen, error: fErr } = await supabase
    .from('campagne_fietsen')
    .select('*')
    .eq('active', true)
    .order('merk')
    .order('omschrijving_fiets')

  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })
  const bikes = (fietsen ?? []) as CampagneFietsRow[]
  if (bikes.length === 0) {
    return NextResponse.json({ fietsen: [], winkel_fouten: [] })
  }

  const { data: winkelsRaw, error: wErr } = await supabase
    .from('winkels')
    .select('id, naam, stad, lat, lng, dealer_nummer, api_type, wilmar_organisation_id, wilmar_branch_id')
    .order('naam')

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })
  const winkels = (winkelsRaw ?? []) as WinkelRow[]

  const needsWilmar = winkels.some(w => resolveVoorraadBron(w) === 'wilmar')
  const wilmarToken = needsWilmar ? await getWilmarTokenForCampagne() : null

  type PerWinkel = {
    winkel: WinkelRow
    items: Record<string, unknown>[]
    err?: string
  }

  const perWinkel: PerWinkel[] = await mapInBatches(winkels, FETCH_CONCURRENCY, async w => {
    const { items, err } = await fetchCampagneVoorraadItemsVoorWinkel(supabase, w, bikes, wilmarToken)
    return { winkel: w, items, err }
  })

  const winkel_fouten: { winkel_id: number; naam: string; message: string }[] = []
  for (const { winkel, err } of perWinkel) {
    if (err) winkel_fouten.push({ winkel_id: winkel.id, naam: winkel.naam, message: err })
  }

  const fietsenOut = bikes.map(bike => {
    const winkelDetails: {
      winkel_id: number
      naam: string
      stad: string | null
      lat: number | null
      lng: number | null
      voorraad: number
      bron: string
    }[] = []

    for (const { winkel, items, err } of perWinkel) {
      if (err) continue
      const v = stockForCampagneFiets(items, bike.ean_code, bike.bestelnummer_leverancier)
      if (v > 0) {
        winkelDetails.push({
          winkel_id: winkel.id,
          naam: winkel.naam,
          stad: winkel.stad,
          lat: winkel.lat,
          lng: winkel.lng,
          voorraad: v,
          bron: bronLabel(winkel),
        })
      }
    }

    const totaal_voorraad = winkelDetails.reduce((s, w) => s + w.voorraad, 0)
    return {
      ...bike,
      totaal_voorraad,
      winkels_met_voorraad: winkelDetails.length,
      winkels: winkelDetails.sort((a, b) => b.voorraad - a.voorraad || a.naam.localeCompare(b.naam, 'nl')),
    }
  })

  return NextResponse.json({
    fietsen: fietsenOut,
    winkel_fouten,
  })
}
