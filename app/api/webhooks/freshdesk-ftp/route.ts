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

async function haalFreshdeskBijlageOp(url: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString('base64')}`,
    },
  })
  if (!res.ok) throw new Error(`Bijlage downloaden mislukt: ${res.status} ${res.statusText}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function haalFreshdeskTicketOp(ticketId: string, apiKey: string, domain: string): Promise<FreshdeskTicket> {
  const res = await fetch(
    `https://${domain}.freshdesk.com/api/v2/tickets/${ticketId}?include=attachments`,
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

export async function POST(request: NextRequest) {
  try {
    const adminClient = createAdminClient()

    // Instellingen ophalen
    const { data: instellingen } = await adminClient
      .from('ftp_koppeling_instellingen')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (!instellingen?.actief) {
      return NextResponse.json({ error: 'FTP-koppeling is niet actief' }, { status: 503 })
    }

    // Webhook secret verifiëren
    if (instellingen.webhook_secret && !verifySecret(request, instellingen.webhook_secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!instellingen.ftp_host || !instellingen.ftp_user || !instellingen.ftp_password) {
      return NextResponse.json({ error: 'FTP-instellingen onvolledig' }, { status: 500 })
    }

    // Freshdesk API key en domein uit env
    const freshdeskApiKey = process.env.FRESHDESK_API_KEY
    const freshdeskDomain = process.env.FRESHDESK_DOMAIN
    if (!freshdeskApiKey || !freshdeskDomain) {
      return NextResponse.json({ error: 'FRESHDESK_API_KEY of FRESHDESK_DOMAIN ontbreekt in omgeving' }, { status: 500 })
    }

    // Ticket ID uit webhook body
    const body = await request.json() as { ticket_id?: string | number }
    const ticketId = String(body.ticket_id ?? '')
    if (!ticketId) {
      return NextResponse.json({ error: 'ticket_id ontbreekt in webhook body' }, { status: 400 })
    }

    // Ticket + bijlagen ophalen via Freshdesk API
    const ticket = await haalFreshdeskTicketOp(ticketId, freshdeskApiKey, freshdeskDomain)

    if (!ticket.attachments || ticket.attachments.length === 0) {
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

      // Doelmap aanmaken als die niet bestaat
      const doelpad = instellingen.ftp_pad ?? '/'
      await client.ensureDir(doelpad)

      // Elke bijlage downloaden en uploaden
      for (const bijlage of ticket.attachments) {
        try {
          const buffer = await haalFreshdeskBijlageOp(bijlage.attachment_url, freshdeskApiKey)
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

    return NextResponse.json({
      ok: fouten.length === 0,
      ticket_id: ticketId,
      geupload,
      fouten,
      bericht: `${geupload.length} bestand(en) geüpload${fouten.length > 0 ? `, ${fouten.length} mislukt` : ''}.`,
    })
  } catch (e) {
    console.error('[freshdesk-ftp webhook]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Onbekende fout' }, { status: 500 })
  }
}
