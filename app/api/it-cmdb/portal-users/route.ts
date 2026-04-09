import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * GET: alle portalgebruikers (gebruiker_rollen) met id + e-mail + naam + manager.
 * Toegankelijk voor iedereen met it-cmdb module toegang (geen admin vereist).
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  // Basis: email via RPC (leest auth.users)
  const { data: rpcData, error: rpcError } = await auth.supabase.rpc('it_cmdb_list_portal_users')
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

  const emailMap = new Map<string, string>(
    (rpcData ?? []).map((r: { user_id: string; email: string }) => [r.user_id, r.email ?? ''])
  )

  // Naam + manager uit gebruiker_rollen
  const { data: rollen } = await auth.supabase
    .from('gebruiker_rollen')
    .select('user_id, naam, manager_naam, manager_email')

  const users = (rollen ?? []).map((r: { user_id: string; naam: string; manager_naam: string | null; manager_email: string | null }) => ({
    user_id: r.user_id,
    naam: r.naam ?? '',
    email: emailMap.get(r.user_id) ?? '',
    manager_naam: r.manager_naam ?? null,
    manager_email: r.manager_email ?? null,
  })).filter(u => u.email)

  return NextResponse.json({ users })
}
