import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import {
  getMailboxSettings,
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

/**
 * POST /api/beschikbaarheid/bulk-sync
 * Admin-only: synchroniseer beschikbaarheidsinstellingen voor alle portalgebruikers.
 * - Als Graph geconfigureerd: haalt mailboxSettings op per gebruiker
 * - Altijd: zorgt dat elke gebruiker een rij in gebruiker_beschikbaarheid heeft
 */
export async function POST(request: NextRequest) {
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

  if (!hasAdminKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 500 })
  }

  const adminClient = createAdminClient()
  const graphOk = isGraphConfigured()

  // Haal alle portalgebruikers op via auth.admin
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

  // Haal gebruiker_rollen op — alleen gebruikers met een rolrij zijn actieve portalgebruikers
  const { data: rollen } = await adminClient
    .from('gebruiker_rollen')
    .select('user_id')

  const rolUserIds = new Set<string>((rollen ?? []).map((r: { user_id: string }) => r.user_id))
  const portalUsers = alleAuthUsers.filter(u => rolUserIds.has(u.id))

  // Haal bestaande beschikbaarheidsrijen op zodat we work_schedule niet overschrijven
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

  // Parallel in batches van 5 (Graph rate limit)
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
            const ms = await getMailboxSettings(u.email)
            // Behoudt bestaand per-dag-schema als dat al is ingesteld
            const workSchedule = bestaandRij?.work_schedule ?? graphWorkHoursToWeekSchema(
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
              graph_synced_at: nu,
            }
            gesynchroniseerd++
          } catch (graphErr) {
            // Graph-fout voor deze gebruiker: sla op zonder Graph-data
            const msg = graphErr instanceof Error ? graphErr.message : String(graphErr)
            fouten.push(`${u.email}: ${msg}`)
            if (bestaandRij) {
              // Heeft al een rij — niets doen
              overgeslagen++
              return
            }
            // Nog geen rij — maak een standaardrij aan
            upsertData = {
              ...upsertData,
              oof_status: 'disabled',
              work_schedule: DEFAULT_WEEK_SCHEMA,
              work_timezone: 'W. Europe Standard Time',
            }
            standaard++
          }
        } else {
          // Geen Graph — maak standaardrij als die er nog niet is
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
    fouten: fouten.slice(0, 20), // max 20 fouten retourneren
    graph_configured: graphOk,
  })
}
