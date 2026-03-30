import { NextRequest, NextResponse } from 'next/server'
import { requireInterneNieuwsBeheer } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { parseHHmmToMinutes } from '@/lib/amsterdam-time'

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Maandag',
  2: 'Dinsdag',
  3: 'Woensdag',
  4: 'Donderdag',
  5: 'Vrijdag',
  6: 'Zaterdag',
  7: 'Zondag',
}

/**
 * GET: digest-config (admin of interne-nieuws-module).
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { data, error } = await auth.supabase.from('drg_news_digest_config').select('*').eq('id', 1).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json({
      digest_enabled: true,
      digest_weekday: 5,
      digest_time_local: '09:00',
      digest_weekday_label: WEEKDAY_LABELS[5],
      last_digest_sent_at: null,
    })
  }

  const digest_weekday = Number((data as { digest_weekday?: number }).digest_weekday) || 5
  return NextResponse.json({
    digest_enabled: (data as { digest_enabled?: boolean }).digest_enabled !== false,
    digest_weekday,
    digest_time_local: typeof (data as { digest_time_local?: string }).digest_time_local === 'string'
      ? (data as { digest_time_local: string }).digest_time_local
      : '09:00',
    digest_weekday_label: WEEKDAY_LABELS[digest_weekday] ?? 'Vrijdag',
    last_digest_sent_at: (data as { last_digest_sent_at?: string | null }).last_digest_sent_at ?? null,
  })
}

/**
 * PATCH: digest-config (admin of interne-nieuws-module).
 */
export async function PATCH(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.digest_enabled === 'boolean') {
    update.digest_enabled = body.digest_enabled
  }
  if (body.digest_weekday !== undefined) {
    const n = Number(body.digest_weekday)
    if (!Number.isInteger(n) || n < 1 || n > 7) {
      return NextResponse.json({ error: 'digest_weekday: gebruik 1 (ma) t/m 7 (zo).' }, { status: 400 })
    }
    update.digest_weekday = n
  }
  if (body.digest_time_local !== undefined) {
    const s = String(body.digest_time_local).trim()
    if (parseHHmmToMinutes(s) == null) {
      return NextResponse.json({ error: 'digest_time_local: gebruik HH:mm (24 uur).' }, { status: 400 })
    }
    update.digest_time_local = s
  }

  let { data, error } = await auth.supabase.from('drg_news_digest_config').update(update).eq('id', 1).select('*').maybeSingle()

  if (!error && !data) {
    const ins = await auth.supabase
      .from('drg_news_digest_config')
      .insert({
        id: 1,
        digest_enabled: true,
        digest_weekday: 5,
        digest_time_local: '09:00',
        ...update,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single()
    data = ins.data
    error = ins.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Geen digest-config' }, { status: 500 })

  const digest_weekday = Number((data as { digest_weekday?: number }).digest_weekday) || 5
  return NextResponse.json({
    digest_enabled: (data as { digest_enabled?: boolean }).digest_enabled !== false,
    digest_weekday,
    digest_time_local: (data as { digest_time_local?: string }).digest_time_local ?? '09:00',
    digest_weekday_label: WEEKDAY_LABELS[digest_weekday] ?? 'Vrijdag',
    last_digest_sent_at: (data as { last_digest_sent_at?: string | null }).last_digest_sent_at ?? null,
  })
}
