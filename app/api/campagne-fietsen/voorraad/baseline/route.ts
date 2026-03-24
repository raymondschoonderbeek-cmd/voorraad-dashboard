import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, canAccessCampagneFietsen } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { readCampagneVoorraadSnapshot } from '@/lib/campagne-fietsen-voorraad-snapshot'
import { clearBaseline, persistCopyCurrentToBaseline } from '@/lib/campagne-fietsen-voorraad-baseline'

/**
 * POST body: { action: 'set' } — leg huidige snapshot vast als referentie
 * POST body: { action: 'clear' } — verwijder referentie
 * Daarna: volledige payload zoals GET /voorraad (met mutaties t.o.v. referentie)
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canAccessCampagneFietsen(supabase, user.id))) {
    return NextResponse.json({ error: 'Geen toegang tot Campagnefietsen' }, { status: 403 })
  }
  if (!hasAdminKey()) {
    return NextResponse.json(
      { error: 'Referentie vastleggen vereist SUPABASE_SERVICE_ROLE_KEY op de server.' },
      { status: 503 }
    )
  }

  let body: { action?: string }
  try {
    body = (await request.json()) as { action?: string }
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const action = body.action === 'clear' ? 'clear' : 'set'

  try {
    const admin = createAdminClient()
    if (action === 'clear') {
      await clearBaseline(admin)
    } else {
      await persistCopyCurrentToBaseline(admin)
    }
    const payload = await readCampagneVoorraadSnapshot(admin)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Mislukt'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
