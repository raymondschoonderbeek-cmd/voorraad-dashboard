import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import {
  getMailboxSettings,
  getWerklocatie,
  getWerklocatieSchema,
  isGraphConfigured,
} from '@/lib/microsoft-mailbox'
import { DEFAULT_WEEK_SCHEMA, type WeekSchema } from '@/lib/beschikbaarheid'

function graphWorkHoursToWeekSchema(days: string[], start: string, end: string): WeekSchema {
  const schema = structuredClone(DEFAULT_WEEK_SCHEMA)
  const ALLE_DAGEN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  for (const dag of ALLE_DAGEN) {
    schema[dag].enabled = days.includes(dag)
    if (days.includes(dag)) {
      schema[dag].start = start
      schema[dag].end = end
    }
  }
  return schema
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasAdminKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 500 })
  }

  const adminClient = createAdminClient()
  const graphOk = isGraphConfigured()

  const alleAuthUsers: { id: string; email: string }[] = []
  {
    let page = 1
    while (true) {
      const { data: { users: batch } } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
      if (!batch || batch.length === 0) break
      for (const u of batch) {
        if (u.email) alleAuthUsers.push({ id: u.id, email: u.email })
      }
      if (batch.length < 1000) break
      page++
    }
  }

  const { data: rollen } = await adminClient
    .from('gebruiker_rollen')
    .select('user_id')

  const rolUserIds = new Set<string>((rollen ?? []).map((r: { user_id: string }) => r.user_id))
  const portalUsers = alleAuthUsers.filter(u => rolUserIds.has(u.id))

  const { data: bestaande } = await adminClient
    .from('gebruiker_beschikbaarheid')
    .select('user_id, work_schedule')

  const bestaandeMap = new Map<string, { work_schedule: WeekSchema | null }>(
    (bestaande ?? []).map(r => [r.user_id as string, { work_schedule: r.work_schedule as WeekSchema | null }])
  )

  const nu = new Date().toISOString()
  let gesynchroniseerd = 0
  let standaard = 0
  let overgeslagen = 0
  const fouten: string[] = []

  const BATCH = 5
  for (let i = 0; i < portalUsers.length; i += BATCH) {
    const batch = portalUsers.slice(i, i + BATCH)
    await Promise.all(batch.map(async (u) => {
      try {
        const bestaandRij = bestaandeMap.get(u.id)
        let upsertData: Record<string, unknown> = {
          user_id: u.id,
          updated_at: nu,
        }

        if (graphOk) {
          try {
            const [ms, locatie, locSchema] = await Promise.all([
              getMailboxSettings(u.email),
              getWerklocatie(u.email).catch(() => ({ type: null, label: null })),
              getWerklocatieSchema(u.email).catch(() => ({})),
            ])
            const workSchedule = graphWorkHoursToWeekSchema(
              ms.workHours.days, ms.workHours.startTime, ms.workHours.endTime
            )
            upsertData = {
              ...upsertData,
              oof_status: ms.oof.status,
              oof_start: ms.oof.start,
              oof_end: ms.oof.end,
              oof_internal_msg: ms.oof.internalMsg,
              oof_external_msg: ms.oof.externalMsg,
              work_schedule: workSchedule,
              work_timezone: ms.workHours.timezone,
              werklocatie: locatie.label,
              werklocatie_schema: Object.keys(locSchema).length > 0 ? locSchema : null,
              graph_synced_at: nu,
            }
            gesynchroniseerd++
          } catch (graphErr) {
            const msg = graphErr instanceof Error ? graphErr.message : String(graphErr)
            fouten.push(`${u.email}: ${msg}`)
            if (bestaandRij) {
              overgeslagen++
              return
            }
            upsertData = {
              ...upsertData,
              oof_status: 'disabled',
              work_schedule: DEFAULT_WEEK_SCHEMA,
              work_timezone: 'W. Europe Standard Time',
            }
            standaard++
          }
        } else {
          if (bestaandRij) { overgeslagen++; return }
          upsertData = {
            ...upsertData,
            oof_status: 'disabled',
            work_schedule: DEFAULT_WEEK_SCHEMA,
            work_timezone: 'W. Europe Standard Time',
          }
          standaard++
        }

        await adminClient
          .from('gebruiker_beschikbaarheid')
          .upsert(upsertData, { onConflict: 'user_id' })
      } catch (e) {
        fouten.push(`${u.email}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }))
  }

  return NextResponse.json({
    ok: true,
    totaal: portalUsers.length,
    graph_gesynchroniseerd: gesynchroniseerd,
    standaard_aangemaakt: standaard,
    overgeslagen,
    fouten: fouten.slice(0, 20),
    graph_configured: graphOk,
  })
}
