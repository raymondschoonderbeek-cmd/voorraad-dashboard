import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type VieringType = 'jarig' | 'jubileum' | 'hoogtepunt'

export interface VieringItem {
  type: VieringType
  naam: string
  label: string
  icoon?: string   // voor hoogtepunten (emoji uit DB)
  dag: number
  vandaag: boolean
}

const MAAND_NAMEN = [
  'jan','feb','mrt','apr','mei','jun',
  'jul','aug','sep','okt','nov','dec',
]

/**
 * Publiek TV-endpoint — maandoverzicht: verjaardagen, jubilea, nieuwe collega's + hoogtepunten.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const nu = new Date()
    const vandaagStr = nu.toISOString().slice(0, 10)
    const huidigeMaand = nu.getMonth() + 1
    const huidigJaar = nu.getFullYear()
    const vandaagDag = nu.getDate()
    const maandStart = `${huidigJaar}-${String(huidigeMaand).padStart(2,'0')}-01`
    const volgendeMaand = huidigeMaand === 12 ? 1 : huidigeMaand + 1
    const volgendJaar = huidigeMaand === 12 ? huidigJaar + 1 : huidigJaar
    const maandEind = `${volgendJaar}-${String(volgendeMaand).padStart(2,'0')}-01`

    const items: VieringItem[] = []

    // ── Hoogtepunten (tv_hoogtepunten tabel) ──────────────────────────
    const { data: hoogtepunten } = await supabase
      .from('tv_hoogtepunten')
      .select('datum, naam, icoon, actief')
      .eq('actief', true)
      .gte('datum', maandStart)
      .lt('datum', maandEind)
      .order('datum', { ascending: true })

    for (const h of (hoogtepunten ?? [])) {
      const rec = h as { datum: string; naam: string; icoon: string }
      const dag = parseInt(rec.datum.slice(8, 10), 10)
      items.push({
        type: 'hoogtepunt',
        naam: rec.naam,
        label: `${dag} ${MAAND_NAMEN[huidigeMaand - 1]}`,
        icoon: rec.icoon || '📅',
        dag,
        vandaag: rec.datum === vandaagStr,
      })
    }

    // ── Profielen: verjaardagen + jubilea/nieuw ────────────────────────
    const { data: rollen } = await supabase
      .from('gebruiker_rollen')
      .select('user_id, naam, afdeling')

    const rollenMap = new Map(
      (rollen ?? []).map((r: { user_id: string; naam: string | null; afdeling: string | null }) =>
        [r.user_id, { naam: r.naam, afdeling: r.afdeling }]
      )
    )

    const { data: profielen, error: profError } = await supabase
      .from('profiles')
      .select('user_id, geboortedatum, weergave_naam, in_dienst_per')

    if (!profError && profielen) {
      for (const p of profielen) {
        const rec = p as Record<string, unknown>
        const userId = String(rec.user_id ?? '')
        const rolInfo = rollenMap.get(userId)
        const weergaveNaam = typeof rec.weergave_naam === 'string' ? rec.weergave_naam : null
        const naam = (weergaveNaam || rolInfo?.naam || userId)
        const voornaam = naam.split(' ')[0] ?? naam

        // Verjaardag
        if (typeof rec.geboortedatum === 'string' && rec.geboortedatum) {
          try {
            const gb = new Date(rec.geboortedatum)
            if (gb.getMonth() + 1 === huidigeMaand) {
              const dag = gb.getDate()
              items.push({
                type: 'jarig',
                naam: voornaam,
                label: `${dag} ${MAAND_NAMEN[huidigeMaand - 1]} · Verjaardag`,
                dag,
                vandaag: dag === vandaagDag,
              })
            }
          } catch { /* skip */ }
        }

        // Jubileum (in_dienst_per optioneel)
        const inDienstStr = typeof rec.in_dienst_per === 'string' ? rec.in_dienst_per : null
        if (inDienstStr) {
          try {
            const ip = new Date(inDienstStr)
            const ipMaand = ip.getMonth() + 1
            const ipDag = ip.getDate()
            const jaren = huidigJaar - ip.getFullYear()

            if (ipMaand === huidigeMaand && jaren > 0) {
              items.push({
                type: 'jubileum', naam: voornaam,
                label: `${ipDag} ${MAAND_NAMEN[huidigeMaand - 1]} · ${jaren} jr in dienst`,
                dag: ipDag, vandaag: ipDag === vandaagDag,
              })
            }
          } catch { /* skip */ }
        }
      }
    }

    // Filter: alleen vandaag en toekomst (verleden niet tonen)
    const gefilterd = items.filter(i => i.dag >= vandaagDag)

    // Vandaag eerst, dan chronologisch
    gefilterd.sort((a, b) => {
      if (a.vandaag && !b.vandaag) return -1
      if (!a.vandaag && b.vandaag) return 1
      return a.dag - b.dag
    })

    return NextResponse.json(
      { items: gefilterd },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ items: [] })
  }
}
