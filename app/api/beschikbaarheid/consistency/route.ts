import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import {
  getMailboxSettings,
  getWerklocatieSchema,
  isGraphConfigured,
} from '@/lib/microsoft-mailbox'
import {
  ALLE_DAGEN,
  DEFAULT_WEEK_SCHEMA,
  type DagNaam,
  type WeekSchema,
  type WerklocatieSchema,
} from '@/lib/beschikbaarheid'

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

function normalizeString(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function normalizeSchema(value: WerklocatieSchema | null | undefined): Record<DagNaam, string> {
  const out = {} as Record<DagNaam, string>
  for (const dag of ALLE_DAGEN) {
    out[dag] = normalizeString(value?.[dag])
  }
  return out
}

function weekSchedulesEqual(a: WeekSchema | null | undefined, b: WeekSchema | null | undefined): boolean {
  const left = a ?? DEFAULT_WEEK_SCHEMA
  const right = b ?? DEFAULT_WEEK_SCHEMA
  for (const dag of ALLE_DAGEN) {
    if ((left[dag]?.enabled ?? false) !== (right[dag]?.enabled ?? false)) return false
    if ((left[dag]?.start ?? '') !== (right[dag]?.start ?? '')) return false
    if ((left[dag]?.end ?? '') !== (right[dag]?.end ?? '')) return false
  }
  return true
}

interface BeschikbaarheidRow {
  user_id: string
  oof_status: string
  oof_start: string | null
  oof_end: string | null
  oof_internal_msg: string | null
  oof_external_msg: string | null
  work_schedule: WeekSchema | null
  work_timezone: string | null
  werklocatie_schema: WerklocatieSchema | null
  graph_synced_at: string | null
}

/**
 * GET /api/beschikbaarheid/consistency
 * Admin-only: vergelijkt portaldata met actuele Graph-data.
 *
 * Query params:
 * - userId=<uuid>  (optioneel: controleer 1 gebruiker)
 * - limit=<n>      (optioneel: max aantal gebruikers, default 50, max 200)
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data: rolData } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', user.id)
    .single()

  if (rolData?.rol !== 'admin') {
    return NextResponse.json({ error: 'Geen toegang — alleen admins' }, { status: 403 })
  }

  if (!isGraphConfigured()) {
    return NextResponse.json({ error: 'Microsoft Graph niet geconfigureerd' }, { status: 400 })
  }
  if (!hasAdminKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const onlyUserId = (searchParams.get('userId') ?? '').trim()
  const limitParam = Number(searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(200, Math.floor(limitParam)))
    : 50

  const admin = createAdminClient()

  const { data: rows, error: rowsError } = onlyUserId
    ? await admin
        .from('gebruiker_beschikbaarheid')
        .select('user_id, oof_status, oof_start, oof_end, oof_internal_msg, oof_external_msg, work_schedule, work_timezone, werklocatie_schema, graph_synced_at')
        .eq('user_id', onlyUserId)
        .limit(1)
    : await admin
        .from('gebruiker_beschikbaarheid')
        .select('user_id, oof_status, oof_start, oof_end, oof_internal_msg, oof_external_msg, work_schedule, work_timezone, werklocatie_schema, graph_synced_at')
        .order('updated_at', { ascending: false })
        .limit(limit)

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 })
  }

  const selectedRows = (rows ?? []) as BeschikbaarheidRow[]
  if (selectedRows.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: 0,
      in_sync: 0,
      out_of_sync: 0,
      users: [],
    })
  }

  const userIds = selectedRows.map(r => r.user_id)
  const { data: rollenRows, error: rollenError } = await admin
    .from('gebruiker_rollen')
    .select('user_id')
    .in('user_id', userIds)

  if (rollenError) {
    return NextResponse.json({ error: rollenError.message }, { status: 500 })
  }

  const activeUserIds = new Set((rollenRows ?? []).map((r: { user_id: string }) => r.user_id))
  const rowsToCheck = selectedRows.filter(r => activeUserIds.has(r.user_id))

  const emailByUserId = new Map<string, string>()
  const idsToFind = new Set(rowsToCheck.map(r => r.user_id))
  let page = 1
  while (idsToFind.size > 0) {
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (!authUsers || authUsers.length === 0) break
    for (const u of authUsers) {
      if (idsToFind.has(u.id) && u.email) {
        emailByUserId.set(u.id, u.email)
        idsToFind.delete(u.id)
      }
    }
    if (authUsers.length < 1000) break
    page++
  }

  const resultaten: Array<Record<string, unknown>> = []
  let inSyncCount = 0
  let outOfSyncCount = 0

  const BATCH = 5
  for (let i = 0; i < rowsToCheck.length; i += BATCH) {
    const batch = rowsToCheck.slice(i, i + BATCH)
    const batchResults = await Promise.all(batch.map(async (row) => {
      const email = emailByUserId.get(row.user_id)
      if (!email) {
        return {
          user_id: row.user_id,
          email: null,
          in_sync: false,
          mismatches: ['email_not_found'],
          error: 'E-mailadres niet gevonden in auth.users',
        }
      }

      try {
        const [graph, graphLocSchema] = await Promise.all([
          getMailboxSettings(email),
          getWerklocatieSchema(email).catch(() => ({})),
        ])

        const graphWorkSchedule = graphWorkHoursToWeekSchema(
          graph.workHours.days,
          graph.workHours.startTime,
          graph.workHours.endTime
        )

        const portalLocSchema = normalizeSchema(row.werklocatie_schema)
        const graphLocSchemaNorm = normalizeSchema(graphLocSchema as WerklocatieSchema)

        const mismatches: string[] = []
        if ((row.oof_status ?? 'disabled') !== graph.oof.status) mismatches.push('oof_status')
        if (normalizeString(row.oof_start) !== normalizeString(graph.oof.start)) mismatches.push('oof_start')
        if (normalizeString(row.oof_end) !== normalizeString(graph.oof.end)) mismatches.push('oof_end')
        if (normalizeString(row.oof_internal_msg) !== normalizeString(graph.oof.internalMsg)) mismatches.push('oof_internal_msg')
        if (normalizeString(row.oof_external_msg) !== normalizeString(graph.oof.externalMsg)) mismatches.push('oof_external_msg')
        if ((row.work_timezone ?? 'W. Europe Standard Time') !== graph.workHours.timezone) mismatches.push('work_timezone')
        if (!weekSchedulesEqual(row.work_schedule, graphWorkSchedule)) mismatches.push('work_schedule')
        if (JSON.stringify(portalLocSchema) !== JSON.stringify(graphLocSchemaNorm)) mismatches.push('werklocatie_schema')

        const inSync = mismatches.length === 0
        return {
          user_id: row.user_id,
          email,
          in_sync: inSync,
          mismatches,
          graph_synced_at: row.graph_synced_at,
          portal: {
            oof_status: row.oof_status,
            oof_start: row.oof_start,
            oof_end: row.oof_end,
            oof_internal_msg: row.oof_internal_msg,
            oof_external_msg: row.oof_external_msg,
            work_timezone: row.work_timezone,
            work_schedule: row.work_schedule,
            werklocatie_schema: portalLocSchema,
          },
          graph: {
            oof_status: graph.oof.status,
            oof_start: graph.oof.start,
            oof_end: graph.oof.end,
            oof_internal_msg: graph.oof.internalMsg,
            oof_external_msg: graph.oof.externalMsg,
            work_timezone: graph.workHours.timezone,
            work_schedule: graphWorkSchedule,
            werklocatie_schema: graphLocSchemaNorm,
          },
        }
      } catch (e) {
        return {
          user_id: row.user_id,
          email,
          in_sync: false,
          mismatches: ['graph_fetch_error'],
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }))

    for (const result of batchResults) {
      resultaten.push(result)
      if (result.in_sync === true) inSyncCount++
      else outOfSyncCount++
    }
  }

  return NextResponse.json({
    ok: true,
    checked: resultaten.length,
    in_sync: inSyncCount,
    out_of_sync: outOfSyncCount,
    users: resultaten,
  })
}
