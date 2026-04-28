import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  berekenStatus,
  toIana,
  berekenVolgendeLabel,
  DEFAULT_WEEK_SCHEMA,
  type BeschikbaarheidRecord,
  type DagNaam,
} from '@/lib/beschikbaarheid'

/**
 * Publiek TV-endpoint — geen user-auth vereist.
 * Toont iedereen die vandaag werkt; OOF-medewerkers apart gemarkeerd.
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
    const oof: { naam: string; afdeling: string; terug: string | null }[] = []

    for (const rec of rows) {
      const naam = naamByUser.get(rec.user_id)
      if (!naam) continue

      const iana = toIana(rec.work_timezone ?? 'W. Europe Standard Time')
      const schema = rec.work_schedule ?? DEFAULT_WEEK_SCHEMA
      const dagNaam = now
        .toLocaleDateString('en-US', { weekday: 'long', timeZone: iana })
        .toLowerCase() as DagNaam

      // Alleen mensen die vandaag ingepland zijn
      if (!schema[dagNaam]?.enabled) continue

      const voornaam = naam.split(' ')[0] ?? naam
      const afdeling = afdelingByUser.get(rec.user_id) ?? ''
      const status = berekenStatus(rec, now)

      if (status === 'out-of-office') {
        const terug = berekenVolgendeLabel(rec, now)
        oof.push({ naam: voornaam, afdeling, terug })
      } else {
        aanwezig.push({ naam: voornaam, afdeling })
      }
    }

    aanwezig.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
    oof.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))

    return NextResponse.json(
      { aanwezig, oof },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json({ aanwezig: [], oof: [] })
  }
}
