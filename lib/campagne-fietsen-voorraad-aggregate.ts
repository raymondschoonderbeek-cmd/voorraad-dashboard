import { stockForCampagneFiets } from '@/lib/campagne-fiets-stock'
import {
  fetchCampagneVoorraadItemsVoorWinkel,
  getWilmarTokenForCampagne,
  resolveVoorraadBron,
  type CampagneFietsLite,
  type WinkelVoorraadBron,
} from '@/lib/campagne-fiets-voorraad-bronnen'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CampagneFietsRow = CampagneFietsLite & {
  id: string
  merk: string
  omschrijving_fiets: string
  kleur: string
  framemaat: string
  foto_url: string
  active: boolean
}

export type WinkelCampagneRow = WinkelVoorraadBron & {
  stad: string | null
  lat: number | null
  lng: number | null
}

export type PerWinkelVoorraad = {
  winkel: WinkelCampagneRow
  items: Record<string, unknown>[]
  err?: string
}

/** Maximaal N gelijktijdige upstream-calls per campagne-run */
export const CAMPAGNE_FETCH_CONCURRENCY = 8

/**
 * Pool met vaste concurrency; roept onProgress aan na elke afgeronde winkel (voor voortgang).
 */
export async function parallelMapWithProgress<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  onProgress?: (completed: number, total: number, item: T) => void | Promise<void>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  const total = items.length
  if (total === 0) return results

  let next = 0
  let completed = 0

  async function worker() {
    while (true) {
      const i = next++
      if (i >= total) return
      const item = items[i]
      const r = await fn(item)
      results[i] = r
      completed++
      await onProgress?.(completed, total, item)
    }
  }

  const n = Math.min(concurrency, total)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

export function aggregateFietsenMetWinkels(
  bikes: CampagneFietsRow[],
  perWinkel: PerWinkelVoorraad[]
): {
  fietsen: Array<
    CampagneFietsRow & {
      totaal_voorraad: number
      winkels_met_voorraad: number
      winkels: Array<{
        winkel_id: number
        naam: string
        stad: string | null
        lat: number | null
        lng: number | null
        voorraad: number
        bron: string
      }>
    }
  >
  winkel_fouten: { winkel_id: number; naam: string; message: string }[]
} {
  const winkel_fouten: { winkel_id: number; naam: string; message: string }[] = []
  for (const { winkel, err } of perWinkel) {
    if (err) winkel_fouten.push({ winkel_id: winkel.id, naam: winkel.naam, message: err })
  }

  const fietsen = bikes.map(bike => {
    const winkelDetails: Array<{
      winkel_id: number
      naam: string
      stad: string | null
      lat: number | null
      lng: number | null
      voorraad: number
      bron: string
    }> = []

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
          bron: resolveVoorraadBron(winkel),
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

  return { fietsen, winkel_fouten }
}

export async function fetchPerWinkelVoorraad(
  supabase: SupabaseClient,
  winkels: WinkelCampagneRow[],
  bikes: CampagneFietsRow[],
  onProgress?: (completed: number, total: number, winkel: WinkelCampagneRow) => void | Promise<void>
): Promise<PerWinkelVoorraad[]> {
  const needsWilmar = winkels.some(w => resolveVoorraadBron(w) === 'wilmar')
  const wilmarToken = needsWilmar ? await getWilmarTokenForCampagne() : null

  return parallelMapWithProgress(
    winkels,
    CAMPAGNE_FETCH_CONCURRENCY,
    async w => {
      const { items, err } = await fetchCampagneVoorraadItemsVoorWinkel(supabase, w, bikes, wilmarToken)
      return { winkel: w, items, err }
    },
    onProgress
  )
}
