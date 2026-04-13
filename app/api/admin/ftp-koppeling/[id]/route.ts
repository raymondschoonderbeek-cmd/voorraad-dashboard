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
  return { ok: true as const }
}

type Params = { params: Promise<{ id: string }> }

// GET — één taak ophalen
export async function GET(request: NextRequest, { params }: Params) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('ftp_koppeling_instellingen')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  return NextResponse.json({
    taak: {
      id: data.id,
      naam: data.naam,
      ftp_host: data.ftp_host,
      ftp_user: data.ftp_user,
      ftp_password_set: Boolean(data.ftp_password),
      ftp_port: data.ftp_port ?? 21,
      ftp_pad: data.ftp_pad ?? '/',
      actief: data.actief,
      webhook_secret: data.webhook_secret,
      readme: data.readme ?? null,
      updated_at: data.updated_at,
    }
  })
}

// PUT — taak bijwerken
export async function PUT(request: NextRequest, { params }: Params) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await request.json() as {
    naam?: string
    ftp_host?: string
    ftp_user?: string
    ftp_password?: string
    ftp_port?: number
    ftp_pad?: string
    actief?: boolean
    genereer_secret?: boolean
    test?: boolean
    readme?: string
  }

  const adminClient = createAdminClient()

  // Test verbinding
  if (body.test) {
    const { data } = await adminClient
      .from('ftp_koppeling_instellingen')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!data?.ftp_host || !data?.ftp_user || !data?.ftp_password) {
      return NextResponse.json({ error: 'FTP-instellingen onvolledig.' }, { status: 400 })
    }
    const client = new ftp.Client()
    client.ftp.verbose = false
    try {
      await client.access({ host: data.ftp_host, user: data.ftp_user, password: data.ftp_password, port: data.ftp_port ?? 21, secure: false })
      const list = await client.list(data.ftp_pad ?? '/')
      return NextResponse.json({ ok: true, bericht: `Verbinding geslaagd. ${list.length} item(s) in ${data.ftp_pad ?? '/'}.` })
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Verbinding mislukt' }, { status: 500 })
    } finally {
      client.close()
    }
  }

  // Instellingen opslaan
  const { data: bestaand } = await adminClient
    .from('ftp_koppeling_instellingen')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!bestaand) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  const webhook_secret = body.genereer_secret
    ? crypto.randomBytes(32).toString('hex')
    : bestaand.webhook_secret ?? crypto.randomBytes(32).toString('hex')

  const update: Record<string, unknown> = {
    naam: body.naam?.trim() ?? bestaand.naam,
    ftp_host: body.ftp_host ?? bestaand.ftp_host,
    ftp_user: body.ftp_user ?? bestaand.ftp_user,
    ftp_port: body.ftp_port ?? bestaand.ftp_port ?? 21,
    ftp_pad: body.ftp_pad ?? bestaand.ftp_pad ?? '/',
    actief: body.actief ?? bestaand.actief ?? true,
    webhook_secret,
    readme: body.readme !== undefined ? body.readme : bestaand.readme,
    updated_at: new Date().toISOString(),
  }

  if (body.ftp_password?.trim()) {
    update.ftp_password = body.ftp_password
  } else {
    update.ftp_password = bestaand.ftp_password
  }

  const { error } = await adminClient
    .from('ftp_koppeling_instellingen')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, webhook_secret })
}

// DELETE — taak verwijderen
export async function DELETE(request: NextRequest, { params }: Params) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('ftp_koppeling_instellingen')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
