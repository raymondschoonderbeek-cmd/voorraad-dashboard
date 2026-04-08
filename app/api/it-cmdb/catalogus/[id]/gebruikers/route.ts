import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { IT_CMDB_UUID_RE, assertPortalUser } from '@/lib/it-cmdb-assigned-user'

type Ctx = { params: Promise<{ id: string }> }

/** GET: alle gebruikers gekoppeld aan dit catalogus-item */
export async function GET(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  const { data, error } = await auth.supabase.rpc('it_catalogus_gebruikers_voor_item', {
    p_catalogus_id: id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gebruikers: data ?? [] })
}

/** POST: koppel een gebruiker aan dit catalogus-item */
export async function POST(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const user_id = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  if (!user_id || !IT_CMDB_UUID_RE.test(user_id)) {
    return NextResponse.json({ error: 'user_id is verplicht en moet een geldig UUID zijn' }, { status: 400 })
  }
  if (!(await assertPortalUser(auth.supabase, user_id))) {
    return NextResponse.json({ error: 'Gebruiker is geen portalgebruiker' }, { status: 400 })
  }

  const { error } = await auth.supabase.from('it_catalogus_gebruikers').insert({
    catalogus_id: id,
    user_id,
    toegewezen_door: auth.user.id,
  })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Gebruiker is al gekoppeld' }, { status: 409 })
    if (error.code === '23503') return NextResponse.json({ error: 'Catalogus-item of gebruiker niet gevonden' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/** DELETE: ontkoppel een gebruiker van dit catalogus-item via ?user_id=... */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  const user_id = new URL(request.url).searchParams.get('user_id')?.trim() ?? ''

  if (!user_id || !IT_CMDB_UUID_RE.test(user_id)) {
    return NextResponse.json({ error: 'user_id queryparameter is verplicht' }, { status: 400 })
  }

  const { error } = await auth.supabase
    .from('it_catalogus_gebruikers')
    .delete()
    .eq('catalogus_id', id)
    .eq('user_id', user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
