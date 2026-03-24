import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, canAccessCampagneFietsen } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { readCampagneVoorraadSnapshot } from '@/lib/campagne-fietsen-voorraad-snapshot'

/** GET: gecachte campagne-voorraad uit Supabase (snel). Vernieuwen van de snapshot: POST .../voorraad/sync */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canAccessCampagneFietsen(supabase, user.id))) {
    return NextResponse.json({ error: 'Geen toegang tot Campagnefietsen' }, { status: 403 })
  }

  try {
    const payload = await readCampagneVoorraadSnapshot(supabase)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Laden mislukt'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
