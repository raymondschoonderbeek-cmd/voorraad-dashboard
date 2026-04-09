import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'
import {
  stuurSupportBeslissingMail,
  stuurAanvragerBeslissingMail,
} from '@/lib/aanvraag-mail'

const GELDIGE_BESLISSINGEN = ['goedgekeurd', 'afgekeurd'] as const
type Beslissing = (typeof GELDIGE_BESLISSINGEN)[number]

// ── POST: manager neemt beslissing via token ─────────────────────────────────

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  let body: { token?: string; beslissing?: string; notitie?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const { token, beslissing, notitie } = body

  if (!token || typeof token !== 'string' || token.length !== 64) {
    return NextResponse.json({ error: 'Ongeldig token' }, { status: 400 })
  }
  if (!beslissing || !GELDIGE_BESLISSINGEN.includes(beslissing as Beslissing)) {
    return NextResponse.json({ error: 'Beslissing moet "goedgekeurd" of "afgekeurd" zijn' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Aanvraag ophalen via token
  const { data: aanvraag } = await adminClient
    .from('product_licentie_aanvragen')
    .select('*')
    .eq('manager_token', token)
    .maybeSingle()

  if (!aanvraag) {
    return NextResponse.json({ error: 'Ongeldig of verlopen token.' }, { status: 404 })
  }

  // Al beslist?
  if (aanvraag.status === 'goedgekeurd' || aanvraag.status === 'afgekeurd') {
    return NextResponse.json({
      error: 'Er is al een beslissing genomen voor deze aanvraag.',
      status: aanvraag.status,
    }, { status: 409 })
  }

  // Token verlopen?
  if (aanvraag.token_verloopt_op && new Date(aanvraag.token_verloopt_op) < new Date()) {
    return NextResponse.json({ error: 'Deze link is verlopen. Vraag een nieuwe aanvraag in.' }, { status: 410 })
  }

  const now = new Date().toISOString()

  // Status bijwerken, token wissen (single-use)
  const { error: updateErr } = await adminClient
    .from('product_licentie_aanvragen')
    .update({
      status: beslissing,
      manager_beslissing_op: now,
      manager_notitie: notitie?.trim() || null,
      manager_token: null,       // token verwijderen: beslissing maar 1x mogelijk
      token_verloopt_op: null,
      updated_at: now,
    })
    .eq('id', aanvraag.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // E-mails (best-effort)
  try {
    await stuurSupportBeslissingMail({
      aanvragerNaam: aanvraag.aanvrager_naam,
      aanvragerEmail: aanvraag.aanvrager_email,
      productNaam: aanvraag.catalogus_naam,
      beslissing: beslissing as Beslissing,
      managerNaam: aanvraag.manager_naam,
      managerNotitie: notitie?.trim() || null,
      aanvraagId: aanvraag.id,
    })
  } catch { /* mailgun niet geconfigureerd */ }

  try {
    await stuurAanvragerBeslissingMail({
      aanvragerEmail: aanvraag.aanvrager_email,
      aanvragerNaam: aanvraag.aanvrager_naam,
      productNaam: aanvraag.catalogus_naam,
      beslissing: beslissing as Beslissing,
      managerNotitie: notitie?.trim() || null,
    })
  } catch { /* idem */ }

  return NextResponse.json({
    ok: true,
    beslissing,
    aanvraag_id: aanvraag.id,
    product: aanvraag.catalogus_naam,
    aanvrager: aanvraag.aanvrager_naam,
  })
}

// ── GET: token-info ophalen voor de beslissings-pagina ───────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token || token.length !== 64) {
    return NextResponse.json({ error: 'Ongeldig token' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data: aanvraag } = await adminClient
    .from('product_licentie_aanvragen')
    .select('id, catalogus_naam, aanvrager_naam, aanvrager_email, motivatie, status, token_verloopt_op, manager_beslissing_op, manager_notitie')
    .eq('manager_token', token)
    .maybeSingle()

  if (!aanvraag) {
    // Controleer of er een afgehandelde aanvraag met dit token was (token is dan al gewist)
    return NextResponse.json({ error: 'Ongeldig of verlopen token.' }, { status: 404 })
  }

  const verlopen = aanvraag.token_verloopt_op && new Date(aanvraag.token_verloopt_op) < new Date()
  const beslist = aanvraag.status === 'goedgekeurd' || aanvraag.status === 'afgekeurd'

  return NextResponse.json({
    aanvraag: {
      id: aanvraag.id,
      catalogus_naam: aanvraag.catalogus_naam,
      aanvrager_naam: aanvraag.aanvrager_naam,
      aanvrager_email: aanvraag.aanvrager_email,
      motivatie: aanvraag.motivatie,
      status: aanvraag.status,
      verlopen: !!verlopen,
      beslist,
    }
  })
}
