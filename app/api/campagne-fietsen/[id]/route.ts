import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Geen id' }, { status: 400 })

  try {
    const body = await request.json().catch(() => ({}))
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const keys = ['merk', 'omschrijving_fiets', 'ean_code', 'bestelnummer_leverancier', 'kleur', 'framemaat', 'foto_url', 'active'] as const
    for (const k of keys) {
      if (k in body) {
        if (k === 'active') updates[k] = Boolean(body[k])
        else updates[k] = String(body[k] ?? '').trim()
      }
    }

    const { data, error } = await admin.supabase.from('campagne_fietsen').update(updates).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Geen id' }, { status: 400 })

  const { error } = await admin.supabase.from('campagne_fietsen').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
