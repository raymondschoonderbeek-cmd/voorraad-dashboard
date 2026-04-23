import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { parseGazelleDescription } from '@/lib/gazelle-parser'

function normalizeDomain(raw: string): string {
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '').trim()
}

async function haalFreshdeskBeschrijvingOp(ticketId: string): Promise<string | null> {
  const apiKey = process.env.FRESHDESK_API_KEY
  const domain = process.env.FRESHDESK_DOMAIN
  if (!apiKey || !domain) return null

  try {
    const res = await fetch(
      `https://${normalizeDomain(domain)}/api/v2/tickets/${ticketId}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    )
    if (!res.ok) return null
    const data = await res.json() as { description?: string; description_text?: string }
    return data.description || data.description_text || null
  } catch {
    return null
  }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const { data, error } = await auth.supabase
    .from('gazelle_pakket_orders')
    .select('*')
    .order('ontvangen_op', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

  const body = await request.json() as { status?: string; reparse?: boolean }

  if (body.reparse) {
    const { data: order } = await auth.supabase
      .from('gazelle_pakket_orders')
      .select('raw_description, freshdesk_ticket_id')
      .eq('id', id)
      .single()

    // raw_description leeg? Probeer alsnog via Freshdesk API te halen.
    let html = order?.raw_description || ''
    if (!html && order?.freshdesk_ticket_id) {
      html = await haalFreshdeskBeschrijvingOp(order.freshdesk_ticket_id) ?? ''
    }

    if (!html) {
      return NextResponse.json({
        error: 'Geen beschrijving beschikbaar. Zorg dat ticket_description in de Freshdesk webhook-payload zit, of stel FRESHDESK_API_KEY + FRESHDESK_DOMAIN in.',
      }, { status: 422 })
    }

    const parsed = parseGazelleDescription(html)
    const { error } = await auth.supabase
      .from('gazelle_pakket_orders')
      .update({
        besteldatum: parsed.besteldatum,
        bestelnummer: parsed.bestelnummer,
        naam: parsed.naam,
        bedrijfsnaam: parsed.bedrijfsnaam,
        emailadres: parsed.emailadres,
        referentie: parsed.referentie,
        opmerkingen: parsed.opmerkingen,
        adres: parsed.adres,
        producten: parsed.producten,
        raw_description: html,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, producten: parsed.producten.length })
  }

  if (!body.status) return NextResponse.json({ error: 'status of reparse vereist' }, { status: 400 })

  const { error } = await auth.supabase
    .from('gazelle_pakket_orders')
    .update({ status: body.status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
