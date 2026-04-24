import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { resolveDashboardModules } from '@/lib/dashboard-modules'

function extractLidnummer(naam: string): string {
  return naam.match(/^(\d+)\s/)?.[1] ?? ''
}

function extractNaamZonderLidnummer(naam: string): string {
  return naam.replace(/^\d+\s+/, '').trim()
}

function extractWoonplaats(adres: string): string {
  const match = adres.match(/\d{4}\s+[A-Z]{2}\s+([A-Za-zÀ-ɏ\s\-]+)/i)
  if (match?.[1]) return match[1].trim()
  const idx = adres.lastIndexOf(',')
  return idx >= 0 ? adres.slice(idx + 1).trim() : ''
}

function extractPakket(levNr: string): string {
  return levNr.match(/Pakket\s+([A-E])/i)?.[1]?.toUpperCase() ?? levNr
}

async function requireGazelleAccess() {
  const { user, supabase, isAdmin } = await requireAuth()
  if (!user) return { ok: false as const, status: 401 }
  if (isAdmin) return { ok: true as const, user, supabase, isAdmin }
  const { data: profile } = await supabase.from('profiles').select('modules_toegang, lunch_module_enabled, campagne_fietsen_toegang').eq('user_id', user.id).maybeSingle()
  const { data: rolData } = await supabase.from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  const modules = resolveDashboardModules(rolData?.rol, profile, false)
  if (!modules.includes('gazelle-orders')) return { ok: false as const, status: 403 }
  return { ok: true as const, user, supabase, isAdmin }
}

/**
 * POST /api/admin/gazelle-sheet-push
 * Body: { order_id: string } — pusht één order naar Google Sheet
 */
export async function POST(request: NextRequest) {
  const auth = await requireGazelleAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })
  if (!hasAdminKey()) return NextResponse.json({ error: 'Configuratiefout' }, { status: 500 })

  const { order_id } = await request.json() as { order_id?: string }
  if (!order_id) return NextResponse.json({ error: 'order_id vereist' }, { status: 400 })

  const admin = createAdminClient()

  // Google Sheet URL ophalen
  const { data: inst } = await admin
    .from('gazelle_observer_instellingen')
    .select('google_sheet_url')
    .eq('id', 1)
    .maybeSingle()

  const sheetUrl = inst?.google_sheet_url
  if (!sheetUrl) return NextResponse.json({ error: 'Geen Google Sheet URL ingesteld' }, { status: 422 })

  // Order ophalen
  const { data: order } = await admin
    .from('gazelle_pakket_orders')
    .select('*')
    .eq('id', order_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order niet gevonden' }, { status: 404 })

  const naam = order.naam ?? ''
  const hoofdProduct = order.producten?.[0]

  const payload = {
    lidnummer: extractLidnummer(naam),
    naam: extractNaamZonderLidnummer(naam),
    plaats: extractWoonplaats(order.adres ?? ''),
    pakket: hoofdProduct ? extractPakket(hoofdProduct.lev_nr) : '',
  }

  try {
    const res = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
    if (!res.ok || json.ok === false) {
      return NextResponse.json({ error: json.error ?? `Sheet fout: ${res.status}` }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Verbindingsfout' }, { status: 502 })
  }
}
