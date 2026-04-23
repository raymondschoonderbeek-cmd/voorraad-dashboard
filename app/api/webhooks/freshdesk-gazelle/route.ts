import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'

type Product = {
  lev_nr: string
  omschrijving: string
  gewenste_leverweek: string
  aantal: string
  ve: string
  totaal_stuks: string
}

function verifySecret(request: NextRequest, secret: string): boolean {
  const headerSecret = request.headers.get('x-webhook-secret')
  if (headerSecret) return headerSecret === secret
  return request.nextUrl.searchParams.get('secret') === secret
}

function stripHtml(html: string): string {
  // <br> inside table cells moet een spatie worden (niet newline),
  // anders breekt "Pakket A<br>geen" de kolom-detectie.
  const normalized = html.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_, content: string) =>
    `<td>${content.replace(/<br\s*\/?>/gi, ' ')}</td>`
  )
  return normalized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/th>/gi, '\t')
    .replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractField(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`${escaped}\\s*:?\\s*([^\n\t]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function parseProducten(text: string): Product[] {
  const lines = text.split('\n').map(l => l.trim())
  const headerIdx = lines.findIndex(l =>
    l.toLowerCase().includes('lev.nr') || l.toLowerCase().includes('omschrijving')
  )
  if (headerIdx < 0) return []

  const producten: Product[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (
      line.toLowerCase().includes('vriendelijke groet') ||
      line.toLowerCase().includes('klik hier') ||
      line.toLowerCase().includes('afmelden')
    ) break
    const cols = line.split('\t').map(c => c.trim())
    if (cols.length >= 2 && cols[0]) {
      producten.push({
        lev_nr: cols[0] ?? '',
        omschrijving: cols[1] ?? '',
        gewenste_leverweek: cols[2] ?? '',
        aantal: cols[3] ?? '',
        ve: cols[4] ?? '',
        totaal_stuks: cols[5] ?? '',
      })
    }
  }
  return producten
}

function parseAdres(text: string): string {
  const start = text.toLowerCase().indexOf('adresinformatie')
  const end = text.toLowerCase().indexOf('door ons bestelde')
  if (start < 0) return ''
  const segment = end > start ? text.slice(start, end) : text.slice(start)
  return segment
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.toLowerCase().startsWith('adresinformatie'))
    .join(', ')
}

function parseDescription(html: string) {
  const text = stripHtml(html)
  return {
    besteldatum: extractField(text, 'Besteldatum') || null,
    bestelnummer: extractField(text, 'Bestelnummer') || null,
    naam: extractField(text, 'Naam') || null,
    bedrijfsnaam: extractField(text, 'Bedrijfsnaam') || null,
    emailadres: extractField(text, 'E-mailadres') || null,
    referentie: extractField(text, 'Referentie') || null,
    opmerkingen: extractField(text, 'Opmerkingen') || null,
    adres: parseAdres(text) || null,
    producten: parseProducten(text),
  }
}

/**
 * POST /api/webhooks/freshdesk-gazelle
 * Freshdesk Observer webhook voor Gazelle pakket orders.
 * Secret validatie via X-Webhook-Secret header (of ?secret= query param).
 * Secret beheer via /dashboard/gazelle-pakket-orders (admin).
 */
export async function POST(request: NextRequest) {
  if (!hasAdminKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 500 })
  }

  const admin = createAdminClient()

  // Secret ophalen uit database
  const { data: inst } = await admin
    .from('gazelle_observer_instellingen')
    .select('webhook_secret, actief')
    .eq('id', 1)
    .maybeSingle()

  if (!inst?.actief) {
    return NextResponse.json({ error: 'Gazelle observer is niet actief' }, { status: 503 })
  }

  if (inst.webhook_secret && !verifySecret(request, inst.webhook_secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  // Freshdesk kan fields nesten onder freshdesk_webhook of direct op root sturen
  const ticket = (body.freshdesk_webhook ?? body) as Record<string, unknown>
  const ticketId = ticket.ticket_id ?? ticket.id
  const rawDescription = String(ticket.ticket_description ?? ticket.description ?? '')
  const rawText = String(ticket.ticket_description_text ?? ticket.description_text ?? '')
  const htmlToParse = rawDescription || rawText

  if (!htmlToParse) {
    return NextResponse.json({ error: 'Geen beschrijving gevonden in payload' }, { status: 422 })
  }

  const parsed = parseDescription(htmlToParse)
  const row = {
    besteldatum: parsed.besteldatum,
    bestelnummer: parsed.bestelnummer,
    naam: parsed.naam,
    bedrijfsnaam: parsed.bedrijfsnaam,
    emailadres: parsed.emailadres,
    referentie: parsed.referentie,
    opmerkingen: parsed.opmerkingen,
    adres: parsed.adres,
    producten: parsed.producten,
    raw_description: rawDescription || rawText,
  }

  let dbError: { message: string } | null = null

  if (ticketId) {
    const { error } = await admin
      .from('gazelle_pakket_orders')
      .upsert(
        { freshdesk_ticket_id: String(ticketId), ...row },
        { onConflict: 'freshdesk_ticket_id', ignoreDuplicates: true }
      )
    dbError = error
  } else {
    const { error } = await admin.from('gazelle_pakket_orders').insert(row)
    dbError = error
  }

  if (dbError) {
    console.error('[freshdesk-gazelle] DB fout:', dbError)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, bestelnummer: parsed.bestelnummer })
}
