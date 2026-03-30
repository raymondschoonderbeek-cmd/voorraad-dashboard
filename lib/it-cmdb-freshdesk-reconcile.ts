import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchFreshdeskTicketById,
  isFreshdeskConfigured,
  isFreshdeskStatusClosed,
  type FreshdeskTicketSnapshot,
} from '@/lib/freshdesk'

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

export type ReconcileFreshdeskResult = {
  /** Actief ticket (open/pending) — koppel in CMDB blijft staan */
  activeTicket: FreshdeskTicketSnapshot | null
  /** Ticket was gesloten/opgelost of 404: CMDB-veld is leeggemaakt */
  clearedStoredId: boolean
  /** Laatst bekende ticketinfo (bij clear door resolved/closed), of null */
  lastSeenTicket: FreshdeskTicketSnapshot | null
  /** Freshdesk-API faalde (niet 404) — CMDB niet gewijzigd */
  fetchError?: string
}

/**
 * Verwijdert `freshdesk_ticket_id` in CMDB als het ticket in Freshdesk ontbreekt (404)
 * of status Resolved/Closed heeft. Anders blijft het id staan en wordt het ticket teruggegeven.
 */
export async function reconcileFreshdeskTicketForHardware(
  supabase: SupabaseClient,
  hardwareId: string,
  row: { freshdesk_ticket_id?: unknown }
): Promise<ReconcileFreshdeskResult> {
  const empty: ReconcileFreshdeskResult = {
    activeTicket: null,
    clearedStoredId: false,
    lastSeenTicket: null,
  }

  if (!isFreshdeskConfigured()) return empty

  const fdId = parseFdId(row.freshdesk_ticket_id)
  if (fdId == null) return empty

  let fetched: Awaited<ReturnType<typeof fetchFreshdeskTicketById>>
  try {
    fetched = await fetchFreshdeskTicketById(fdId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Freshdesk-fout'
    return { ...empty, fetchError: msg }
  }

  if (!fetched.ok) {
    if (fetched.notFound) {
      const { error } = await supabase
        .from('it_cmdb_hardware')
        .update({ freshdesk_ticket_id: null, updated_at: new Date().toISOString() })
        .eq('id', hardwareId)
      if (error) {
        return { ...empty, fetchError: error.message }
      }
      return { ...empty, clearedStoredId: true, lastSeenTicket: null }
    }
    return {
      ...empty,
      fetchError: `Freshdesk ticket ophalen mislukt (HTTP ${fetched.httpStatus}).`,
    }
  }

  const t = fetched.ticket
  if (isFreshdeskStatusClosed(t.status)) {
    const { error } = await supabase
      .from('it_cmdb_hardware')
      .update({ freshdesk_ticket_id: null, updated_at: new Date().toISOString() })
      .eq('id', hardwareId)
    if (error) {
      return { ...empty, fetchError: error.message, activeTicket: t }
    }
    return {
      activeTicket: null,
      clearedStoredId: true,
      lastSeenTicket: t,
    }
  }

  return {
    activeTicket: t,
    clearedStoredId: false,
    lastSeenTicket: null,
  }
}
