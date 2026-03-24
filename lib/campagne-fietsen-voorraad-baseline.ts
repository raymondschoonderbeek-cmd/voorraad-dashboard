import type { SupabaseClient } from '@supabase/supabase-js'
import type { CampagneVoorraadPayload } from '@/lib/campagne-fietsen-voorraad-types'

type BaselineRow = { campagne_fiets_id: string; winkel_id: number; voorraad: number }

/**
 * Laadt referentievoorraad en zet per fiets/winkel: referentie, geschatte verkoop (afname), toename.
 * Mutates payload in place.
 */
export async function enrichPayloadWithBaseline(
  supabase: SupabaseClient,
  payload: CampagneVoorraadPayload
): Promise<void> {
  const { data: meta } = await supabase
    .from('campagne_fietsen_voorraad_baseline_meta')
    .select('recorded_at')
    .eq('id', 1)
    .maybeSingle()

  const raw = (meta as { recorded_at?: string | null } | null)?.recorded_at
  const recordedAt = typeof raw === 'string' && raw.length > 0 ? raw : null

  payload.baseline_recorded_at = recordedAt

  if (!recordedAt) {
    for (const f of payload.fietsen) {
      f.totaal_referentie = null
      f.verkocht_totaal = 0
      f.toename_totaal = 0
      for (const w of f.winkels) {
        w.voorraad_referentie = null
        w.verkocht = 0
        w.toename = 0
      }
    }
    return
  }

  const { data: baselineRaw, error } = await supabase
    .from('campagne_fiets_winkel_voorraad_baseline')
    .select('campagne_fiets_id, winkel_id, voorraad')

  if (error) throw new Error(error.message)

  const baselineRows = (baselineRaw ?? []) as BaselineRow[]
  const map = new Map<string, number>()
  for (const r of baselineRows) {
    map.set(`${r.campagne_fiets_id}:${r.winkel_id}`, r.voorraad)
  }

  for (const f of payload.fietsen) {
    const refsForFiets = baselineRows.filter(r => r.campagne_fiets_id === f.id)
    const totaalRef = refsForFiets.reduce((s, r) => s + r.voorraad, 0)

    const union = new Set<number>()
    for (const r of refsForFiets) union.add(r.winkel_id)
    for (const w of f.winkels) union.add(w.winkel_id)

    let verkochtTot = 0
    let toenameTot = 0
    for (const wid of union) {
      const ref = map.get(`${f.id}:${wid}`) ?? 0
      const cur = f.winkels.find(x => x.winkel_id === wid)
      const huidig = cur?.voorraad ?? 0
      verkochtTot += Math.max(0, ref - huidig)
      toenameTot += Math.max(0, huidig - ref)
    }

    f.totaal_referentie = totaalRef
    f.verkocht_totaal = verkochtTot
    f.toename_totaal = toenameTot

    for (const w of f.winkels) {
      const ref = map.get(`${f.id}:${w.winkel_id}`) ?? 0
      w.voorraad_referentie = ref
      w.verkocht = Math.max(0, ref - w.voorraad)
      w.toename = Math.max(0, w.voorraad - ref)
    }
  }
}

/** Kopieert huidige snapshot naar referentietabellen + tijdstip (service role). */
export async function persistCopyCurrentToBaseline(admin: SupabaseClient): Promise<{ recorded_at: string }> {
  const { error: delErr } = await admin.from('campagne_fiets_winkel_voorraad_baseline').delete().gte('voorraad', 0)
  if (delErr) throw new Error(delErr.message)

  const { data: rows, error: selErr } = await admin
    .from('campagne_fiets_winkel_voorraad')
    .select('campagne_fiets_id, winkel_id, voorraad, bron')

  if (selErr) throw new Error(selErr.message)

  const copy = (rows ?? []) as Array<{
    campagne_fiets_id: string
    winkel_id: number
    voorraad: number
    bron: string
  }>

  if (copy.length > 0) {
    const { error: insErr } = await admin.from('campagne_fiets_winkel_voorraad_baseline').insert(copy)
    if (insErr) throw new Error(insErr.message)
  }

  const recorded_at = new Date().toISOString()
  const { error: upErr } = await admin
    .from('campagne_fietsen_voorraad_baseline_meta')
    .upsert({ id: 1, recorded_at }, { onConflict: 'id' })
  if (upErr) throw new Error(upErr.message)

  return { recorded_at }
}

/** Verwijdert referentie (service role). */
export async function clearBaseline(admin: SupabaseClient): Promise<void> {
  const { error: delErr } = await admin.from('campagne_fiets_winkel_voorraad_baseline').delete().gte('voorraad', 0)
  if (delErr) throw new Error(delErr.message)
  const { error: upErr } = await admin
    .from('campagne_fietsen_voorraad_baseline_meta')
    .upsert({ id: 1, recorded_at: null }, { onConflict: 'id' })
  if (upErr) throw new Error(upErr.message)
}
