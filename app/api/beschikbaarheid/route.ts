import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import {
  getMailboxSettings,
  patchMailboxOof,
  patchMailboxWorkHours,
  isGraphConfigured,
  type MailboxOof,
  type MailboxWorkHours,
} from '@/lib/microsoft-mailbox'

const SYNC_TTL_MS = 30 * 60 * 1000 // 30 minuten cache

/** GET: haal eigen beschikbaarheidsinstellingen op (sync vanuit Graph als cache oud is). */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  // Lees huidige rij uit Supabase
  const { data: row } = await supabase
    .from('gebruiker_beschikbaarheid')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const graphOk = isGraphConfigured()
  const cacheOud = !row?.graph_synced_at ||
    Date.now() - new Date(row.graph_synced_at).getTime() > SYNC_TTL_MS

  // Sync vanuit Graph als cache oud of leeg is
  if (graphOk && (cacheOud || !row)) {
    try {
      const upn = user.email
      if (upn) {
        const ms = await getMailboxSettings(upn)
        const nu = new Date().toISOString()
        await supabase.from('gebruiker_beschikbaarheid').upsert(
          {
            user_id: user.id,
            oof_status: ms.oof.status,
            oof_start: ms.oof.start,
            oof_end: ms.oof.end,
            oof_internal_msg: ms.oof.internalMsg,
            oof_external_msg: ms.oof.externalMsg,
            work_days: ms.workHours.days,
            work_start_time: ms.workHours.startTime,
            work_end_time: ms.workHours.endTime,
            work_timezone: ms.workHours.timezone,
            graph_synced_at: nu,
            updated_at: nu,
          },
          { onConflict: 'user_id' }
        )
        // Herlaad na upsert
        const { data: fresh } = await supabase
          .from('gebruiker_beschikbaarheid')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
        return NextResponse.json({ settings: fresh, graphConfigured: true, synced: true })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Graph-fout'
      // Geef bestaande cache terug met foutmelding
      return NextResponse.json({ settings: row ?? null, graphConfigured: true, synced: false, syncError: msg })
    }
  }

  return NextResponse.json({ settings: row ?? null, graphConfigured: graphOk, synced: false })
}

/** PATCH: sla OOF of werktijden op (naar Graph + Supabase cache). */
export async function PATCH(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  let body: {
    oof?: MailboxOof
    workHours?: MailboxWorkHours
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const graphOk = isGraphConfigured()
  const upn = user.email
  const graphErrors: string[] = []

  // Schrijf naar Graph (best effort)
  if (graphOk && upn) {
    if (body.oof) {
      try { await patchMailboxOof(upn, body.oof) }
      catch (e) { graphErrors.push(e instanceof Error ? e.message : 'OOF opslaan mislukt') }
    }
    if (body.workHours) {
      try { await patchMailboxWorkHours(upn, body.workHours) }
      catch (e) { graphErrors.push(e instanceof Error ? e.message : 'Werktijden opslaan mislukt') }
    }
  }

  // Sla altijd op in Supabase (ook als Graph faalt)
  const nu = new Date().toISOString()
  const patch: Record<string, unknown> = { user_id: user.id, updated_at: nu }
  if (graphOk && graphErrors.length === 0 && upn) {
    patch.graph_synced_at = nu
  }

  if (body.oof) {
    patch.oof_status = body.oof.status
    patch.oof_start = body.oof.start
    patch.oof_end = body.oof.end
    patch.oof_internal_msg = body.oof.internalMsg
    patch.oof_external_msg = body.oof.externalMsg
  }
  if (body.workHours) {
    patch.work_days = body.workHours.days
    patch.work_start_time = body.workHours.startTime
    patch.work_end_time = body.workHours.endTime
    patch.work_timezone = body.workHours.timezone
  }

  const { error: dbErr } = await supabase
    .from('gebruiker_beschikbaarheid')
    .upsert(patch, { onConflict: 'user_id' })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    graphConfigured: graphOk,
    graphErrors: graphErrors.length ? graphErrors : undefined,
  })
}
