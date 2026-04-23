import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { parseGazelleDescription } from '@/lib/gazelle-parser'

function verifySecret(request: NextRequest, secret: string): boolean {
  const headerSecret = request.headers.get('x-webhook-secret')
  if (headerSecret) return headerSecret === secret
  return request.nextUrl.searchParams.get('secret') === secret
}

/**
 * POST /api/webhooks/freshdesk-gazelle
 * Freshdesk Observer webhook voor Gazelle pakket orders.
 * Secret validatie via X-Webhook-Secret header (of ?secret= query param).
 * Secret beheer via /dashboard/gazelle-pakket-orders (admin).
 */
export async function POST(request: NextRequest) {
  if (!hasAdminKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 500 })
  }

  const admin = createAdminClient()

  const { data: inst } = await admin
    .from('gazelle_observer_instellingen')
    .select('webhook_secret, actief')
    .eq('id', 1)
    .maybeSingle()

  if (!inst?.actief) {
    return NextResponse.json({ error: 'Gazelle observer is niet actief' }, { status: 503 })
  }

  if (inst.webhook_secret && !verifySecret(request, inst.webhook_secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const ticket = (body.freshdesk_webhook ?? body) as Record<string, unknown>
  const ticketId = ticket.ticket_id ?? ticket.id
  const rawDescription = String(ticket.ticket_description ?? ticket.description ?? '')
  const rawText = String(ticket.ticket_description_text ?? ticket.description_text ?? '')
  const htmlToParse = rawDescription || rawText

  if (!htmlToParse) {
    return NextResponse.json({ error: 'Geen beschrijving gevonden in payload' }, { status: 422 })
  }

  const parsed = parseGazelleDescription(htmlToParse)
  const row = {
    besteldatum: parsed.besteldatum,
    bestelnummer: parsed.bestelnummer,
    naam: parsed.naam,
    bedrijfsnaam: parsed.bedrijfsnaam,
    emailadres: parsed.emailadres,
    referentie: parsed.referentie,
    opmerkingen: parsed.opmerkingen,
    adres: parsed.adres,
    producten: parsed.producten,
    raw_description: rawDescription || rawText,
  }

  let dbError: { message: string } | null = null

  if (ticketId) {
    const { error } = await admin
      .from('gazelle_pakket_orders')
      .upsert(
        { freshdesk_ticket_id: String(ticketId), ...row },
        { onConflict: 'freshdesk_ticket_id', ignoreDuplicates: true }
      )
    dbError = error
  } else {
    const { error } = await admin.from('gazelle_pakket_orders').insert(row)
    dbError = error
  }

  if (dbError) {
    console.error('[freshdesk-gazelle] DB fout:', dbError)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, bestelnummer: parsed.bestelnummer })
}
