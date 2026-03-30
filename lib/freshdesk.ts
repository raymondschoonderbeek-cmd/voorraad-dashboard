/**
 * Freshdesk REST API v2 (server-side only).
 * Auth: API key as Basic username, password literal "X".
 */

export function isFreshdeskConfigured(): boolean {
  const d = process.env.FRESHDESK_DOMAIN?.trim()
  const k = process.env.FRESHDESK_API_KEY?.trim()
  return !!(d && k)
}

/** Freshdesk-groep (bijv. IT); zet FRESHDESK_IT_GROUP_ID op de server (numeriek id uit Admin → Groups). */
export function getFreshdeskItGroupId(): number | null {
  const raw = process.env.FRESHDESK_IT_GROUP_ID?.trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
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
  /** Overschrijft FRESHDESK_IT_GROUP_ID; weglaten = gebruik env FRESHDESK_IT_GROUP_ID. */
  groupId?: number | null
}

export async function createFreshdeskTicket(input: CreateFreshdeskTicketInput): Promise<{ id: number }> {
  const domain = normalizeDomain(process.env.FRESHDESK_DOMAIN ?? '')
  const key = process.env.FRESHDESK_API_KEY?.trim()
  if (!domain || !key) {
    throw new Error('Freshdesk niet geconfigureerd (FRESHDESK_DOMAIN, FRESHDESK_API_KEY).')
  }

  const url = `https://${domain}/api/v2/tickets`
  const auth = Buffer.from(`${key}:X`).toString('base64')

  const resolvedGroup =
    input.groupId !== undefined && input.groupId !== null ? input.groupId : getFreshdeskItGroupId()

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
      ...(resolvedGroup != null ? { group_id: resolvedGroup } : {}),
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

/** Rij uit GET /api/v2/groups (Freshdesk v2). */
export type FreshdeskGroupListItem = {
  id: number
  name: string
  description: string | null
  /** o.a. support_agent_group */
  group_type: string | null
}

/**
 * Alle agent-groepen (pagina’s doorlopen). Vereist API-key met recht op groepen.
 * @see https://developers.freshdesk.com/api/#list_all_groups
 */
export async function listFreshdeskGroups(): Promise<FreshdeskGroupListItem[]> {
  const domain = normalizeDomain(process.env.FRESHDESK_DOMAIN ?? '')
  const key = process.env.FRESHDESK_API_KEY?.trim()
  if (!domain || !key) {
    throw new Error('Freshdesk niet geconfigureerd (FRESHDESK_DOMAIN, FRESHDESK_API_KEY).')
  }

  const auth = Buffer.from(`${key}:X`).toString('base64')
  const out: FreshdeskGroupListItem[] = []
  let page = 1
  const perPage = 100

  for (;;) {
    const url = `https://${domain}/api/v2/groups?page=${page}&per_page=${perPage}`
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    })

    const raw = await res.text()
    let json: unknown
    try {
      json = JSON.parse(raw) as unknown
    } catch {
      throw new Error(`Freshdesk groups (${res.status}): geen JSON`)
    }

    if (!res.ok) {
      const detail = typeof json === 'object' && json && 'description' in json
        ? String((json as { description?: unknown }).description ?? '')
        : raw.slice(0, 400)
      throw new Error(`Freshdesk groups (${res.status}): ${detail}`)
    }

    const arr = Array.isArray(json) ? json : []
    for (const g of arr) {
      if (g == null || typeof g !== 'object') continue
      const row = g as { id?: unknown; name?: unknown; description?: unknown; group_type?: unknown }
      const id = Number(row.id)
      const name = typeof row.name === 'string' ? row.name : ''
      if (!Number.isFinite(id)) continue
      out.push({
        id,
        name: name || `(groep ${id})`,
        description: typeof row.description === 'string' ? row.description : null,
        group_type: typeof row.group_type === 'string' ? row.group_type : null,
      })
    }

    if (arr.length < perPage) break
    page += 1
    if (page > 30) break
  }

  return out
}

export function freshdeskTicketUrl(ticketId: number): string | null {
  const domain = normalizeDomain(process.env.FRESHDESK_DOMAIN ?? '')
  if (!domain) return null
  return `https://${domain}/a/tickets/${ticketId}`
}

/** Standaard Freshdesk v2: 2 Open, 3 Pending, 4 Resolved, 5 Closed */
export function isFreshdeskStatusClosed(status: number): boolean {
  return status === 4 || status === 5
}

export type FreshdeskTicketSnapshot = {
  id: number
  subject: string
  status: number
  priority: number
  /** Freshdesk ticket field `group_id` (API v2). */
  group_id: number | null
}

export async function fetchFreshdeskTicketById(
  ticketId: number
): Promise<{ ok: true; ticket: FreshdeskTicketSnapshot } | { ok: false; httpStatus: number; notFound: boolean }> {
  const domain = normalizeDomain(process.env.FRESHDESK_DOMAIN ?? '')
  const key = process.env.FRESHDESK_API_KEY?.trim()
  if (!domain || !key) {
    throw new Error('Freshdesk niet geconfigureerd (FRESHDESK_DOMAIN, FRESHDESK_API_KEY).')
  }

  const url = `https://${domain}/api/v2/tickets/${ticketId}`
  const auth = Buffer.from(`${key}:X`).toString('base64')

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  })

  if (res.status === 404) {
    return { ok: false, httpStatus: 404, notFound: true }
  }

  const json = (await res.json().catch(() => ({}))) as {
    id?: number
    subject?: string
    status?: number
    priority?: number
    group_id?: number | null
  }

  if (!res.ok) {
    return { ok: false, httpStatus: res.status, notFound: false }
  }

  const id = Number(json.id)
  if (!Number.isFinite(id)) {
    return { ok: false, httpStatus: res.status, notFound: false }
  }

  const gid = json.group_id
  const group_id = typeof gid === 'number' && Number.isFinite(gid) ? gid : null

  return {
    ok: true,
    ticket: {
      id,
      subject: typeof json.subject === 'string' ? json.subject : '(Geen onderwerp)',
      status: typeof json.status === 'number' ? json.status : 0,
      priority: typeof json.priority === 'number' ? json.priority : 0,
      group_id,
    },
  }
}

/** Parallel ophalen van meerdere tickets (voor geschiedenis per apparaat). */
export async function fetchFreshdeskTicketsByIds(
  ticketIds: number[]
): Promise<Map<number, FreshdeskTicketSnapshot | 'missing' | 'error'>> {
  const unique = [...new Set(ticketIds.filter(id => Number.isFinite(id) && id > 0))] as number[]
  const out = new Map<number, FreshdeskTicketSnapshot | 'missing' | 'error'>()
  await Promise.all(
    unique.map(async id => {
      try {
        const r = await fetchFreshdeskTicketById(id)
        if (!r.ok) {
          out.set(id, r.notFound ? 'missing' : 'error')
        } else {
          out.set(id, r.ticket)
        }
      } catch {
        out.set(id, 'error')
      }
    })
  )
  return out
}

export function freshdeskStatusLabelNl(status: number): string {
  switch (status) {
    case 2:
      return 'Open'
    case 3:
      return 'In behandeling'
    case 4:
      return 'Opgelost'
    case 5:
      return 'Gesloten'
    default:
      return `Status ${status}`
  }
}
