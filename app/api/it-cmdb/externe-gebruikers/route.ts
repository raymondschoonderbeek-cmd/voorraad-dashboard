import { NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'

/**
 * GET /api/it-cmdb/externe-gebruikers
 * Alle unieke externe Microsoft-gebruikers (user_id IS NULL, microsoft_synced = true)
 * die via de Microsoft-sync zijn binnengekomen maar geen portalaccount hebben.
 */
export async function GET() {
  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { data, error } = await auth.supabase
    .from('it_catalogus_gebruikers')
    .select('microsoft_email, microsoft_naam')
    .is('user_id', null)
    .eq('microsoft_synced', true)
    .not('microsoft_email', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dedupliceer op email
  const seen = new Set<string>()
  const users = (data ?? [])
    .filter((r: { microsoft_email: string | null }) => {
      if (!r.microsoft_email || seen.has(r.microsoft_email)) return false
      seen.add(r.microsoft_email)
      return true
    })
    .map((r: { microsoft_email: string; microsoft_naam: string | null }) => ({
      email: r.microsoft_email,
      naam: r.microsoft_naam,
    }))
    .sort((a: { naam: string | null; email: string }, b: { naam: string | null; email: string }) =>
      (a.naam || a.email).localeCompare(b.naam || b.email, 'nl')
    )

  return NextResponse.json({ users })
}
