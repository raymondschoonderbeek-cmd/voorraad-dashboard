import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import {
  getMailboxSettings,
  patchMailboxOof,
  patchMailboxWorkHours,
  isGraphConfigured,
  type MailboxOof,
} from '@/lib/microsoft-mailbox'
import { DEFAULT_WEEK_SCHEMA, type WeekSchema, type DagNaam, ALLE_DAGEN } from '@/lib/beschikbaarheid'

const SYNC_TTL_MS = 30 * 60 * 1000 // 30 minuten cache

/** Converteer Graph work hours naar WeekSchema (alle actieve dagen krijgen dezelfde tijd). */
function graphWorkHoursToWeekSchema(days: string[], start: string, end: string): WeekSchema {
  const schema = structuredClone(DEFAULT_WEEK_SCHEMA)
  for (const dag of ALLE_DAGEN) {
    schema[dag].enabled = days.includes(dag)
    if (days.includes(dag)) {
      schema[dag].start = start
      schema[dag].end = end
    }
  }
  return schema
}

/** Bepaal representatieve uren voor Graph-write (eerste actieve dag). */
function weekSchemaToGraphHours(schema: WeekSchema): { days: string[]; start: string; end: string } {
  const activeDays = ALLE_DAGEN.filter(d => schema[d as DagNaam]?.enabled)
  const first = activeDays[0] as DagNaam | undefined
  return {
    days: activeDays,
    start: first ? schema[first].start : '09:00',
    end: first ? schema[first].end : '17:00',
  }
}

/** GET: haal eigen beschikbaarheidsinstellingen op (sync vanuit Graph als cache oud is). */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data: row } = await supabase
    .from('gebruiker_beschikbaarheid')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const graphOk = isGraphConfigured()
  const cacheOud = !row?.graph_synced_at ||
    Date.now() - new Date(row.graph_synced_at).getTime() > SYNC_TTL_MS

  if (graphOk && (cacheOud || !row)) {
    try {
      const upn = user.email
      if (upn) {
        const ms = await getMailboxSettings(upn)
        const nu = new Date().toISOString()
        // Gebruik bestaand week-schema als dat al per-dag is geconfigureerd
        const bestaandSchema = row?.work_schedule as WeekSchema | null
        const workSchedule = bestaandSchema ?? graphWorkHoursToWeekSchema(
          ms.workHours.days, ms.workHours.startTime, ms.workHours.endTime
        )
        await supabase.from('gebruiker_beschikbaarheid').upsert(
          {
            user_id: user.id,
            oof_status: ms.oof.status,
            oof_start: ms.oof.start,
            oof_end: ms.oof.end,
            oof_internal_msg: ms.oof.internalMsg,
            oof_external_msg: ms.oof.externalMsg,
            work_schedule: workSchedule,
            work_timezone: ms.workHours.timezone,
            graph_synced_at: nu,
            updated_at: nu,
          },
          { onConflict: 'user_id' }
        )
        const { data: fresh } = await supabase
          .from('gebruiker_beschikbaarheid')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
        return NextResponse.json({ settings: fresh, graphConfigured: true, synced: true })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Graph-fout'
      return NextResponse.json({ settings: row ?? null, graphConfigured: true, synced: false, syncError: msg })
    }
  }

  return NextResponse.json({ settings: row ?? null, graphConfigured: graphOk, synced: false })
}

/** PATCH: sla OOF en/of werktijden op (naar Graph + Supabase). */
export async function PATCH(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  let body: { oof?: MailboxOof; workSchedule?: WeekSchema; workTimezone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const graphOk = isGraphConfigured()
  const upn = user.email
  const graphErrors: string[] = []

  if (graphOk && upn) {
    if (body.oof) {
      try { await patchMailboxOof(upn, body.oof) }
      catch (e) { graphErrors.push(e instanceof Error ? e.message : 'OOF opslaan mislukt') }
    }
    // Graph work hours sync: gebruik representatieve uren uit het week-schema
    if (body.workSchedule) {
      try {
        const { days, start, end } = weekSchemaToGraphHours(body.workSchedule)
        await patchMailboxWorkHours(upn, {
          days,
          startTime: start,
          endTime: end,
          timezone: body.workTimezone ?? 'W. Europe Standard Time',
        })
      } catch (e) { graphErrors.push(e instanceof Error ? e.message : 'Werktijden opslaan mislukt') }
    }
  }

  const nu = new Date().toISOString()
  const upsertData: Record<string, unknown> = { user_id: user.id, updated_at: nu }
  if (graphOk && graphErrors.length === 0 && upn) upsertData.graph_synced_at = nu

  if (body.oof) {
    upsertData.oof_status = body.oof.status
    upsertData.oof_start = body.oof.start
    upsertData.oof_end = body.oof.end
    upsertData.oof_internal_msg = body.oof.internalMsg
    upsertData.oof_external_msg = body.oof.externalMsg
  }
  if (body.workSchedule) upsertData.work_schedule = body.workSchedule
  if (body.workTimezone) upsertData.work_timezone = body.workTimezone

  const { error: dbErr } = await supabase
    .from('gebruiker_beschikbaarheid')
    .upsert(upsertData, { onConflict: 'user_id' })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    graphConfigured: graphOk,
    graphErrors: graphErrors.length ? graphErrors : undefined,
  })
}
