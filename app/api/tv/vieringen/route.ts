import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type VieringType = 'jarig' | 'jubileum' | 'nieuw'

export interface VieringItem {
  type: VieringType
  naam: string
  label: string
}

/**
 * Publiek TV-endpoint — geen user-auth vereist.
 * Retourneert verjaardagen, jubilea en nieuwe medewerkers van vandaag.
 * Gebruikt admin client om RLS te omzeilen — alleen lezen.
 * Als velden niet bestaan → lege array, geen crash.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const vandaag = new Date()
    const vandaagStr = vandaag.toISOString().slice(0, 10) // YYYY-MM-DD

    const items: VieringItem[] = []

    // Probeer profielen te lezen — graceful fallback als kolommen ontbreken
    const { data: profielen, error: profError } = await supabase
      .from('profiles')
      .select('user_id, geboortedatum, in_dienst_per, weergave_naam')

    if (!profError && profielen) {
      const maand = vandaag.getMonth() + 1
      const dag = vandaag.getDate()

      for (const p of profielen) {
        const rec = p as {
          user_id: string
          geboortedatum?: string | null
          in_dienst_per?: string | null
          weergave_naam?: string | null
        }

        const naam = rec.weergave_naam ?? rec.user_id
        const voornaam = naam.split(' ')[0] ?? naam

        // Verjaardag: zelfde maand + dag
        if (rec.geboortedatum) {
          try {
            const gb = new Date(rec.geboortedatum)
            if (gb.getMonth() + 1 === maand && gb.getDate() === dag) {
              items.push({ type: 'jarig', naam: voornaam, label: 'Vandaag jarig!' })
            }
          } catch { /* ongeldige datum */ }
        }

        // In dienst vandaag (nieuw of jubileum)
        if (rec.in_dienst_per) {
          try {
            const ip = new Date(rec.in_dienst_per)
            const ipStr = rec.in_dienst_per.slice(0, 10)
            const jaren = vandaag.getFullYear() - ip.getFullYear()

            if (ipStr === vandaagStr) {
              // Eerste werkdag — welkom!
              const { data: rolData } = await supabase
                .from('gebruiker_rollen')
                .select('afdeling')
                .eq('user_id', rec.user_id)
                .single()
              const afdeling = (rolData as { afdeling?: string | null } | null)?.afdeling ?? ''
              const labelDeel = afdeling ? ` — ${afdeling}` : ''
              items.push({ type: 'nieuw', naam: voornaam, label: `Start vandaag${labelDeel}` })
            } else if (
              jaren > 0 &&
              ip.getMonth() + 1 === maand &&
              ip.getDate() === dag
            ) {
              // Jubileum
              items.push({
                type: 'jubileum',
                naam: voornaam,
                label: `${jaren} jaar in dienst`,
              })
            }
          } catch { /* ongeldige datum */ }
        }
      }
    }

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ items: [] })
  }
}
