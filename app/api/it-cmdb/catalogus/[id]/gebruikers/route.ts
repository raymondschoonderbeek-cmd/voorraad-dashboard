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
  const microsoft_email = typeof body.microsoft_email === 'string' ? body.microsoft_email.trim().toLowerCase() : ''
  const microsoft_naam = typeof body.microsoft_naam === 'string' ? body.microsoft_naam.trim() || null : null

  if (microsoft_email) {
    // Externe gebruiker (geen portalaccount)
    const { error } = await auth.supabase.from('it_catalogus_gebruikers').insert({
      catalogus_id: id,
      user_id: null,
      microsoft_email,
      microsoft_naam,
      toegewezen_door: auth.user.id,
      microsoft_synced: false, // handmatig gekoppeld
    })
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Gebruiker is al gekoppeld' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (!user_id || !IT_CMDB_UUID_RE.test(user_id)) {
    return NextResponse.json({ error: 'user_id of microsoft_email is verplicht' }, { status: 400 })
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

/** PATCH: update serienummer / datum_ingebruik voor een koppeling via ?user_id=... */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  const user_id = new URL(request.url).searchParams.get('user_id')?.trim() ?? ''
  if (!user_id || !IT_CMDB_UUID_RE.test(user_id)) {
    return NextResponse.json({ error: 'user_id queryparameter is verplicht' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if ('serienummer' in body) {
    update.serienummer = typeof body.serienummer === 'string' ? body.serienummer.trim() || null : null
  }
  if ('datum_ingebruik' in body) {
    // Verwacht ISO-datumstring (YYYY-MM-DD) of null
    if (body.datum_ingebruik === null || body.datum_ingebruik === '') {
      update.datum_ingebruik = null
    } else if (typeof body.datum_ingebruik === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.datum_ingebruik)) {
      update.datum_ingebruik = body.datum_ingebruik
    } else {
      return NextResponse.json({ error: 'datum_ingebruik moet YYYY-MM-DD zijn of null' }, { status: 400 })
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 })
  }

  const { error } = await auth.supabase
    .from('it_catalogus_gebruikers')
    .update(update)
    .eq('catalogus_id', id)
    .eq('user_id', user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE: ontkoppel een gebruiker van dit catalogus-item via ?user_id=... */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  const params = new URL(request.url).searchParams
  const user_id = params.get('user_id')?.trim() ?? ''
  const koppeling_id = params.get('koppeling_id')?.trim() ?? ''

  if (koppeling_id && IT_CMDB_UUID_RE.test(koppeling_id)) {
    // Verwijder op koppeling_id (voor externe gebruikers zonder user_id)
    const { error } = await auth.supabase
      .from('it_catalogus_gebruikers')
      .delete()
      .eq('id', koppeling_id)
      .eq('catalogus_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!user_id || !IT_CMDB_UUID_RE.test(user_id)) {
    return NextResponse.json({ error: 'user_id of koppeling_id queryparameter is verplicht' }, { status: 400 })
  }

  const { error } = await auth.supabase
    .from('it_catalogus_gebruikers')
    .delete()
    .eq('catalogus_id', id)
    .eq('user_id', user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
