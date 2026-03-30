import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { assertPortalUser, enrichAssignedEmails, parseAssignedUserId } from '@/lib/it-cmdb-assigned-user'
import { freshdeskTicketUrl, isFreshdeskConfigured } from '@/lib/freshdesk'
import { isCmdbSortKey, sortCmdbHardwareList, type CmdbSortKey } from '@/lib/it-cmdb-list-sort'
import type { ItCmdbHardwareListItem } from '@/lib/it-cmdb-types'

function parseFdId(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'bigint') return Number(raw)
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function ilikeFragment(value: string): string {
  return value.replace(/%/g, '').trim()
}

const DB_SORT_COLUMNS = new Set([
  'serial_number',
  'hostname',
  'user_name',
  'device_type',
  'notes',
  'location',
  'intune',
  'updated_at',
])

/** Sorteren op Intune JSON / portal-e-mail na enrich */
const MEMORY_SORT_KEYS = new Set<CmdbSortKey>(['user', 'compliance', 'last_sync', 'management'])

/**
 * GET: alle hardware-regels.
 * Zoeken: q (meerdere woorden = alle woorden moeten ergens matchen, AND over tokens).
 * Sorteren: sort + dir (asc|desc).
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const qRaw = searchParams.get('q')?.trim()
  const sortParam = searchParams.get('sort')?.trim() ?? 'serial_number'
  const ascending = searchParams.get('dir')?.trim().toLowerCase() !== 'desc'

  const sortKey: CmdbSortKey = isCmdbSortKey(sortParam) ? sortParam : 'serial_number'
  const needsMemorySort = MEMORY_SORT_KEYS.has(sortKey)

  let query = auth.supabase.from('it_cmdb_hardware').select('*')

  if (qRaw) {
    const tokens = qRaw
      .split(/\s+/)
      .map(t => ilikeFragment(t))
      .filter(t => t.length > 0)
      .slice(0, 12)

    for (const safe of tokens) {
      const baseOr = `serial_number.ilike.%${safe}%,hostname.ilike.%${safe}%,user_name.ilike.%${safe}%,device_type.ilike.%${safe}%,notes.ilike.%${safe}%,location.ilike.%${safe}%,intune.ilike.%${safe}%`
      let extra = ''
      try {
        const { data: rpcIds, error: rpcErr } = await auth.supabase.rpc('it_cmdb_user_ids_by_email_needle', {
          p_needle: safe,
        })
        if (!rpcErr && rpcIds) {
          const idList = (Array.isArray(rpcIds) ? rpcIds : []).filter((x): x is string => typeof x === 'string' && x.length > 0)
          if (idList.length > 0) {
            extra = `,assigned_user_id.in.(${idList.slice(0, 40).join(',')})`
          }
        }
      } catch {
        /* RPC ontbreekt op oude DB-migraties */
      }
      query = query.or(baseOr + extra)
    }
  }

  if (needsMemorySort) {
    query = query.order('serial_number', { ascending: true })
  } else if (DB_SORT_COLUMNS.has(sortKey)) {
    query = query.order(sortKey, { ascending })
  } else {
    query = query.order('serial_number', { ascending: true })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let enriched = (await enrichAssignedEmails(
    auth.supabase,
    (data ?? []) as { assigned_user_id: string | null }[]
  )) as ItCmdbHardwareListItem[]

  if (needsMemorySort) {
    enriched = sortCmdbHardwareList(enriched, sortKey, ascending)
  }

  const fd = isFreshdeskConfigured()
  const items = fd
    ? enriched.map(item => {
        const id = parseFdId((item as { freshdesk_ticket_id?: unknown }).freshdesk_ticket_id)
        return {
          ...item,
          freshdesk_ticket_url: id != null ? freshdeskTicketUrl(id) : null,
        }
      })
    : enriched
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const serial_number = typeof body.serial_number === 'string' ? body.serial_number.trim() : ''
  if (!serial_number) return NextResponse.json({ error: 'serial_number is verplicht' }, { status: 400 })

  const parsedAid = parseAssignedUserId(body)
  if (!parsedAid.ok) return NextResponse.json({ error: 'Ongeldige assigned_user_id' }, { status: 400 })
  const aid = parsedAid.value
  if (aid != null && !(await assertPortalUser(auth.supabase, aid))) {
    return NextResponse.json({ error: 'Gebruiker hoort niet bij het portal (gebruiker_rollen).' }, { status: 400 })
  }

  const row = {
    serial_number,
    hostname: typeof body.hostname === 'string' ? body.hostname.trim() : '',
    intune: typeof body.intune === 'string' ? body.intune.trim() || null : null,
    user_name: typeof body.user_name === 'string' ? body.user_name.trim() || null : null,
    device_type: typeof body.device_type === 'string' ? body.device_type.trim() || null : null,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    location: typeof body.location === 'string' ? body.location.trim() || null : null,
    assigned_user_id: aid === undefined ? null : aid,
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await auth.supabase.from('it_cmdb_hardware').insert(row).select('*').single()
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Dit serienummer bestaat al.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const [enriched] = await enrichAssignedEmails(auth.supabase, [data as { assigned_user_id: string | null }])
  return NextResponse.json({ item: enriched })
}
