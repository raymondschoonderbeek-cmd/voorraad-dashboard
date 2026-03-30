/**
 * Freshdesk REST API v2 (server-side only).
 * Auth: API key as Basic username, password literal "X".
 */

export function isFreshdeskConfigured(): boolean {
  const d = process.env.FRESHDESK_DOMAIN?.trim()
  const k = process.env.FRESHDESK_API_KEY?.trim()
  return !!(d && k)
}

function normalizeDomain(raw: string): string {
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '').trim()
}

export type CreateFreshdeskTicketInput = {
  email: string
  subject: string
  description: string
  priority: number
  status: number
}

export async function createFreshdeskTicket(input: CreateFreshdeskTicketInput): Promise<{ id: number }> {
  const domain = normalizeDomain(process.env.FRESHDESK_DOMAIN ?? '')
  const key = process.env.FRESHDESK_API_KEY?.trim()
  if (!domain || !key) {
    throw new Error('Freshdesk niet geconfigureerd (FRESHDESK_DOMAIN, FRESHDESK_API_KEY).')
  }

  const url = `https://${domain}/api/v2/tickets`
  const auth = Buffer.from(`${key}:X`).toString('base64')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      email: input.email.trim(),
      subject: input.subject.slice(0, 250),
      description: input.description,
      priority: input.priority,
      status: input.status,
    }),
  })

  const json = (await res.json().catch(() => ({}))) as {
    id?: number
    description?: string
    errors?: unknown
    message?: string
  }

  if (!res.ok) {
    const parts: string[] = []
    if (typeof json.description === 'string') parts.push(json.description)
    if (json.errors != null) parts.push(typeof json.errors === 'string' ? json.errors : JSON.stringify(json.errors))
    if (typeof json.message === 'string') parts.push(json.message)
    const detail = parts.filter(Boolean).join(' — ') || res.statusText || 'Onbekende fout'
    throw new Error(`Freshdesk (${res.status}): ${detail.slice(0, 800)}`)
  }

  const id = Number(json.id)
  if (!Number.isFinite(id)) {
    throw new Error('Freshdesk gaf geen geldig ticket-id terug.')
  }
  return { id }
}

export function freshdeskTicketUrl(ticketId: number): string | null {
  const domain = normalizeDomain(process.env.FRESHDESK_DOMAIN ?? '')
  if (!domain) return null
  return `https://${domain}/a/tickets/${ticketId}`
}
