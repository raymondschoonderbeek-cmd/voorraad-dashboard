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

  // Naam + manager uit gebruiker_rollen (aanvullend, geen filter)
  const { data: rollen } = await auth.supabase
    .from('gebruiker_rollen')
    .select('user_id, naam, manager_naam, manager_email')

  const rollenMap = new Map(
    (rollen ?? []).map((r: { user_id: string; naam: string; manager_naam: string | null; manager_email: string | null }) => [r.user_id, r])
  )

  // Basis is auth.users — alle gebruikers, niet alleen degenen in gebruiker_rollen
  const users = (rpcData ?? [])
    .map((r: { user_id: string; email: string }) => {
      const rol = rollenMap.get(r.user_id)
      return {
        user_id: r.user_id,
        naam: rol?.naam ?? '',
        email: r.email ?? '',
        manager_naam: rol?.manager_naam ?? null,
        manager_email: rol?.manager_email ?? null,
      }
    })
    .filter(u => u.email)

  return NextResponse.json({ users })
}
