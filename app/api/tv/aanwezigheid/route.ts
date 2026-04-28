import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  berekenStatus,
  toIana,
  type BeschikbaarheidRecord,
} from '@/lib/beschikbaarheid'

/**
 * Publiek TV-endpoint — geen user-auth vereist.
 * Retourneert aanwezige en afwezige medewerkers op basis van beschikbaarheidsdata.
 * Gebruikt admin client om RLS te omzeilen — alleen lezen.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const now = new Date()

    const { data: beschikbaarheid, error: beschErr } = await supabase
      .from('gebruiker_beschikbaarheid')
      .select('*')

    if (beschErr) {
      return NextResponse.json({ aanwezig: [], oof: [] }, { status: 200 })
    }

    const rows = (beschikbaarheid ?? []) as BeschikbaarheidRecord[]
    const userIds = rows.map(r => r.user_id)

    if (userIds.length === 0) {
      return NextResponse.json({ aanwezig: [], oof: [] })
    }

    const { data: rollenData } = await supabase
      .from('gebruiker_rollen')
      .select('user_id, naam, afdeling')
      .in('user_id', userIds)

    const naamByUser = new Map<string, string>()
    const afdelingByUser = new Map<string, string>()
    for (const r of rollenData ?? []) {
      const rec = r as { user_id: string; naam: string | null; afdeling?: string | null }
      if (rec.naam) naamByUser.set(rec.user_id, rec.naam)
      if (rec.afdeling) afdelingByUser.set(rec.user_id, rec.afdeling)
    }

    const aanwezig: { naam: string; afdeling: string }[] = []
    const oof: { naam: string }[] = []

    for (const rec of rows) {
      const naam = naamByUser.get(rec.user_id)
      if (!naam) continue

      const iana = toIana(rec.work_timezone ?? 'W. Europe Standard Time')
      const status = berekenStatus(rec, now)

      // Extraheer alleen voornaam
      const voornaam = naam.split(' ')[0] ?? naam
      const afdeling = afdelingByUser.get(rec.user_id) ?? ''

      if (status === 'beschikbaar') {
        aanwezig.push({ naam: voornaam, afdeling })
      } else if (status === 'out-of-office') {
        oof.push({ naam: voornaam })
      }

      // Suppress unused warning on iana — used for future context
      void iana
    }

    // Max 8 aanwezigen tonen
    const aanwezigBeperkt = aanwezig.slice(0, 8)

    return NextResponse.json(
      { aanwezig: aanwezigBeperkt, oof },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ aanwezig: [], oof: [] })
  }
}
