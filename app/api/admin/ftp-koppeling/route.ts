import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'
import * as ftp from 'basic-ftp'
import crypto from 'crypto'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Unauthorized', status: 401 }
  const { data: rol } = await supabase.from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  if (rol?.rol !== 'admin') return { ok: false as const, error: 'Geen toegang', status: 403 }
  return { ok: true as const, supabase }
}

// GET — huidige instellingen ophalen (wachtwoord gemaskeerd)
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const adminClient = createAdminClient()
  const { data } = await adminClient.from('ftp_koppeling_instellingen').select('*').eq('id', 1).maybeSingle()

  if (!data) return NextResponse.json({ instellingen: null })

  return NextResponse.json({
    instellingen: {
      ftp_host: data.ftp_host,
      ftp_user: data.ftp_user,
      ftp_password_set: Boolean(data.ftp_password),
      ftp_port: data.ftp_port ?? 21,
      ftp_pad: data.ftp_pad ?? '/',
      webhook_secret: data.webhook_secret,
      actief: data.actief,
      updated_at: data.updated_at,
    }
  })
}

// POST — instellingen opslaan
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json() as {
    ftp_host?: string
    ftp_user?: string
    ftp_password?: string
    ftp_port?: number
    ftp_pad?: string
    actief?: boolean
    genereer_secret?: boolean
  }

  const adminClient = createAdminClient()

  // Haal bestaande rij op zodat we niet overschrijven wat niet gestuurd is
  const { data: bestaand } = await adminClient.from('ftp_koppeling_instellingen').select('*').eq('id', 1).maybeSingle()

  const webhook_secret = body.genereer_secret
    ? crypto.randomBytes(32).toString('hex')
    : bestaand?.webhook_secret ?? crypto.randomBytes(32).toString('hex')

  const upsert: Record<string, unknown> = {
    id: 1,
    ftp_host: body.ftp_host ?? bestaand?.ftp_host,
    ftp_user: body.ftp_user ?? bestaand?.ftp_user,
    ftp_port: body.ftp_port ?? bestaand?.ftp_port ?? 21,
    ftp_pad: body.ftp_pad ?? bestaand?.ftp_pad ?? '/',
    actief: body.actief ?? bestaand?.actief ?? true,
    webhook_secret,
    updated_at: new Date().toISOString(),
  }

  // Wachtwoord alleen overschrijven als nieuw wachtwoord meegegeven
  if (body.ftp_password && body.ftp_password.trim()) {
    upsert.ftp_password = body.ftp_password
  } else {
    upsert.ftp_password = bestaand?.ftp_password
  }

  const { error } = await adminClient.from('ftp_koppeling_instellingen').upsert(upsert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, webhook_secret })
}

// PUT — verbinding testen
export async function PUT(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const adminClient = createAdminClient()
  const { data } = await adminClient.from('ftp_koppeling_instellingen').select('*').eq('id', 1).maybeSingle()

  if (!data?.ftp_host || !data?.ftp_user || !data?.ftp_password) {
    return NextResponse.json({ error: 'FTP-instellingen onvolledig. Sla eerst host, gebruikersnaam en wachtwoord op.' }, { status: 400 })
  }

  const client = new ftp.Client()
  client.ftp.verbose = false
  try {
    await client.access({
      host: data.ftp_host,
      user: data.ftp_user,
      password: data.ftp_password,
      port: data.ftp_port ?? 21,
      secure: false,
    })
    const list = await client.list(data.ftp_pad ?? '/')
    return NextResponse.json({ ok: true, bericht: `Verbinding geslaagd. ${list.length} item(s) in ${data.ftp_pad ?? '/'}.` })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Verbinding mislukt' }, { status: 500 })
  } finally {
    client.close()
  }
}
