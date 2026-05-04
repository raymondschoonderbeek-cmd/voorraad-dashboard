import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { isFreshdeskConfigured, freshdeskStatusLabelNl, isFreshdeskStatusClosed, freshdeskTicketUrl } from '@/lib/freshdesk'

type FdTicket = {
  id: number
  subject: string
  status: number
  statusLabel: string
  priority: number
  created_at: string
  updated_at: string
  requester_id: number
  email: string | null
  url: string | null
}

async function fetchTicketsByEmail(domain: string, authHeader: string, email: string): Promise<FdTicket[]> {
  const out: FdTicket[] = []
  let page = 1
  while (page <= 10) {
    const url = `https://${domain}/api/v2/tickets?email=${encodeURIComponent(email)}&order_by=created_at&order_type=desc&per_page=100&page=${page}`
    const res = await fetch(url, { headers: { Authorization: authHeader }, cache: 'no-store' })
    if (!res.ok) break
    const data = await res.json().catch(() => [])
    const arr = Array.isArray(data) ? data : []
    for (const t of arr) {
      out.push({
        id: t.id,
        subject: t.subject ?? '(Geen onderwerp)',
        status: t.status ?? 0,
        statusLabel: freshdeskStatusLabelNl(t.status ?? 0),
        priority: t.priority ?? 0,
        created_at: t.created_at ?? '',
        updated_at: t.updated_at ?? '',
        requester_id: t.requester_id ?? 0,
        email,
        url: freshdeskTicketUrl(t.id),
      })
    }
    if (arr.length < 100) break
    page++
  }
  return out
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  if (!isFreshdeskConfigured()) {
    return NextResponse.json({ geconfigureerd: false, open: [], historie: [] })
  }

  const { data: winkel } = await supabase
    .from('winkels')
    .select('id, naam, email, email_administratie')
    .eq('id', Number(id))
    .single()

  if (!winkel) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  const domain = (process.env.FRESHDESK_DOMAIN ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '').trim()
  const key = process.env.FRESHDESK_API_KEY?.trim() ?? ''
  const authHeader = `Basic ${Buffer.from(`${key}:X`).toString('base64')}`

  // Verzamel unieke e-mailadressen van de winkel
  const emails = [...new Set([winkel.email, winkel.email_administratie].filter((e): e is string => !!(e?.trim())))]

  if (emails.length === 0) {
    return NextResponse.json({ geconfigureerd: true, open: [], historie: [], geen_email: true })
  }

  try {
    const alleTicketsPerEmail = await Promise.all(emails.map(e => fetchTicketsByEmail(domain, authHeader, e)))
    const alleTickets = alleTicketsPerEmail.flat()

    // Dedupliceren op ticket-id
    const gezien = new Set<number>()
    const uniek = alleTickets.filter(t => { if (gezien.has(t.id)) return false; gezien.add(t.id); return true })
    uniek.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const open = uniek.filter(t => !isFreshdeskStatusClosed(t.status))
    const historie = uniek.filter(t => isFreshdeskStatusClosed(t.status))

    return NextResponse.json({ geconfigureerd: true, open, historie, gezocht_op: emails })
  } catch (err) {
    return NextResponse.json({ geconfigureerd: true, open: [], historie: [], fout: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 502 })
  }
}
