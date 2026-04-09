import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'
import { canAccessItCmdb } from '@/lib/auth'
import { getSiteUrl } from '@/lib/site-url'
import {
  stuurManagerApprovalMail,
  stuurAanvragerBevestigingMail,
} from '@/lib/aanvraag-mail'

const TOKEN_GELDIG_DAGEN = 7

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── GET: aanvragen ophalen (admin = alles, user = eigen) ─────────────────────

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rolData } = await supabase
    .from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  const isAdmin = rolData?.rol === 'admin'

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')
  const catalogusFilter = searchParams.get('catalogus_id')

  const client = isAdmin && hasAdminKey() ? createAdminClient() : supabase

  let query = client
    .from('product_licentie_aanvragen')
    .select('*')
    .order('created_at', { ascending: false })

  if (!isAdmin) query = query.eq('aanvrager_id', user.id)
  if (statusFilter) query = query.eq('status', statusFilter)
  if (catalogusFilter) query = query.eq('catalogus_id', catalogusFilter)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Verberg token in response
  const safe = (data ?? []).map(({ manager_token: _t, ...rest }) => rest)
  return NextResponse.json({ aanvragen: safe })
}

// ── POST: nieuwe aanvraag indienen ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { catalogus_id?: string; motivatie?: string; namens_user_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  if (!body.catalogus_id) return NextResponse.json({ error: 'catalogus_id is verplicht' }, { status: 400 })

  const heeftItCmdbToegang = await canAccessItCmdb(supabase, user.id)
  // IT-CMDB-module: namens collega indienen; anders alleen voor jezelf
  const doelUserId = (body.namens_user_id && heeftItCmdbToegang) ? body.namens_user_id : user.id

  // Catalogus-item ophalen
  const { data: item } = await supabase
    .from('it_catalogus')
    .select('id, naam, aanvraagbaar')
    .eq('id', body.catalogus_id)
    .single()
  if (!item) return NextResponse.json({ error: 'Product niet gevonden' }, { status: 404 })

  // Zelfaanvraag (geen IT-rechten): alleen als catalogus-item "aanvraagbaar" is
  if (!heeftItCmdbToegang && doelUserId === user.id && item.aanvraagbaar !== true) {
    return NextResponse.json(
      { error: 'Dit product is niet beschikbaar voor zelfaanvraag. Neem contact op met IT.' },
      { status: 403 }
    )
  }

  // Aanvrager-info ophalen (van de doelgebruiker)
  const adminClient = hasAdminKey() ? createAdminClient() : supabase
  const { data: rolData } = await adminClient
    .from('gebruiker_rollen')
    .select('naam, manager_naam, manager_email')
    .eq('user_id', doelUserId).single()

  let aanvragerEmail = user.email ?? ''
  if (doelUserId !== user.id && hasAdminKey()) {
    const { data: { user: doelUser } } = await adminClient.auth.admin.getUserById(doelUserId)
    aanvragerEmail = doelUser?.email ?? ''
  }

  const aanvragerNaam = rolData?.naam?.trim() || aanvragerEmail
  const managerNaam = rolData?.manager_naam ?? null
  const managerEmail = rolData?.manager_email ?? null

  // Controleer dubbele openstaande aanvraag
  const { data: bestaand } = await adminClient
    .from('product_licentie_aanvragen')
    .select('id, status')
    .eq('aanvrager_id', doelUserId)
    .eq('catalogus_id', body.catalogus_id)
    .in('status', ['ingediend', 'wacht_op_manager'])
    .maybeSingle()

  if (bestaand) {
    return NextResponse.json({ error: 'Er staat al een openstaande aanvraag voor dit product.' }, { status: 409 })
  }

  const heeftManager = !!managerEmail
  const token = heeftManager ? generateToken() : null
  const verlooptOp = heeftManager
    ? new Date(Date.now() + TOKEN_GELDIG_DAGEN * 24 * 60 * 60 * 1000)
    : null

  const { data: aanvraag, error: insertErr } = await adminClient
    .from('product_licentie_aanvragen')
    .insert({
      catalogus_id: body.catalogus_id,
      catalogus_naam: item.naam,
      aanvrager_id: doelUserId,
      aanvrager_naam: aanvragerNaam,
      aanvrager_email: aanvragerEmail,
      manager_naam: managerNaam,
      manager_email: managerEmail,
      motivatie: body.motivatie?.trim() || null,
      status: heeftManager ? 'wacht_op_manager' : 'ingediend',
      manager_token: token,
      token_verloopt_op: verlooptOp?.toISOString() ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !aanvraag) {
    return NextResponse.json({ error: insertErr?.message ?? 'Aanmaken mislukt' }, { status: 500 })
  }

  const siteUrl = getSiteUrl()

  // E-mails versturen (best-effort: fouten stoppen de aanvraag niet)
  try {
    await stuurAanvragerBevestigingMail({
      aanvragerEmail,
      aanvragerNaam,
      productNaam: item.naam,
      managerNaam,
    })
  } catch { /* mailgun niet geconfigureerd of tijdelijk probleem */ }

  if (heeftManager && token && verlooptOp) {
    try {
      await stuurManagerApprovalMail({
        managerEmail: managerEmail!,
        managerNaam: managerNaam!,
        aanvragerNaam,
        aanvragerEmail,
        productNaam: item.naam,
        motivatie: body.motivatie?.trim() || null,
        goedkeurUrl: `${siteUrl}/aanvragen/beslissen?token=${token}&beslissing=goedgekeurd`,
        afkeurUrl: `${siteUrl}/aanvragen/beslissen?token=${token}&beslissing=afgekeurd`,
        verlooptOp,
      })
    } catch { /* idem */ }
  }

  return NextResponse.json({ ok: true, aanvraag_id: aanvraag.id })
}
