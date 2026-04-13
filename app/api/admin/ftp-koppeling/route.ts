import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'
import crypto from 'crypto'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Unauthorized', status: 401 }
  const { data: rol } = await supabase.from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  if (rol?.rol !== 'admin') return { ok: false as const, error: 'Geen toegang', status: 403 }
  return { ok: true as const }
}

// GET — alle taken ophalen (wachtwoord gemaskeerd)
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('ftp_koppeling_instellingen')
    .select('id, naam, ftp_host, ftp_user, ftp_password, ftp_port, ftp_pad, actief, webhook_secret, updated_at')
    .order('id')

  // Haal laatste log per taak op
  const ids = (data ?? []).map(r => r.id as number)
  const { data: logData } = ids.length > 0
    ? await adminClient
        .from('ftp_webhook_log')
        .select('koppeling_id, status, created_at')
        .in('koppeling_id', ids)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Laatste log entry per koppeling_id
  const lastLog = new Map<number, { status: string; created_at: string }>()
  for (const row of logData ?? []) {
    const kid = row.koppeling_id as number
    if (!lastLog.has(kid)) lastLog.set(kid, { status: row.status as string, created_at: row.created_at as string })
  }

  return NextResponse.json({
    taken: (data ?? []).map(r => ({
      id: r.id,
      naam: r.naam,
      ftp_host: r.ftp_host,
      ftp_user: r.ftp_user,
      ftp_password_set: Boolean(r.ftp_password),
      ftp_port: r.ftp_port ?? 21,
      ftp_pad: r.ftp_pad ?? '/',
      actief: r.actief,
      webhook_secret: r.webhook_secret,
      updated_at: r.updated_at,
      laatste_status: lastLog.get(r.id as number) ?? null,
    }))
  })
}

// POST — nieuwe taak aanmaken
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json() as {
    naam?: string
    ftp_host?: string
    ftp_user?: string
    ftp_password?: string
    ftp_port?: number
    ftp_pad?: string
    actief?: boolean
  }

  const adminClient = createAdminClient()
  const webhook_secret = crypto.randomBytes(32).toString('hex')

  const { data, error } = await adminClient
    .from('ftp_koppeling_instellingen')
    .insert({
      naam: body.naam?.trim() || 'Nieuwe taak',
      ftp_host: body.ftp_host?.trim() || null,
      ftp_user: body.ftp_user?.trim() || null,
      ftp_password: body.ftp_password?.trim() || null,
      ftp_port: body.ftp_port ?? 21,
      ftp_pad: body.ftp_pad?.trim() || '/',
      actief: body.actief ?? true,
      webhook_secret,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id, webhook_secret })
}
