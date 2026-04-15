import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import {
  getMailboxSettings,
  getWerklocatieSchema,
  patchMailboxOof,
  patchMailboxWorkHours,
  patchWerklocatieVandaag,
  patchWerklocatieSchema as patchGraphWerklocatieSchema,
  isGraphConfigured,
  type MailboxOof,
} from '@/lib/microsoft-mailbox'
import { DEFAULT_WEEK_SCHEMA, type WeekSchema, type DagNaam, ALLE_DAGEN } from '@/lib/beschikbaarheid'

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

/**
 * GET: haal eigen beschikbaarheidsinstellingen op.
 *
 * Gedrag:
 * - ?force=true  → dwing direct een Graph-refresh af
 * - (geen force) → refresh vanuit Graph als cache verlopen is
 *
 * Zowel OOF, werktijden als werklocatie-schema worden vanuit Graph ververst zodat
 * portal en Outlook/Graph niet uit elkaar kunnen lopen.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'
  const debug = searchParams.get('debug') === 'true'
  const verboseLog = process.env.AVAILABILITY_DEBUG_GRAPH === '1'

  const { data: row } = await supabase
    .from('gebruiker_beschikbaarheid')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const graphOk = isGraphConfigured()
  if (graphOk) {
    try {
      const upn = user.email
      if (upn) {
        const [ms, locSchema] = await Promise.all([
          getMailboxSettings(upn),
          getWerklocatieSchema(upn).catch(() => ({})),
        ])
        const nu = new Date().toISOString()

        const workSchedule = graphWorkHoursToWeekSchema(ms.workHours.days, ms.workHours.startTime, ms.workHours.endTime)
        const werklocatieSchema = Object.keys(locSchema).length > 0 ? locSchema : null

        if (verboseLog || debug) {
          console.info('[beschikbaarheid:get] graph sync', {
            userId: user.id,
            upn,
            force,
            graphWorkHours: ms.workHours,
            graphOof: ms.oof,
            graphWerklocatieSchema: locSchema,
          })
        }

        await supabase.from('gebruiker_beschikbaarheid').upsert(
          {
            user_id: user.id,
            // OOF altijd vanuit Graph (tijdgevoelig)
            oof_status: ms.oof.status,
            oof_start: ms.oof.start,
            oof_end: ms.oof.end,
            oof_internal_msg: ms.oof.internalMsg,
            oof_external_msg: ms.oof.externalMsg,
            work_schedule: workSchedule,
            work_timezone: ms.workHours.timezone,
            werklocatie_schema: werklocatieSchema,
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
        const payload: Record<string, unknown> = {
          settings: fresh,
          graphConfigured: true,
          synced: true,
          debug: {
            workHours: ms.workHours,
            werklocatieSchema: locSchema,
            oof: ms.oof,
          },
        }
        if (!debug) delete payload.debug
        return NextResponse.json(payload)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Graph-fout'
      if (verboseLog || debug) {
        console.error('[beschikbaarheid:get] graph sync failed', {
          userId: user.id,
          force,
          error: msg,
        })
      }
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

  let body: { oof?: MailboxOof; workSchedule?: WeekSchema; workTimezone?: string; werklocatie?: string | null; werklocatieSchema?: Record<string, string> | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const graphOk = isGraphConfigured()
  const upn = user.email
  const graphErrors: string[] = []
  const { searchParams } = new URL(request.url)
  const debug = searchParams.get('debug') === 'true'
  const verboseLog = process.env.AVAILABILITY_DEBUG_GRAPH === '1'

  if (graphOk && upn) {
    if (verboseLog || debug) {
      console.info('[beschikbaarheid:patch] requested update', {
        userId: user.id,
        upn,
        hasOof: !!body.oof,
        hasWorkSchedule: !!body.workSchedule,
        hasWerklocatie: 'werklocatie' in body,
        hasWerklocatieSchema: !!body.werklocatieSchema,
      })
    }
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
    // Werklocatie vandaag (one-off override) → Outlook Calendar
    if ('werklocatie' in body) {
      try { await patchWerklocatieVandaag(upn, body.werklocatie ?? null) }
      catch (e) { graphErrors.push(e instanceof Error ? e.message : 'Werklocatie vandaag opslaan mislukt') }
    }
    // Werklocatie schema (per dag) → Outlook Calendar (PATCHt bestaande events)
    if (body.werklocatieSchema && Object.keys(body.werklocatieSchema).length > 0) {
      try { await patchGraphWerklocatieSchema(upn, body.werklocatieSchema) }
      catch (e) { graphErrors.push(e instanceof Error ? e.message : 'Werklocatieschema opslaan mislukt') }
    }
  }

  const nu = new Date().toISOString()
  const upsertData: Record<string, unknown> = { user_id: user.id, updated_at: nu }

  if (body.oof) {
    upsertData.oof_status = body.oof.status
    upsertData.oof_start = body.oof.start
    upsertData.oof_end = body.oof.end
    upsertData.oof_internal_msg = body.oof.internalMsg
    upsertData.oof_external_msg = body.oof.externalMsg
  }
  if (body.workSchedule) upsertData.work_schedule = body.workSchedule
  if (body.workTimezone) upsertData.work_timezone = body.workTimezone
  if ('werklocatie' in body) upsertData.werklocatie = body.werklocatie ?? null
  if ('werklocatieSchema' in body) upsertData.werklocatie_schema = body.werklocatieSchema ?? null
  if (graphOk && graphErrors.length === 0) upsertData.graph_synced_at = nu

  const { error: dbErr } = await supabase
    .from('gebruiker_beschikbaarheid')
    .upsert(upsertData, { onConflict: 'user_id' })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Geef de opgeslagen Supabase-rij terug (niet opnieuw vanuit Graph lezen —
  // Graph heeft eventual consistency en zou anders net opgeslagen waarden overschrijven)
  const { data: opgeslagenRow } = await supabase
    .from('gebruiker_beschikbaarheid')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (verboseLog || debug) {
    console.info('[beschikbaarheid:patch] update result', {
      userId: user.id,
      graphConfigured: graphOk,
      graphErrors,
      savedRowWorkTimezone: opgeslagenRow?.work_timezone ?? null,
      savedRowWorkSchedule: opgeslagenRow?.work_schedule ?? null,
      savedRowWerklocatieSchema: opgeslagenRow?.werklocatie_schema ?? null,
    })
  }

  const response: Record<string, unknown> = {
    ok: true,
    graphConfigured: graphOk,
    graphErrors: graphErrors.length ? graphErrors : undefined,
    settings: opgeslagenRow,
  }
  if (debug) {
    response.debug = {
      requestBody: body,
      graphErrors,
    }
  }
  return NextResponse.json(response)
}
