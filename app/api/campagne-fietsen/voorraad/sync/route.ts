import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, canAccessCampagneFietsen } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { computeCampagneVoorraadLive } from '@/lib/campagne-fietsen-voorraad-compute'
import { persistCampagneVoorraadSnapshot } from '@/lib/campagne-fietsen-voorraad-snapshot'
import type { CampagneVoorraadPayload } from '@/lib/campagne-fietsen-voorraad-types'
import { enrichPayloadWithBaseline } from '@/lib/campagne-fietsen-voorraad-baseline'

/**
 * GET: optioneel aan te roepen door een externe scheduler (niet-Vercel) met Authorization: Bearer CRON_SECRET
 * POST: handmatige herberekening (ingelogde gebruiker met campagne-toegang)
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const secret = process.env.CRON_SECRET?.trim()
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasAdminKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt: snapshot kan niet worden opgeslagen.' },
      { status: 503 }
    )
  }

  try {
    const admin = createAdminClient()
    const payload = await computeCampagneVoorraadLive(admin)
    await persistCampagneVoorraadSnapshot(admin, payload)
    return NextResponse.json({ ok: true, synced_at: new Date().toISOString() })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Sync mislukt'
    console.error('Campagne voorraad GET sync:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canAccessCampagneFietsen(supabase, user.id))) {
    return NextResponse.json({ error: 'Geen toegang tot Campagnefietsen' }, { status: 403 })
  }
  if (!hasAdminKey()) {
    return NextResponse.json(
      {
        error:
          'Herberekening opslaan vereist SUPABASE_SERVICE_ROLE_KEY op de server. Voeg deze toe aan .env.local of Vercel.',
      },
      { status: 503 }
    )
  }

  const stream = request.nextUrl.searchParams.get('stream') === '1'

  if (!stream) {
    try {
      const admin = createAdminClient()
      const payload = await computeCampagneVoorraadLive(admin)
      await persistCampagneVoorraadSnapshot(admin, payload)
      const synced_at = new Date().toISOString()
      const full: CampagneVoorraadPayload = {
        fietsen: payload.fietsen as CampagneVoorraadPayload['fietsen'],
        winkel_fouten: payload.winkel_fouten,
        synced_at,
      }
      await enrichPayloadWithBaseline(admin, full)
      return NextResponse.json({
        ok: true,
        synced_at,
        fietsen: full.fietsen,
        winkel_fouten: full.winkel_fouten,
        baseline_recorded_at: full.baseline_recorded_at ?? null,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Herberekening mislukt'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`))
      }
      try {
        const admin = createAdminClient()
        const payload = await computeCampagneVoorraadLive(admin, {
          onMeta: m => send({ type: 'meta', ...m }),
          onProgress: async (current, total, winkel) => {
            send({
              type: 'progress',
              current,
              total,
              winkelNaam: winkel.naam,
            })
          },
        })
        await persistCampagneVoorraadSnapshot(admin, payload)
        const synced_at = new Date().toISOString()
        const full: CampagneVoorraadPayload = {
          fietsen: payload.fietsen as CampagneVoorraadPayload['fietsen'],
          winkel_fouten: payload.winkel_fouten,
          synced_at,
        }
        await enrichPayloadWithBaseline(admin, full)
        send({
          type: 'result',
          fietsen: full.fietsen,
          winkel_fouten: full.winkel_fouten,
          synced_at,
          baseline_recorded_at: full.baseline_recorded_at ?? null,
        })
        controller.close()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Onbekende fout'
        send({ type: 'error', message: msg })
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
