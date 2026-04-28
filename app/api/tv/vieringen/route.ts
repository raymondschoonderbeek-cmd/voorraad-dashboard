import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type VieringType = 'jarig' | 'jubileum' | 'nieuw'

export interface VieringItem {
  type: VieringType
  naam: string
  label: string
  dag: number   // dag van de maand, voor sortering en weergave
  vandaag: boolean
}

const MAAND_NAMEN = [
  'jan','feb','mrt','apr','mei','jun',
  'jul','aug','sep','okt','nov','dec',
]

/**
 * Publiek TV-endpoint — geen user-auth vereist.
 * Retourneert verjaardagen, jubilea en nieuwe medewerkers van de HUIDIGE MAAND.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const nu = new Date()
    const vandaagStr = nu.toISOString().slice(0, 10)
    const huidigeMaand = nu.getMonth() + 1
    const huidigJaar = nu.getFullYear()
    const vandaagDag = nu.getDate()

    const items: VieringItem[] = []

    const { data: profielen, error } = await supabase
      .from('profiles')
      .select('user_id, geboortedatum, in_dienst_per, weergave_naam')

    if (!error && profielen) {
      for (const p of profielen) {
        const rec = p as {
          user_id: string
          geboortedatum?: string | null
          in_dienst_per?: string | null
          weergave_naam?: string | null
        }

        const naam = rec.weergave_naam ?? rec.user_id
        const voornaam = naam.split(' ')[0] ?? naam

        // Verjaardag in huidige maand
        if (rec.geboortedatum) {
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

        // In dienst dit jaar/maand (nieuw of jubileum)
        if (rec.in_dienst_per) {
          try {
            const ip = new Date(rec.in_dienst_per)
            const ipMaand = ip.getMonth() + 1
            const ipDag = ip.getDate()
            const ipStr = rec.in_dienst_per.slice(0, 10)
            const jaren = huidigJaar - ip.getFullYear()

            if (ipMaand === huidigeMaand) {
              if (ipStr.slice(0, 7) === `${huidigJaar}-${String(huidigeMaand).padStart(2,'0')}`) {
                // Gestart deze maand dit jaar → nieuw
                const { data: rolData } = await supabase
                  .from('gebruiker_rollen')
                  .select('afdeling')
                  .eq('user_id', rec.user_id)
                  .single()
                const afdeling = (rolData as { afdeling?: string | null } | null)?.afdeling ?? ''
                const labelDeel = afdeling ? ` — ${afdeling}` : ''
                items.push({
                  type: 'nieuw',
                  naam: voornaam,
                  label: `Start ${ipDag} ${MAAND_NAMEN[huidigeMaand - 1]}${labelDeel}`,
                  dag: ipDag,
                  vandaag: ipStr === vandaagStr,
                })
              } else if (jaren > 0) {
                // Jubileum
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

    // Sorteer: vandaag eerst, dan op dag
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
