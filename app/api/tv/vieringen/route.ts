import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type VieringType = 'jarig' | 'jubileum' | 'hoogtepunt'

export interface VieringItem {
  type: VieringType
  naam: string
  label: string
  icoon?: string
  datum: string   // YYYY-MM-DD van de gebeurtenis dit/volgend jaar
  vandaag: boolean
}

const MAAND_NAMEN = [
  'jan','feb','mrt','apr','mei','jun',
  'jul','aug','sep','okt','nov','dec',
]

export async function GET() {
  try {
    const supabase = createAdminClient()
    const nu = new Date()
    const vandaagStr = nu.toISOString().slice(0, 10)
    const huidigJaar = nu.getFullYear()

    const eindDatum = new Date(nu)
    eindDatum.setDate(eindDatum.getDate() + 31)
    const eindDatumStr = eindDatum.toISOString().slice(0, 10)

    const items: VieringItem[] = []

    // ── Hoogtepunten ──────────────────────────────────────────────────────
    const { data: hoogtepunten } = await supabase
      .from('tv_hoogtepunten')
      .select('datum, naam, icoon, actief')
      .eq('actief', true)
      .gte('datum', vandaagStr)
      .lte('datum', eindDatumStr)
      .order('datum', { ascending: true })

    for (const h of (hoogtepunten ?? [])) {
      const rec = h as { datum: string; naam: string; icoon: string }
      const dag = parseInt(rec.datum.slice(8, 10), 10)
      const maandIdx = parseInt(rec.datum.slice(5, 7), 10) - 1
      items.push({
        type: 'hoogtepunt',
        naam: rec.naam,
        label: `${dag} ${MAAND_NAMEN[maandIdx]}`,
        icoon: rec.icoon || '📅',
        datum: rec.datum,
        vandaag: rec.datum === vandaagStr,
      })
    }

    // ── Profielen: verjaardagen + jubilea ─────────────────────────────────
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
      .select('user_id, geboortedatum, weergave_naam')

    if (!profError && profielen) {
      // Geeft de YYYY-MM-DD terug als maand+dag binnen het 31-dagenvenster valt, anders null
      function datumInVenster(maand: number, dag: number): string | null {
        const yy = String(huidigJaar)
        const mm = String(maand).padStart(2, '0')
        const dd = String(dag).padStart(2, '0')
        const dit = `${yy}-${mm}-${dd}`
        if (dit >= vandaagStr && dit <= eindDatumStr) return dit
        const volgend = `${huidigJaar + 1}-${mm}-${dd}`
        if (volgend >= vandaagStr && volgend <= eindDatumStr) return volgend
        return null
      }

      for (const p of profielen) {
        const rec = p as Record<string, unknown>
        const userId = String(rec.user_id ?? '')
        const rolInfo = rollenMap.get(userId)
        const naam = (typeof rec.weergave_naam === 'string' ? rec.weergave_naam : null)
          || rolInfo?.naam || userId
        const voornaam = naam.split(' ')[0] ?? naam

        // Verjaardag — parse direct uit string (timezone-safe)
        if (typeof rec.geboortedatum === 'string' && rec.geboortedatum) {
          try {
            const delen = rec.geboortedatum.slice(0, 10).split('-')
            const maand = parseInt(delen[1], 10)
            const dag = parseInt(delen[2], 10)
            const datum = datumInVenster(maand, dag)
            if (datum) {
              items.push({
                type: 'jarig',
                naam: voornaam,
                label: `${dag} ${MAAND_NAMEN[maand - 1]} · Verjaardag`,
                datum,
                vandaag: datum === vandaagStr,
              })
            }
          } catch { /* skip */ }
        }

      }
    }

    // Vandaag eerst, dan chronologisch op datum
    items.sort((a, b) => {
      if (a.vandaag && !b.vandaag) return -1
      if (!a.vandaag && b.vandaag) return 1
      return a.datum.localeCompare(b.datum)
    })

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ items: [] })
  }
}
