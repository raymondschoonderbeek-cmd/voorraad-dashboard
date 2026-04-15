import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import {
  getMailboxSettings,
  getWerklocatieSchema,
  patchMailboxOof,
  patchMailboxWorkHours,
  patchWerklocatieVandaag,

  patchPresenceWerklocatie,
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

/**
 * Analyseer het weekschema voor Graph-write.
 * Graph workingHours ondersteunt slechts één start/eindtijd voor alle werkdagen.
 * `uniform = true` als alle actieve dagen dezelfde tijden hebben → Graph kan worden bijgewerkt.
 * `uniform = false` → tijden verschillen per dag, alleen lokaal opslaan.
 */
function weekSchemaToGraphHours(schema: WeekSchema): { days: string[]; start: string; end: string; uniform: boolean } {
  const activeDays = ALLE_DAGEN.filter(d => schema[d as DagNaam]?.enabled)
  if (activeDays.length === 0) return { days: [], start: '09:00', end: '17:00', uniform: true }
  const first = activeDays[0] as DagNaam
  const start = schema[first].start
  const end = schema[first].end
  const uniform = activeDays.every(d => schema[d as DagNaam].start === start && schema[d as DagNaam].end === end)
  return { days: activeDays, start, end, uniform }
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

        // Sync-strategie:
        // - OOF:              altijd vanuit Graph (tijdgevoelig, leidend in Outlook)
        // - work_schedule:    Supabase is altijd bron van waarheid; alleen op force/init vanuit Graph
        // - werklocatie_schema: idem — Supabase leidend; Graph alleen op force/init
        // - werklocatie:      nooit overschreven vanuit Graph (eenmalige override per dag)
        const shouldSyncWorkSchedule = force || !row

        // Mismatch-detectie: vergelijk portal-schema met Graph work hours (alleen als portal al data heeft)
        let graphMismatch: Record<string, unknown> | null = null
        if (row?.work_schedule && !force) {
          const portalSchema = row.work_schedule as WeekSchema
          const { start: portalStart, end: portalEnd, uniform: isUniform } = weekSchemaToGraphHours(portalSchema)
          if (isUniform) {
            if (portalStart !== ms.workHours.startTime || portalEnd !== ms.workHours.endTime) {
              graphMismatch = {
                portalStart,
                portalEnd,
                graphStart: ms.workHours.startTime,
                graphEnd: ms.workHours.endTime,
              }
              console.warn('[beschikbaarheid:get] Graph workingHours wijkt af van portal schema', {
                userId: user.id,
                ...graphMismatch,
              })
            }
          }
        }

        if (verboseLog || debug) {
          console.info('[beschikbaarheid:get] graph sync', {
            userId: user.id,
            upn,
            force,
            shouldSyncWorkSchedule,
            graphMismatch,
            graphWorkHours: ms.workHours,
            graphOof: ms.oof,
            graphWerklocatieSchema: locSchema,
          })
        }

        // Basisupsert: alleen OOF vanuit Graph (altijd leidend) + sync-timestamp.
        // work_schedule en werklocatie_schema worden NIET overschreven tenzij force of init.
        const upsertObj: Record<string, unknown> = {
          user_id: user.id,
          oof_status: ms.oof.status,
          oof_start: ms.oof.start,
          oof_end: ms.oof.end,
          oof_internal_msg: ms.oof.internalMsg,
          oof_external_msg: ms.oof.externalMsg,
          graph_synced_at: nu,
          updated_at: nu,
        }
        if (shouldSyncWorkSchedule) {
          // Bij force of initialisatie: Graph-waarden als startpunt voor werktijden.
          // werklocatie_schema wordt NOOIT vanuit Graph overschreven — altijd portal-beheerd.
          upsertObj.work_schedule = workSchedule
          upsertObj.work_timezone = ms.workHours.timezone
        }
        await supabase.from('gebruiker_beschikbaarheid').upsert(upsertObj, { onConflict: 'user_id' })
        const { data: fresh } = await supabase
          .from('gebruiker_beschikbaarheid')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
        const payload: Record<string, unknown> = {
          settings: fresh,
          graphConfigured: true,
          synced: true,
          shouldSyncWorkSchedule,
          graphMismatch,
          debug: {
            workHours: ms.workHours,
            werklocatieSchema: locSchema,
            oof: ms.oof,
            shouldSyncWorkSchedule,
            graphMismatch,
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
  let workHoursDebug: { sent: unknown; graphPayload: unknown } | null = null
  // 'bijgewerkt'          → Graph succesvol bijgewerkt (uniforme tijden)
  // 'overgeslagen'        → tijden verschillen per dag, alleen lokaal opgeslagen
  // 'niet_geconfigureerd' → Graph niet ingesteld
  let graphSyncType: 'bijgewerkt' | 'overgeslagen' | 'niet_geconfigureerd' =
    graphOk ? 'overgeslagen' : 'niet_geconfigureerd'
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
    // Graph work hours sync — hybride model:
    // Alleen bijwerken als alle actieve werkdagen dezelfde start/eindtijd hebben.
    // Graph workingHours ondersteunt geen per-dag tijden; bij verschillende tijden
    // slaan we alleen lokaal op in Supabase.
    if (body.workSchedule) {
      try {
        const { days, start, end, uniform } = weekSchemaToGraphHours(body.workSchedule)
        const timezone = body.workTimezone ?? 'W. Europe Standard Time'
        if (verboseLog || debug) {
          console.info('[beschikbaarheid:patch] workHours analyse', {
            uniform,
            startTimeNaarGraph: start,
            endTimeNaarGraph: end,
            dagen: days,
            tijdzone: timezone,
          })
        }
        if (uniform && days.length > 0) {
          const result = await patchMailboxWorkHours(upn, { days, startTime: start, endTime: end, timezone })
          workHoursDebug = result
          graphSyncType = 'bijgewerkt'
          if (verboseLog || debug) {
            console.info('[beschikbaarheid:patch] workHours Graph-PATCH verstuurd', { graphPayload: result.graphPayload })
          }
        } else {
          // Tijden verschillen per dag → alleen Supabase, Graph niet bijwerken
          graphSyncType = 'overgeslagen'
          if (verboseLog || debug) {
            console.info('[beschikbaarheid:patch] workHours Graph-PATCH overgeslagen — niet-uniforme tijden per dag')
          }
        }
      } catch (e) { graphErrors.push(e instanceof Error ? e.message : 'Werktijden opslaan mislukt') }
    }
    // Werklocatie vandaag → Presence API (primair: dit is wat Teams/Outlook toont)
    if ('werklocatie' in body) {
      try { await patchPresenceWerklocatie(upn, body.werklocatie ?? null) }
      catch (e) { graphErrors.push(e instanceof Error ? e.message : 'Presence werklocatie opslaan mislukt') }
      // Kalender-event als fallback/aanvulling (best effort, fouten worden genegeerd)
      patchWerklocatieVandaag(upn, body.werklocatie ?? null).catch(() => undefined)
    }
    // Werklocatie schema (per dag) — Supabase is bron van waarheid, Graph niet bijwerken.
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
    graphSyncType,
    settings: opgeslagenRow,
  }
  if (debug) {
    response.debug = {
      requestBody: body,
      graphErrors,
      workHoursDebug: workHoursDebug ?? null,
    }
  }
  return NextResponse.json(response)
}
