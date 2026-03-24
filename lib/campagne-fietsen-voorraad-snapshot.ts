import type { SupabaseClient } from '@supabase/supabase-js'
import type { CampagneFietsRow } from '@/lib/campagne-fietsen-voorraad-aggregate'
import type { CampagneVoorraadPayload } from '@/lib/campagne-fietsen-voorraad-types'
import { enrichPayloadWithBaseline } from '@/lib/campagne-fietsen-voorraad-baseline'

export type { CampagneVoorraadPayload, CampagneWinkelVoorraadRow } from '@/lib/campagne-fietsen-voorraad-types'

type SyncMetaRow = {
  last_sync_at: string | null
  winkel_fouten: unknown
}

/** Lees gecachte payload uit Supabase (snelle GET) */
export async function readCampagneVoorraadSnapshot(supabase: SupabaseClient): Promise<CampagneVoorraadPayload> {
  const { data: sync } = await supabase
    .from('campagne_fietsen_voorraad_sync')
    .select('last_sync_at, winkel_fouten')
    .eq('id', 1)
    .maybeSingle()

  const meta = sync as SyncMetaRow | null
  const winkel_fouten = Array.isArray(meta?.winkel_fouten)
    ? (meta!.winkel_fouten as CampagneVoorraadPayload['winkel_fouten'])
    : []

  const { data: bikesRaw, error: bErr } = await supabase
    .from('campagne_fietsen')
    .select('*')
    .eq('active', true)
    .order('merk')
    .order('omschrijving_fiets')

  if (bErr) throw new Error(bErr.message)
  const bikes = (bikesRaw ?? []) as CampagneFietsRow[]
  if (bikes.length === 0) {
    const empty: CampagneVoorraadPayload = {
      fietsen: [],
      winkel_fouten,
      synced_at: meta?.last_sync_at ?? null,
    }
    await enrichPayloadWithBaseline(supabase, empty)
    return empty
  }

  const bikeIds = bikes.map(b => b.id)

  const { data: rows, error: rErr } = await supabase
    .from('campagne_fiets_winkel_voorraad')
    .select('campagne_fiets_id, winkel_id, voorraad, bron')
    .in('campagne_fiets_id', bikeIds)

  if (rErr) throw new Error(rErr.message)

  const winkelIds = [...new Set((rows ?? []).map(r => (r as { winkel_id: number }).winkel_id))]
  const winkelMap = new Map<number, { naam: string; stad: string | null; lat: number | null; lng: number | null }>()
  if (winkelIds.length > 0) {
    const { data: wRows, error: wErr } = await supabase
      .from('winkels')
      .select('id, naam, stad, lat, lng')
      .in('id', winkelIds)
    if (wErr) throw new Error(wErr.message)
    for (const w of wRows ?? []) {
      const row = w as { id: number; naam: string; stad: string | null; lat: number | null; lng: number | null }
      winkelMap.set(row.id, { naam: row.naam, stad: row.stad, lat: row.lat, lng: row.lng })
    }
  }

  const byBike = new Map<
    string,
    Array<{
      winkel_id: number
      naam: string
      stad: string | null
      lat: number | null
      lng: number | null
      voorraad: number
      bron: string
    }>
  >()

  for (const raw of rows ?? []) {
    const r = raw as { campagne_fiets_id: string; winkel_id: number; voorraad: number; bron: string }
    const w = winkelMap.get(r.winkel_id)
    if (!w) continue
    const list = byBike.get(r.campagne_fiets_id) ?? []
    list.push({
      winkel_id: r.winkel_id,
      naam: w.naam,
      stad: w.stad,
      lat: w.lat,
      lng: w.lng,
      voorraad: r.voorraad,
      bron: r.bron,
    })
    byBike.set(r.campagne_fiets_id, list)
  }

  const fietsen = bikes.map(bike => {
    const winkels = (byBike.get(bike.id) ?? []).sort(
      (a, b) => b.voorraad - a.voorraad || a.naam.localeCompare(b.naam, 'nl')
    )
    const totaal_voorraad = winkels.reduce((s, w) => s + w.voorraad, 0)
    return {
      ...bike,
      totaal_voorraad,
      winkels_met_voorraad: winkels.length,
      winkels,
    }
  })

  const out: CampagneVoorraadPayload = {
    fietsen,
    winkel_fouten,
    synced_at: meta?.last_sync_at ?? null,
  }
  await enrichPayloadWithBaseline(supabase, out)
  return out
}

/** Schrijf snapshot (service role) */
export async function persistCampagneVoorraadSnapshot(
  admin: SupabaseClient,
  payload: {
    fietsen: CampagneVoorraadPayload['fietsen']
    winkel_fouten: CampagneVoorraadPayload['winkel_fouten']
  }
) {
  const { error: delErr } = await admin.from('campagne_fiets_winkel_voorraad').delete().gte('voorraad', 0)
  if (delErr) throw new Error(delErr.message)

  const rows: {
    campagne_fiets_id: string
    winkel_id: number
    voorraad: number
    bron: string
  }[] = []

  for (const f of payload.fietsen) {
    for (const w of f.winkels) {
      rows.push({
        campagne_fiets_id: f.id,
        winkel_id: w.winkel_id,
        voorraad: w.voorraad,
        bron: w.bron,
      })
    }
  }

  if (rows.length > 0) {
    const { error } = await admin.from('campagne_fiets_winkel_voorraad').insert(rows)
    if (error) throw new Error(error.message)
  }

  const { error: uErr } = await admin.from('campagne_fietsen_voorraad_sync').upsert(
    {
      id: 1,
      last_sync_at: new Date().toISOString(),
      winkel_fouten: payload.winkel_fouten,
    },
    { onConflict: 'id' }
  )
  if (uErr) throw new Error(uErr.message)
}
