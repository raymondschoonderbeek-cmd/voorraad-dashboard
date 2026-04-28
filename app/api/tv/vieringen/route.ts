import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type VieringType = 'jarig' | 'jubileum' | 'nieuw'

export interface VieringItem {
  type: VieringType
  naam: string
  label: string
  dag: number
  vandaag: boolean
}

const MAAND_NAMEN = [
  'jan','feb','mrt','apr','mei','jun',
  'jul','aug','sep','okt','nov','dec',
]

/**
 * Publiek TV-endpoint — maandoverzicht van verjaardagen, jubilea en nieuwe collega's.
 * Kolommen die bestaan in profiles: geboortedatum, weergave_naam, in_dienst_per (optioneel).
 * Naam fallback: gebruiker_rollen.naam.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const nu = new Date()
    const vandaagStr = nu.toISOString().slice(0, 10)
    const huidigeMaand = nu.getMonth() + 1
    const huidigJaar = nu.getFullYear()
    const vandaagDag = nu.getDate()

    // Namen ophalen uit gebruiker_rollen (bestaat altijd)
    const { data: rollen } = await supabase
      .from('gebruiker_rollen')
      .select('user_id, naam, afdeling')

    const rollenMap = new Map(
      (rollen ?? []).map((r: { user_id: string; naam: string | null; afdeling: string | null }) =>
        [r.user_id, { naam: r.naam, afdeling: r.afdeling }]
      )
    )

    // Profiles: geboortedatum + weergave_naam + optioneel in_dienst_per
    // Selecteer met * en filter client-side zodat ontbrekende kolommen geen error geven
    const { data: profielen, error: profError } = await supabase
      .from('profiles')
      .select('user_id, geboortedatum, weergave_naam, in_dienst_per')

    const items: VieringItem[] = []

    if (!profError && profielen) {
      for (const p of profielen) {
        const rec = p as Record<string, unknown>
        const userId = String(rec.user_id ?? '')
        const rolInfo = rollenMap.get(userId)
        const weergaveNaam = typeof rec.weergave_naam === 'string' ? rec.weergave_naam : null
        const naamUitRol = rolInfo?.naam ?? null
        const naam = (weergaveNaam || naamUitRol || userId)
        const voornaam = naam.split(' ')[0] ?? naam

        // Verjaardag — geboortedatum bestaat (via migratie 20260420000001)
        if (typeof rec.geboortedatum === 'string' && rec.geboortedatum) {
          try {
            const gb = new Date(rec.geboortedatum)
            if (gb.getMonth() + 1 === huidigeMaand) {
              const dag = gb.getDate()
              items.push({
                type: 'jarig',
                naam: voornaam,
                label: `Jarig op ${dag} ${MAAND_NAMEN[huidigeMaand - 1]}`,
                dag,
                vandaag: dag === vandaagDag,
              })
            }
          } catch { /* ongeldige datum */ }
        }

        // In dienst (jubileum / nieuw) — kolom optioneel, graceful skip
        const inDienstStr = typeof rec.in_dienst_per === 'string' ? rec.in_dienst_per : null
        if (inDienstStr) {
          try {
            const ip = new Date(inDienstStr)
            const ipMaand = ip.getMonth() + 1
            const ipDag = ip.getDate()
            const jaren = huidigJaar - ip.getFullYear()

            if (ipMaand === huidigeMaand) {
              const maandStr = `${huidigJaar}-${String(huidigeMaand).padStart(2, '0')}`
              if (inDienstStr.startsWith(maandStr)) {
                // Gestart deze maand dit jaar → nieuw
                const afdeling = rolInfo?.afdeling ?? ''
                const afdelingDeel = afdeling ? ` — ${afdeling}` : ''
                items.push({
                  type: 'nieuw',
                  naam: voornaam,
                  label: `Start ${ipDag} ${MAAND_NAMEN[huidigeMaand - 1]}${afdelingDeel}`,
                  dag: ipDag,
                  vandaag: inDienstStr.slice(0, 10) === vandaagStr,
                })
              } else if (jaren > 0) {
                items.push({
                  type: 'jubileum',
                  naam: voornaam,
                  label: `${jaren} jaar in dienst op ${ipDag} ${MAAND_NAMEN[huidigeMaand - 1]}`,
                  dag: ipDag,
                  vandaag: ipDag === vandaagDag,
                })
              }
            }
          } catch { /* ongeldige datum */ }
        }
      }
    }

    // Vandaag eerst, dan op dag
    items.sort((a, b) => {
      if (a.vandaag && !b.vandaag) return -1
      if (!a.vandaag && b.vandaag) return 1
      return a.dag - b.dag
    })

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ items: [] })
  }
}
