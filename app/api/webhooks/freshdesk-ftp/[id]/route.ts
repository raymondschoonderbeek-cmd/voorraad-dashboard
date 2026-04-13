import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as ftp from 'basic-ftp'
import { Readable } from 'stream'

interface FreshdeskAttachment {
  id: number
  name: string
  content_type: string
  size: number
  attachment_url: string
}

interface FreshdeskTicket {
  id: number
  subject: string
  attachments: FreshdeskAttachment[]
}

function verifySecret(request: NextRequest, secret: string): boolean {
  const headerSecret = request.headers.get('x-webhook-secret')
  if (headerSecret) return headerSecret === secret
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')
  return querySecret === secret
}

async function haalFreshdeskBijlageOp(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bijlage downloaden mislukt: ${res.status} ${res.statusText}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function normalizeDomain(raw: string): string {
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '').trim()
}

async function haalFreshdeskTicketOp(ticketId: string, apiKey: string, domain: string): Promise<FreshdeskTicket> {
  const res = await fetch(
    `https://${normalizeDomain(domain)}/api/v2/tickets/${ticketId}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { description?: string }
    throw new Error(`Freshdesk ticket ophalen mislukt: ${res.status} — ${err.description ?? res.statusText}`)
  }
  return res.json() as Promise<FreshdeskTicket>
}

async function logEntry(
  adminClient: ReturnType<typeof createAdminClient>,
  entry: { koppeling_id: number; ticket_id?: string; status: string; bericht: string; geupload?: string[]; fouten?: string[] }
) {
  await adminClient.from('ftp_webhook_log').insert({
    koppeling_id: entry.koppeling_id,
    ticket_id: entry.ticket_id ?? null,
    status: entry.status,
    bericht: entry.bericht,
    geupload: entry.geupload ?? [],
    fouten: entry.fouten ?? [],
  }).then(() => {}, () => {})
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const koppelingId = parseInt(id)
  if (isNaN(koppelingId)) return NextResponse.json({ error: 'Ongeldig taak-ID' }, { status: 400 })

  const adminClient = createAdminClient()
  let ticketId = ''

  try {
    const { data: inst } = await adminClient
      .from('ftp_koppeling_instellingen')
      .select('*')
      .eq('id', koppelingId)
      .maybeSingle()

    if (!inst) return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 })

    if (!inst.actief) {
      await logEntry(adminClient, { koppeling_id: koppelingId, status: 'fout', bericht: 'FTP-koppeling is niet actief.' })
      return NextResponse.json({ error: 'FTP-koppeling is niet actief' }, { status: 503 })
    }

    if (inst.webhook_secret && !verifySecret(request, inst.webhook_secret)) {
      await logEntry(adminClient, { koppeling_id: koppelingId, status: 'auth_fout', bericht: 'Webhook secret klopt niet — verzoek geweigerd.' })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!inst.ftp_host || !inst.ftp_user || !inst.ftp_password) {
      await logEntry(adminClient, { koppeling_id: koppelingId, status: 'fout', bericht: 'FTP-instellingen onvolledig.' })
      return NextResponse.json({ error: 'FTP-instellingen onvolledig' }, { status: 500 })
    }

    const freshdeskApiKey = process.env.FRESHDESK_API_KEY
    const freshdeskDomain = process.env.FRESHDESK_DOMAIN
    if (!freshdeskApiKey || !freshdeskDomain) {
      await logEntry(adminClient, { koppeling_id: koppelingId, status: 'fout', bericht: 'FRESHDESK_API_KEY of FRESHDESK_DOMAIN ontbreekt in omgeving.' })
      return NextResponse.json({ error: 'FRESHDESK_API_KEY of FRESHDESK_DOMAIN ontbreekt in omgeving' }, { status: 500 })
    }

    const body = await request.json() as { ticket_id?: string | number }
    ticketId = String(body.ticket_id ?? '')
    if (!ticketId) {
      await logEntry(adminClient, { koppeling_id: koppelingId, status: 'fout', bericht: 'ticket_id ontbreekt in webhook body.' })
      return NextResponse.json({ error: 'ticket_id ontbreekt in webhook body' }, { status: 400 })
    }

    const ticket = await haalFreshdeskTicketOp(ticketId, freshdeskApiKey, freshdeskDomain)

    if (!ticket.attachments || ticket.attachments.length === 0) {
      await logEntry(adminClient, { koppeling_id: koppelingId, ticket_id: ticketId, status: 'geen_bijlagen', bericht: `Ticket #${ticketId} heeft geen bijlagen.` })
      return NextResponse.json({ ok: true, bericht: `Ticket #${ticketId} heeft geen bijlagen. Niets geüpload.` })
    }

    const client = new ftp.Client()
    client.ftp.verbose = false
    const geupload: string[] = []
    const fouten: string[] = []

    try {
      await client.access({
        host: inst.ftp_host,
        user: inst.ftp_user,
        password: inst.ftp_password,
        port: inst.ftp_port ?? 21,
        secure: false,
      })

      const doelpad = inst.ftp_pad ?? '/'
      await client.ensureDir(doelpad)

      for (const bijlage of ticket.attachments) {
        try {
          const buffer = await haalFreshdeskBijlageOp(bijlage.attachment_url)
          const stream = Readable.from(buffer)
          const remotePath = `${doelpad.replace(/\/$/, '')}/${bijlage.name}`
          await client.uploadFrom(stream, remotePath)
          geupload.push(bijlage.name)
        } catch (e) {
          fouten.push(`${bijlage.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    } finally {
      client.close()
    }

    const status = fouten.length === 0 ? 'ok' : geupload.length > 0 ? 'deels_ok' : 'fout'
    const bericht = `${geupload.length} bestand(en) geüpload${fouten.length > 0 ? `, ${fouten.length} mislukt` : ''}.`
    await logEntry(adminClient, { koppeling_id: koppelingId, ticket_id: ticketId, status, bericht, geupload, fouten })

    return NextResponse.json({ ok: fouten.length === 0, ticket_id: ticketId, geupload, fouten, bericht })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    console.error(`[freshdesk-ftp webhook ${koppelingId}]`, e)
    await logEntry(adminClient, { koppeling_id: koppelingId, ticket_id: ticketId || undefined, status: 'fout', bericht: msg })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
