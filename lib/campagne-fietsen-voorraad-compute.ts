import type { SupabaseClient } from '@supabase/supabase-js'
import {
  aggregateFietsenMetWinkels,
  fetchPerWinkelVoorraad,
  type CampagneFietsRow,
  type WinkelCampagneRow,
} from '@/lib/campagne-fietsen-voorraad-aggregate'

/** Live berekening (alle winkels upstream) — zelfde logica als voorheen GET /voorraad */
export async function computeCampagneVoorraadLive(
  supabase: SupabaseClient,
  options?: {
    onMeta?: (m: { fietsCount: number; totalWinkels: number }) => void
    onProgress?: (completed: number, total: number, winkel: WinkelCampagneRow) => void | Promise<void>
  }
) {
  const { data: fietsen, error: fErr } = await supabase
    .from('campagne_fietsen')
    .select('*')
    .eq('active', true)
    .order('merk')
    .order('omschrijving_fiets')

  if (fErr) throw new Error(fErr.message)
  const bikes = (fietsen ?? []) as CampagneFietsRow[]
  if (bikes.length === 0) {
    return {
      fietsen: [] as ReturnType<typeof aggregateFietsenMetWinkels>['fietsen'],
      winkel_fouten: [] as { winkel_id: number; naam: string; message: string }[],
    }
  }

  const { data: winkelsRaw, error: wErr } = await supabase
    .from('winkels')
    .select('id, naam, stad, lat, lng, kassa_nummer, api_type, wilmar_organisation_id, wilmar_branch_id')
    .order('naam')

  if (wErr) throw new Error(wErr.message)
  const winkels = (winkelsRaw ?? []) as WinkelCampagneRow[]

  options?.onMeta?.({ fietsCount: bikes.length, totalWinkels: winkels.length })

  const perWinkel = await fetchPerWinkelVoorraad(supabase, winkels, bikes, options?.onProgress)
  return aggregateFietsenMetWinkels(bikes, perWinkel)
}
