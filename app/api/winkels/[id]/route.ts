import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

const SELECT_FIELDS = 'id,naam,kassa_nummer,actief,postcode,stad,lat,lng,wilmar_organisation_id,wilmar_branch_id,api_type,wilmar_store_naam,straat,huisnummer,land,provincie,cycle_api_authorized,cycle_api_checked_at,vendit_api_key,vendit_api_username,lidnummer,cbnr,geblokkeerd,contactpersoon,telefoon,email,email_administratie,website,iban,btw_nummer,kvk,gln,regio_manager,formule,aangesloten_sinds,bike_totaal_nieuw_start,bike_totaal_nieuw_eind,vvo_m2,deelname_centraal_betalen,cm_fietsen_deelname,cm_fietsen_instroom,cm_fietsen_uitstroom,kassasysteem,laatste_contract,jaarcijfers,sales_channels_qv,accountant,startdatum_servicepas_drs,einddatum_servicepas_drs,deelname_servicepas_drs,webshoporders_naar_kassa,startdatum_lease,einddatum_lease,deelname_lease,created_at'

function stripPassword(w: Record<string, unknown>) {
  const { vendit_api_password: _p, ...rest } = w
  return rest
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await supabase.from('winkels').select(SELECT_FIELDS).eq('id', Number(id)).single()
  if (error || !data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json(stripPassword(data as Record<string, unknown>))
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })
  const { supabase } = auth
  const { id } = await params
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const PATCHABLE = ['geblokkeerd','naam','formule','regio_manager','vvo_m2','aangesloten_sinds']
  const update: Record<string, unknown> = {}
  for (const key of PATCHABLE) {
    if (key in body) update[key] = body[key]
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 })
  const { data, error } = await supabase.from('winkels').update(update).eq('id', Number(id)).select(SELECT_FIELDS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(stripPassword(data as Record<string, unknown>))
}
