import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * GET: alle portalgebruikers (gebruiker_rollen) met id + e-mail voor koppeling in CMDB.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { data, error } = await auth.supabase.rpc('it_cmdb_list_portal_users')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = (data ?? []).map((row: { user_id: string; email: string }) => ({
    user_id: row.user_id,
    email: row.email ?? '',
  }))
  return NextResponse.json({ users })
}
