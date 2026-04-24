import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const { data } = await auth.supabase
    .from('gazelle_observer_instellingen')
    .select('webhook_secret, actief, pakket_instellingen, google_sheet_url, updated_at')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json(data ?? { webhook_secret: null, actief: true, pakket_instellingen: {}, google_sheet_url: null })
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const body = await request.json() as {
    genereer_secret?: boolean
    actief?: boolean
    pakket_instellingen?: Record<string, { beschikbaar: boolean; omschrijving: string }>
    google_sheet_url?: string | null
  }
  const admin = createAdminClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.genereer_secret) updates.webhook_secret = randomBytes(32).toString('hex')
  if (typeof body.actief === 'boolean') updates.actief = body.actief
  if (body.pakket_instellingen) updates.pakket_instellingen = body.pakket_instellingen
  if ('google_sheet_url' in body) updates.google_sheet_url = body.google_sheet_url ?? null

  const { error } = await admin
    .from('gazelle_observer_instellingen')
    .upsert({ id: 1, ...updates }, { onConflict: 'id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = await admin
    .from('gazelle_observer_instellingen')
    .select('webhook_secret, actief, pakket_instellingen, google_sheet_url')
    .eq('id', 1)
    .single()

  return NextResponse.json({ ok: true, ...data })
}
