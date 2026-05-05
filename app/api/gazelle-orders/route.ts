import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { parseGazelleDescription } from '@/lib/gazelle-parser'
import { resolveDashboardModules } from '@/lib/dashboard-modules'

async function requireGazelleAccess() {
  const { user, supabase, isAdmin } = await requireAuth()
  if (!user) return { ok: false as const, status: 401, supabase, isAdmin }

  if (isAdmin) return { ok: true as const, user, supabase, isAdmin }

  // Controleer of de gebruiker het gazelle-orders module-recht heeft
  const { data: profile } = await supabase
    .from('profiles')
    .select('modules_toegang, lunch_module_enabled, campagne_fietsen_toegang')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: rolData } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', user.id)
    .single()

  const modules = resolveDashboardModules(rolData?.rol, profile, false)
  if (!modules.includes('gazelle-orders')) {
    return { ok: false as const, status: 403, supabase, isAdmin }
  }

  return { ok: true as const, user, supabase, isAdmin }
}

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
  const auth = await requireGazelleAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  if (!hasAdminKey()) return NextResponse.json({ error: 'Configuratiefout' }, { status: 500 })

  // Admin client gebruiken: RLS blokkeert niet-admin gebruikers anders
  const { data, error } = await createAdminClient()
    .from('gazelle_pakket_orders')
    .select('*')
    .order('ontvangen_op', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const auth = await requireGazelleAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })
  if (!auth.isAdmin) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const body = await request.json() as { freshdesk_ticket_id?: string }
  const ticketId = body.freshdesk_ticket_id?.trim()
  if (!ticketId) return NextResponse.json({ error: 'freshdesk_ticket_id vereist' }, { status: 400 })

  if (!hasAdminKey()) return NextResponse.json({ error: 'Configuratiefout' }, { status: 500 })
  const admin = createAdminClient()

  const html = await haalFreshdeskBeschrijvingOp(ticketId)
  if (!html) {
    return NextResponse.json({
      error: 'Ticket niet gevonden of FRESHDESK_API_KEY / FRESHDESK_DOMAIN niet ingesteld.',
    }, { status: 422 })
  }

  const parsed = parseGazelleDescription(html)
  const { error } = await admin
    .from('gazelle_pakket_orders')
    .upsert(
      {
        freshdesk_ticket_id: ticketId,
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
      },
      { onConflict: 'freshdesk_ticket_id', ignoreDuplicates: false }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, bestelnummer: parsed.bestelnummer })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireGazelleAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

  const body = await request.json() as { status?: string; reparse?: boolean }

  if (!hasAdminKey()) return NextResponse.json({ error: 'Configuratiefout' }, { status: 500 })
  const admin = createAdminClient()

  if (body.reparse) {
    const { data: order } = await admin
      .from('gazelle_pakket_orders')
      .select('raw_description, freshdesk_ticket_id')
      .eq('id', id)
      .single()

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
    const { error } = await admin
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

  const { error } = await admin
    .from('gazelle_pakket_orders')
    .update({ status: body.status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
