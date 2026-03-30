import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { enrichAssignedEmails } from '@/lib/it-cmdb-assigned-user'
import {
  createFreshdeskTicket,
  fetchFreshdeskTicketsByIds,
  freshdeskTicketUrl,
  freshdeskStatusLabelNl,
  getFreshdeskItGroupId,
  isFreshdeskConfigured,
  listFreshdeskGroups,
} from '@/lib/freshdesk'
import { reconcileFreshdeskTicketForHardware } from '@/lib/it-cmdb-freshdesk-reconcile'
import {
  buildIntuneFreshdeskDescription,
  buildIntuneFreshdeskSubject,
  resolvePrimaryRequesterEmail,
} from '@/lib/it-cmdb-freshdesk-ticket'
import type { IntuneSnapshot, ItCmdbHardwareListItem } from '@/lib/it-cmdb-types'

function isIntuneSnapshot(v: unknown): v is IntuneSnapshot {
  return v != null && typeof v === 'object' && !Array.isArray(v) && typeof (v as IntuneSnapshot).graphDeviceId === 'string'
}

function parseFreshdeskId(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'bigint') return Number(raw)
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const hardwareId = searchParams.get('hardwareId')?.trim()
  const listGroups = searchParams.get('groups') === '1'

  if (!hardwareId) {
    if (listGroups) {
      if (!isFreshdeskConfigured()) {
        return NextResponse.json({
          configured: false,
          freshdeskItGroupId: null,
          groups: [] as const,
          error: 'Freshdesk niet geconfigureerd op de server.',
        })
      }
      try {
        const groups = await listFreshdeskGroups()
        return NextResponse.json({
          configured: true,
          freshdeskItGroupId: getFreshdeskItGroupId(),
          groups,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Freshdesk-fout'
        return NextResponse.json(
          { configured: true, freshdeskItGroupId: getFreshdeskItGroupId(), groups: [], error: msg },
          { status: 502 }
        )
      }
    }
    return NextResponse.json({ configured: isFreshdeskConfigured() })
  }

  const { data: row, error } = await auth.supabase.from('it_cmdb_hardware').select('*').eq('id', hardwareId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Apparaat niet gevonden' }, { status: 404 })

  if (!isFreshdeskConfigured()) {
    const [enriched] = await enrichAssignedEmails(auth.supabase, [row as { assigned_user_id: string | null }])
    const listItem = enriched as ItCmdbHardwareListItem
    return NextResponse.json({
      configured: false,
      error: 'Freshdesk niet geconfigureerd op de server.',
      item: { ...listItem, freshdesk_ticket_url: null },
      activeTicket: null,
      lastTicket: null,
      clearedStoredId: false,
      ticketHistory: [] as const,
      freshdeskItGroupConfigured: false,
    })
  }

  const reconcile = await reconcileFreshdeskTicketForHardware(auth.supabase, hardwareId, row)

  const { data: rowFresh, error: err2 } = await auth.supabase.from('it_cmdb_hardware').select('*').eq('id', hardwareId).maybeSingle()
  if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })
  if (!rowFresh) return NextResponse.json({ error: 'Apparaat niet gevonden' }, { status: 404 })

  const [enriched] = await enrichAssignedEmails(auth.supabase, [rowFresh as { assigned_user_id: string | null }])
  const listItem = enriched as ItCmdbHardwareListItem
  const fdNum = parseFreshdeskId(listItem.freshdesk_ticket_id)
  const ticketUrl = fdNum != null ? freshdeskTicketUrl(fdNum) : null

  const active = reconcile.activeTicket
  const last = reconcile.lastSeenTicket

  const { data: histRows, error: histErr } = await auth.supabase
    .from('it_cmdb_hardware_freshdesk_ticket')
    .select('freshdesk_ticket_id, created_at')
    .eq('hardware_id', hardwareId)
    .order('created_at', { ascending: false })

  let historyRows = histErr ? [] : (histRows ?? [])
  const curFd = parseFreshdeskId(listItem.freshdesk_ticket_id)
  if (curFd != null && !historyRows.some(r => Number(r.freshdesk_ticket_id) === curFd)) {
    const { error: repairErr } = await auth.supabase.from('it_cmdb_hardware_freshdesk_ticket').insert({
      hardware_id: hardwareId,
      freshdesk_ticket_id: curFd,
    })
    if (!repairErr) {
      const { data: again } = await auth.supabase
        .from('it_cmdb_hardware_freshdesk_ticket')
        .select('freshdesk_ticket_id, created_at')
        .eq('hardware_id', hardwareId)
        .order('created_at', { ascending: false })
      historyRows = again ?? historyRows
    }
  }

  const histIds = historyRows.map(r => Number(r.freshdesk_ticket_id)).filter(n => Number.isFinite(n)) as number[]
  const fdMap = histErr ? new Map() : await fetchFreshdeskTicketsByIds(histIds)

  const ticketHistory = historyRows.map(row => {
    const id = Number(row.freshdesk_ticket_id)
    const snap = fdMap.get(id)
    const linkedAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
    if (snap === 'missing' || snap === 'error') {
      return {
        id,
        linkedAt,
        subject: snap === 'missing' ? '(Ticket niet meer gevonden in Freshdesk)' : '(Status ophalen mislukt)',
        status: 0,
        statusLabel: snap === 'missing' ? 'Onbekend' : 'Onbekend',
        priority: 0,
        url: freshdeskTicketUrl(id),
        fetchState: snap as 'missing' | 'error',
      }
    }
    if (snap) {
      return {
        id: snap.id,
        linkedAt,
        subject: snap.subject,
        status: snap.status,
        statusLabel: freshdeskStatusLabelNl(snap.status),
        priority: snap.priority,
        url: freshdeskTicketUrl(snap.id),
        fetchState: 'ok' as const,
      }
    }
    return {
      id,
      linkedAt,
      subject: '(Geen gegevens)',
      status: 0,
      statusLabel: 'Onbekend',
      priority: 0,
      url: freshdeskTicketUrl(id),
      fetchState: 'error' as const,
    }
  })

  return NextResponse.json({
    configured: true,
    freshdeskItGroupConfigured: getFreshdeskItGroupId() != null,
    clearedStoredId: reconcile.clearedStoredId,
    fetchError: reconcile.fetchError,
    histError: histErr ? histErr.message : undefined,
    item: {
      ...listItem,
      freshdesk_ticket_url: ticketUrl,
    },
    ticketHistory,
    activeTicket:
      active != null
        ? {
            id: active.id,
            subject: active.subject,
            status: active.status,
            statusLabel: freshdeskStatusLabelNl(active.status),
            priority: active.priority,
            url: freshdeskTicketUrl(active.id),
          }
        : null,
    lastTicket:
      last != null
        ? {
            id: last.id,
            subject: last.subject,
            status: last.status,
            statusLabel: freshdeskStatusLabelNl(last.status),
            priority: last.priority,
            url: freshdeskTicketUrl(last.id),
          }
        : null,
  })
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  if (!isFreshdeskConfigured()) {
    return NextResponse.json(
      { error: 'Freshdesk niet geconfigureerd. Zet FRESHDESK_DOMAIN en FRESHDESK_API_KEY op de server.' },
      { status: 503 }
    )
  }

  let body: { hardwareId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const hardwareId = typeof body.hardwareId === 'string' ? body.hardwareId.trim() : ''
  if (!hardwareId) {
    return NextResponse.json({ error: 'hardwareId is verplicht' }, { status: 400 })
  }

  let { data: row, error } = await auth.supabase.from('it_cmdb_hardware').select('*').eq('id', hardwareId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Apparaat niet gevonden' }, { status: 404 })

  await reconcileFreshdeskTicketForHardware(auth.supabase, hardwareId, row)

  const { data: rowFresh, error: errFresh } = await auth.supabase
    .from('it_cmdb_hardware')
    .select('*')
    .eq('id', hardwareId)
    .maybeSingle()
  if (errFresh) return NextResponse.json({ error: errFresh.message }, { status: 500 })
  if (!rowFresh) return NextResponse.json({ error: 'Apparaat niet gevonden' }, { status: 404 })
  row = rowFresh

  const existingFd = parseFreshdeskId((row as { freshdesk_ticket_id?: unknown }).freshdesk_ticket_id)
  if (existingFd != null) {
    return NextResponse.json(
      {
        error: 'Er is al een open Freshdesk-ticket voor dit apparaat.',
        ticketId: existingFd,
        ticketUrl: freshdeskTicketUrl(existingFd),
      },
      { status: 409 }
    )
  }

  const [enriched] = await enrichAssignedEmails(auth.supabase, [row as { assigned_user_id: string | null }])
  const listItem = enriched as ItCmdbHardwareListItem
  const snap = isIntuneSnapshot(row.intune_snapshot) ? row.intune_snapshot : null

  const email = resolvePrimaryRequesterEmail(listItem, snap)
  if (!email) {
    return NextResponse.json(
      {
        error:
          'Geen e-mailadres bekend voor dit apparaat. Koppel een portalgebruiker of wacht tot Intune-sync een e-mail/UPN heeft.',
      },
      { status: 400 }
    )
  }

  let ticketId: number
  try {
    const created = await createFreshdeskTicket({
      email,
      subject: buildIntuneFreshdeskSubject(listItem, snap),
      description: buildIntuneFreshdeskDescription(listItem, snap),
      priority: 1,
      status: 2,
    })
    ticketId = created.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Freshdesk-fout'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { data: updated, error: updErr } = await auth.supabase
    .from('it_cmdb_hardware')
    .update({ freshdesk_ticket_id: ticketId, updated_at: new Date().toISOString() })
    .eq('id', hardwareId)
    .select('*')
    .maybeSingle()

  if (updErr || !updated) {
    return NextResponse.json(
      {
        error: `Ticket aangemaakt (${ticketId}) maar opslaan in CMDB mislukt${updErr ? `: ${updErr.message}` : ''}. Koppel het ticket handmatig.`,
        ticketId,
        ticketUrl: freshdeskTicketUrl(ticketId),
      },
      { status: 500 }
    )
  }

  const { error: histInsErr } = await auth.supabase.from('it_cmdb_hardware_freshdesk_ticket').insert({
    hardware_id: hardwareId,
    freshdesk_ticket_id: ticketId,
  })
  if (histInsErr && histInsErr.code !== '23505') {
    return NextResponse.json(
      {
        error: `Ticket en CMDB bijgewerkt, maar geschiedenis opslaan mislukt: ${histInsErr.message}`,
        ticketId,
        ticketUrl: freshdeskTicketUrl(ticketId),
      },
      { status: 500 }
    )
  }

  const [enrichedFinal] = await enrichAssignedEmails(auth.supabase, [updated as { assigned_user_id: string | null }])
  return NextResponse.json({
    ok: true,
    ticketId,
    ticketUrl: freshdeskTicketUrl(ticketId),
    item: {
      ...enrichedFinal,
      freshdesk_ticket_url: freshdeskTicketUrl(ticketId),
    },
  })
}
