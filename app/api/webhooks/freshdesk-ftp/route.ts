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
  // Controleer X-Webhook-Secret header (stel dit in als custom header in Freshdesk Observer)
  const headerSecret = request.headers.get('x-webhook-secret')
  if (headerSecret) return headerSecret === secret

  // Fallback: query param ?secret=xxx
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')
  return querySecret === secret
}

async function haalFreshdeskBijlageOp(url: string): Promise<Buffer> {
  // attachment_url is een pre-signed S3 URL — geen Authorization header meesturen
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
  entry: { ticket_id?: string; status: string; bericht: string; geupload?: string[]; fouten?: string[] }
) {
  await adminClient.from('ftp_webhook_log').insert({
    ticket_id: entry.ticket_id ?? null,
    status: entry.status,
    bericht: entry.bericht,
    geupload: entry.geupload ?? [],
    fouten: entry.fouten ?? [],
  }).then(() => {}, () => {}) // log nooit blokkeren
}

export async function POST(request: NextRequest) {
  const adminClient = createAdminClient()
  let ticketId = ''

  try {
    // Instellingen ophalen
    const { data: instellingen } = await adminClient
      .from('ftp_koppeling_instellingen')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (!instellingen?.actief) {
      await logEntry(adminClient, { status: 'fout', bericht: 'FTP-koppeling is niet actief.' })
      return NextResponse.json({ error: 'FTP-koppeling is niet actief' }, { status: 503 })
    }

    // Webhook secret verifiëren
    if (instellingen.webhook_secret && !verifySecret(request, instellingen.webhook_secret)) {
      await logEntry(adminClient, { status: 'auth_fout', bericht: 'Webhook secret klopt niet — verzoek geweigerd.' })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!instellingen.ftp_host || !instellingen.ftp_user || !instellingen.ftp_password) {
      await logEntry(adminClient, { status: 'fout', bericht: 'FTP-instellingen onvolledig (host, gebruiker of wachtwoord ontbreekt).' })
      return NextResponse.json({ error: 'FTP-instellingen onvolledig' }, { status: 500 })
    }

    // Freshdesk API key en domein uit env
    const freshdeskApiKey = process.env.FRESHDESK_API_KEY
    const freshdeskDomain = process.env.FRESHDESK_DOMAIN
    if (!freshdeskApiKey || !freshdeskDomain) {
      await logEntry(adminClient, { status: 'fout', bericht: 'FRESHDESK_API_KEY of FRESHDESK_DOMAIN ontbreekt in omgeving.' })
      return NextResponse.json({ error: 'FRESHDESK_API_KEY of FRESHDESK_DOMAIN ontbreekt in omgeving' }, { status: 500 })
    }

    // Ticket ID uit webhook body
    const body = await request.json() as { ticket_id?: string | number }
    ticketId = String(body.ticket_id ?? '')
    if (!ticketId) {
      await logEntry(adminClient, { status: 'fout', bericht: 'ticket_id ontbreekt in webhook body.' })
      return NextResponse.json({ error: 'ticket_id ontbreekt in webhook body' }, { status: 400 })
    }

    // Ticket + bijlagen ophalen via Freshdesk API
    const ticket = await haalFreshdeskTicketOp(ticketId, freshdeskApiKey, freshdeskDomain)

    if (!ticket.attachments || ticket.attachments.length === 0) {
      await logEntry(adminClient, { ticket_id: ticketId, status: 'geen_bijlagen', bericht: `Ticket #${ticketId} heeft geen bijlagen.` })
      return NextResponse.json({ ok: true, bericht: `Ticket #${ticketId} heeft geen bijlagen. Niets geüpload.` })
    }

    // FTP verbinding openen
    const client = new ftp.Client()
    client.ftp.verbose = false
    const geupload: string[] = []
    const fouten: string[] = []

    try {
      await client.access({
        host: instellingen.ftp_host,
        user: instellingen.ftp_user,
        password: instellingen.ftp_password,
        port: instellingen.ftp_port ?? 21,
        secure: false,
      })

      const doelpad = instellingen.ftp_pad ?? '/'
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
    await logEntry(adminClient, { ticket_id: ticketId, status, bericht, geupload, fouten })

    return NextResponse.json({ ok: fouten.length === 0, ticket_id: ticketId, geupload, fouten, bericht })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    console.error('[freshdesk-ftp webhook]', e)
    await logEntry(adminClient, { ticket_id: ticketId || undefined, status: 'fout', bericht: msg })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
