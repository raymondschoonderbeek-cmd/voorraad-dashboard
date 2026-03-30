import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  const { data, error } = await auth.supabase.from('it_cmdb_hardware').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
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

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.serial_number === 'string') update.serial_number = body.serial_number.trim()
  if (typeof body.hostname === 'string') update.hostname = body.hostname.trim()
  if (body.intune === null || typeof body.intune === 'string') update.intune = body.intune === null ? null : String(body.intune).trim() || null
  if (body.user_name === null || typeof body.user_name === 'string')
    update.user_name = body.user_name === null ? null : String(body.user_name).trim() || null
  if (body.device_type === null || typeof body.device_type === 'string')
    update.device_type = body.device_type === null ? null : String(body.device_type).trim() || null
  if (body.notes === null || typeof body.notes === 'string') update.notes = body.notes === null ? null : String(body.notes).trim() || null
  if (body.location === null || typeof body.location === 'string')
    update.location = body.location === null ? null : String(body.location).trim() || null

  if (Object.keys(update).length <= 1) {
    return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 })
  }

  const { data, error } = await auth.supabase.from('it_cmdb_hardware').update(update).eq('id', id).select('*').maybeSingle()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Dit serienummer bestaat al.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  const { error } = await auth.supabase.from('it_cmdb_hardware').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
