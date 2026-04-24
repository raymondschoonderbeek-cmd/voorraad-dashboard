import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'

export type WorkflowStap = { stap: string; tekst: string }

export const DEFAULT_WORKFLOW: WorkflowStap[] = [
  { stap: 'Order binnenkomst', tekst: 'Een klant plaatst een bestelling via de Gazelle-bestelmail. Freshdesk ontvangt de mail en stuurt de gegevens automatisch naar dit overzicht via de webhook.' },
  { stap: 'Order bekijken', tekst: 'Klik op een rij om de klantgegevens, het bestelde pakket en de leverweek te zien.' },
  { stap: 'Status bijhouden', tekst: 'Wijzig de status van een order: Nieuw → In behandeling → Afgerond. Dit helpt om bij te houden waar je staat.' },
  { stap: 'Exporteer naar Excel', tekst: 'Klik op "Exporteer Excel" om een overzicht te downloaden met lidnummer, naam, woonplaats, pakket, bestelnummer en besteldatum. Plak kolommen A–C en E in de Google Sheet (sla kolom D over — die vult automatisch in).' },
]

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const { data } = await auth.supabase
    .from('gazelle_observer_instellingen')
    .select('webhook_secret, actief, pakket_instellingen, workflow_tekst, updated_at')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json(data ?? { webhook_secret: null, actief: true, pakket_instellingen: {}, workflow_tekst: [] })
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const body = await request.json() as {
    genereer_secret?: boolean
    actief?: boolean
    pakket_instellingen?: Record<string, { beschikbaar: boolean; omschrijving: string }>
    workflow_tekst?: WorkflowStap[]
  }
  const admin = createAdminClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.genereer_secret) updates.webhook_secret = randomBytes(32).toString('hex')
  if (typeof body.actief === 'boolean') updates.actief = body.actief
  if (body.pakket_instellingen) updates.pakket_instellingen = body.pakket_instellingen
  if (body.workflow_tekst) updates.workflow_tekst = body.workflow_tekst

  const { error } = await admin
    .from('gazelle_observer_instellingen')
    .upsert({ id: 1, ...updates }, { onConflict: 'id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = await admin
    .from('gazelle_observer_instellingen')
    .select('webhook_secret, actief, pakket_instellingen, workflow_tekst')
    .eq('id', 1)
    .single()

  return NextResponse.json({ ok: true, ...data })
}
