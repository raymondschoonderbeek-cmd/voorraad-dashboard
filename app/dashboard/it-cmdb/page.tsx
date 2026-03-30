'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import { IntuneOverview } from '@/components/it-cmdb/IntuneOverview'
import type { ItCmdbHardware, ItCmdbHardwareListItem, IntuneSnapshot } from '@/lib/it-cmdb-types'
import type { CmdbSortKey } from '@/lib/it-cmdb-list-sort'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const F = FONT_FAMILY
/** Vaste leesbare tekst op witte kaarten (niet `textMuted` — te licht op wit) */
const TABLE_TEXT = '#1e293b'

function isIntuneSnapshot(v: unknown): v is IntuneSnapshot {
  return v != null && typeof v === 'object' && !Array.isArray(v) && typeof (v as IntuneSnapshot).graphDeviceId === 'string'
}

function formatIntuneSyncDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTicketLinkedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `jeroen.schrijver@domein.nl` → `Jeroen Schrijver` (local part gesplitst op . _ -) */
function prettyNameFromEmail(email: string): string {
  const local = email.trim().split('@')[0] ?? ''
  if (!local) return email.trim()
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length === 0) return email.trim()
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(s.trim())
}

function cmdbUserCellDisplay(row: ItCmdbHardwareListItem, snap: IntuneSnapshot | null): { label: string; title: string } {
  const portalEmail = row.assigned_user_email?.trim() || ''
  const intuneAddr = (snap?.emailAddress || snap?.userPrincipalName)?.trim() || ''
  const rawName = row.user_name?.trim() || ''

  const lines: string[] = []
  if (portalEmail) lines.push(portalEmail)
  if (intuneAddr && intuneAddr.toLowerCase() !== portalEmail.toLowerCase()) {
    lines.push(`Intune: ${intuneAddr}`)
  }

  if (rawName && !looksLikeEmail(rawName)) {
    return {
      label: rawName,
      title: lines.length ? lines.join('\n') : rawName,
    }
  }

  if (portalEmail) {
    return {
      label: prettyNameFromEmail(portalEmail),
      title: lines.join('\n') || portalEmail,
    }
  }

  if (intuneAddr) {
    return {
      label: prettyNameFromEmail(intuneAddr),
      title: lines.join('\n') || intuneAddr,
    }
  }

  if (rawName && looksLikeEmail(rawName)) {
    return {
      label: prettyNameFromEmail(rawName),
      title: rawName,
    }
  }

  return { label: '—', title: '' }
}

function isNonCompliantSnapshot(s: IntuneSnapshot | null): boolean {
  const st = s?.complianceState?.trim()
  if (!st) return false
  const lo = st.toLowerCase()
  return lo.includes('noncompliant') || lo.includes('non-compliant')
}

function CmdbSortTh({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
}: {
  col: CmdbSortKey
  label: string
  sortKey: CmdbSortKey
  sortDir: 'asc' | 'desc'
  onSort: (c: CmdbSortKey) => void
}) {
  const active = sortKey === col
  return (
    <th scope="col" className="text-left px-3 py-3 font-bold whitespace-nowrap align-bottom" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 max-w-full rounded-lg px-1 -mx-1 py-0.5 hover:bg-[rgba(45,69,124,0.08)] text-left"
        onClick={e => {
          e.stopPropagation()
          onSort(col)
        }}
      >
        <span>{label}</span>
        {active ? (
          <span className="text-[11px] font-semibold opacity-90 shrink-0" aria-hidden>
            {sortDir === 'asc' ? '▲' : '▼'}
          </span>
        ) : (
          <span className="text-[10px] opacity-25 shrink-0" aria-hidden>
            ↕
          </span>
        )}
      </button>
    </th>
  )
}

function ComplianceBadge({ state }: { state: string | null | undefined }) {
  const s = state?.trim()
  if (!s) {
    return (
      <span className="text-xs" style={{ color: 'rgba(100,116,139,0.85)' }}>
        —
      </span>
    )
  }
  const lower = s.toLowerCase()
  let bg = 'rgba(100,116,139,0.12)'
  let fg = '#475569'
  if (lower === 'compliant') {
    bg = '#dcfce7'
    fg = '#15803d'
  } else if (lower.includes('noncompliant') || lower.includes('non-compliant')) {
    bg = '#fee2e2'
    fg = '#b91c1c'
  } else if (lower.includes('grace') || lower.includes('graceperiod')) {
    bg = '#fef9c3'
    fg = '#a16207'
  } else if (lower === 'unknown' || lower === 'configmanager') {
    bg = 'rgba(45,69,124,0.08)'
    fg = DYNAMO_BLUE
  }
  return (
    <span
      className="inline-block max-w-[min(160px,100%)] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight"
      style={{ background: bg, color: fg, fontFamily: F }}
      title={s}
    >
      {s}
    </span>
  )
}

const FILTER_DEBOUNCE_MS = 350

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

function emptyForm(): Omit<
  ItCmdbHardware,
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'assigned_user_id' | 'intune_snapshot' | 'freshdesk_ticket_id'
> & {
  assigned_user_id: string
} {
  return {
    serial_number: '',
    hostname: '',
    intune: '',
    user_name: '',
    assigned_user_id: '',
    device_type: '',
    notes: '',
    location: '',
  }
}

export default function ItCmdbPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [q, setQ] = useState('')
  /** true = API krijgt scope=full (ook serie, hostname, locatie …); false = automatisch (alleen letters → alleen naam/e-mail) */
  const [searchAllFields, setSearchAllFields] = useState(false)
  const [sortKey, setSortKey] = useState<CmdbSortKey>('serial_number')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ItCmdbHardwareListItem | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const [intuneSyncing, setIntuneSyncing] = useState(false)
  const [intuneMsg, setIntuneMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [freshdeskBusyId, setFreshdeskBusyId] = useState<string | null>(null)
  const [freshdeskMsg, setFreshdeskMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /** Apparaat openen voor detail + Freshdesk (klik op rij) */
  const [deviceDetailId, setDeviceDetailId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const res = await fetch('/api/auth/session-info')
      const info = await res.json().catch(() => ({}))
      if (cancelled) return
      setAllowed(info.canAccessItCmdb === true)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (allowed === false) router.replace('/dashboard')
  }, [allowed, router])

  const dq = useDebouncedValue(q, FILTER_DEBOUNCE_MS)

  const queryUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (dq.trim()) p.set('q', dq.trim())
    if (searchAllFields) p.set('scope', 'full')
    p.set('sort', sortKey)
    p.set('dir', sortDir)
    return `/api/it-cmdb?${p.toString()}`
  }, [dq, sortKey, sortDir, searchAllFields])

  const toggleSort = useCallback((key: CmdbSortKey) => {
    setSortKey(prevKey => {
      if (prevKey === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
        return prevKey
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const { data, error, isLoading, mutate } = useSWR<{ items: ItCmdbHardwareListItem[] }>(allowed ? queryUrl : null, fetcher, {
    keepPreviousData: true,
  })
  const { data: portalUsersData } = useSWR<{ users: { user_id: string; email: string }[] }>(
    allowed ? '/api/it-cmdb/portal-users' : null,
    fetcher
  )
  const { data: intuneConfigData } = useSWR<{ configured: boolean }>(
    allowed ? '/api/it-cmdb/intune-sync' : null,
    fetcher,
    { shouldRetryOnError: false }
  )
  const { data: freshdeskConfigData } = useSWR<{ configured: boolean }>(
    allowed ? '/api/it-cmdb/freshdesk-ticket' : null,
    fetcher,
    { shouldRetryOnError: false }
  )

  const fdDetailUrl =
    allowed && deviceDetailId ? `/api/it-cmdb/freshdesk-ticket?hardwareId=${encodeURIComponent(deviceDetailId)}` : null
  type FdTicketHistoryRow = {
    id: number
    linkedAt: string
    subject: string
    status: number
    statusLabel: string
    priority: number
    url: string | null
    fetchState: 'ok' | 'missing' | 'error'
  }

  const { data: fdDetailData, isLoading: fdDetailLoading, mutate: mutateFdDetail } = useSWR<
    | { configured: boolean }
    | {
        configured: boolean
        clearedStoredId?: boolean
        fetchError?: string
        histError?: string
        ticketHistory?: FdTicketHistoryRow[]
        item?: ItCmdbHardwareListItem
        activeTicket?: {
          id: number
          subject: string
          status: number
          statusLabel: string
          priority: number
          url: string | null
        } | null
        lastTicket?: {
          id: number
          subject: string
          status: number
          statusLabel: string
          priority: number
          url: string | null
        } | null
        error?: string
      }
    | {
        configured: false
        error?: string
        item: ItCmdbHardwareListItem
        activeTicket?: null
        lastTicket?: null
        clearedStoredId?: false
        ticketHistory?: readonly []
      }
  >(fdDetailUrl, fetcher, { shouldRetryOnError: false })

  useEffect(() => {
    if (fdDetailData && typeof fdDetailData === 'object' && 'clearedStoredId' in fdDetailData && fdDetailData.clearedStoredId) {
      void mutate()
    }
  }, [fdDetailData, mutate])

  useEffect(() => {
    if (!deviceDetailId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeviceDetailId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deviceDetailId])

  const items = data?.items ?? []
  const portalUsers = portalUsersData?.users ?? []

  const detailRow = useMemo(() => {
    if (!deviceDetailId) return null
    if (fdDetailData && typeof fdDetailData === 'object' && 'item' in fdDetailData && fdDetailData.item) {
      return fdDetailData.item
    }
    return items.find(i => i.id === deviceDetailId) ?? null
  }, [deviceDetailId, fdDetailData, items])

  const locationOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      const l = it.location?.trim()
      if (l) set.add(l)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'))
  }, [items])

  const hasActiveSearch = Boolean(q.trim())

  /** Aantallen per type (apparaat), gesorteerd op frequentie. */
  const statsByType = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      const t = it.device_type?.trim() || '(Geen type)'
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  const maxTypeCount = statsByType[0]?.[1] ?? 1

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(row: ItCmdbHardwareListItem) {
    setEditing(row)
    setForm({
      serial_number: row.serial_number,
      hostname: row.hostname ?? '',
      intune: row.intune ?? '',
      user_name: row.user_name ?? '',
      assigned_user_id: row.assigned_user_id ?? '',
      device_type: row.device_type ?? '',
      notes: row.notes ?? '',
      location: row.location ?? '',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault()
    if (!form.serial_number.trim()) {
      setFormError('Serienummer is verplicht.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        const res = await fetch(`/api/it-cmdb/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial_number: form.serial_number.trim(),
            hostname: form.hostname,
            intune: form.intune || null,
            user_name: form.user_name || null,
            assigned_user_id: form.assigned_user_id.trim() ? form.assigned_user_id : null,
            device_type: form.device_type || null,
            notes: form.notes || null,
            location: form.location || null,
          }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? 'Opslaan mislukt')
      } else {
        const res = await fetch('/api/it-cmdb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial_number: form.serial_number.trim(),
            hostname: form.hostname,
            intune: form.intune || null,
            user_name: form.user_name || null,
            assigned_user_id: form.assigned_user_id.trim() ? form.assigned_user_id : null,
            device_type: form.device_type || null,
            notes: form.notes || null,
            location: form.location || null,
          }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? 'Aanmaken mislukt')
      }
      setModalOpen(false)
      await mutate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Opslaan mislukt')
    }
    setSaving(false)
  }

  async function onIntuneSync() {
    setIntuneSyncing(true)
    setIntuneMsg(null)
    try {
      const res = await fetch('/api/it-cmdb/intune-sync', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setIntuneMsg({
          ok: false,
          text: typeof d.error === 'string' ? d.error : 'Intune-sync mislukt',
        })
        return
      }
      const parts = [
        `${d.graphDevices ?? 0} apparaat/apparaten opgehaald bij Microsoft`,
        `${d.inserted ?? 0} nieuw`,
        `${d.updated ?? 0} bijgewerkt`,
      ]
      if (d.skippedNoSerial > 0) parts.push(`${d.skippedNoSerial} zonder serienummer overgeslagen`)
      if (d.errorCount > 0) parts.push(`${d.errorCount} schrijffout(en)`)
      let text = parts.join(' · ')
      if (Array.isArray(d.errors) && d.errors.length > 0) {
        text += `\n${d.errors.slice(0, 8).join('\n')}`
        if (d.errors.length > 8) text += '\n…'
      }
      setIntuneMsg({ ok: d.errorCount > 0 ? false : true, text })
      await mutate()
    } catch {
      setIntuneMsg({ ok: false, text: 'Netwerkfout bij Intune-sync' })
    }
    setIntuneSyncing(false)
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setImportMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/it-cmdb/import', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImportMsg({ ok: false, text: typeof d.error === 'string' ? d.error : 'Import mislukt' })
        return
      }
      const ins = d.inserted ?? 0
      const up = d.updated ?? 0
      let text = `${ins} nieuw, ${up} bijgewerkt`
      if (Array.isArray(d.errors) && d.errors.length > 0) {
        text += ` (${d.errors.length} fout(en))`
        text += `\n${d.errors.slice(0, 8).join('\n')}`
        if (d.errors.length > 8) text += '\n…'
      }
      setImportMsg({ ok: true, text })
      await mutate()
    } catch {
      setImportMsg({ ok: false, text: 'Netwerkfout' })
    }
    setImporting(false)
  }

  const remove = useCallback(
    async (row: ItCmdbHardwareListItem) => {
      if (!confirm(`Regel ${row.serial_number} verwijderen?`)) return
      const res = await fetch(`/api/it-cmdb/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Verwijderen mislukt')
        return
      }
      await mutate()
    },
    [mutate]
  )

  const createFreshdeskTicketForDevice = useCallback(
    async (row: ItCmdbHardwareListItem) => {
      setFreshdeskMsg(null)
      setFreshdeskBusyId(row.id)
      try {
        const res = await fetch('/api/it-cmdb/freshdesk-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hardwareId: row.id }),
        })
        const j = (await res.json().catch(() => ({}))) as {
          error?: string
          ticketId?: number
          ticketUrl?: string | null
        }
        if (res.status === 409) {
          setFreshdeskMsg({
            ok: false,
            text:
              typeof j.ticketId === 'number'
                ? `Er bestaat al een Freshdesk-ticket (#${j.ticketId}) voor dit apparaat.`
                : j.error ?? 'Er bestaat al een ticket voor dit apparaat.',
          })
          await mutate()
          if (deviceDetailId === row.id) void mutateFdDetail()
          return
        }
        if (!res.ok) {
          setFreshdeskMsg({ ok: false, text: typeof j.error === 'string' ? j.error : 'Ticket aanmaken mislukt.' })
          return
        }
        const tid = j.ticketId
        const urlPart = typeof j.ticketUrl === 'string' && j.ticketUrl ? ` ${j.ticketUrl}` : ''
        setFreshdeskMsg({
          ok: true,
          text: typeof tid === 'number' ? `Freshdesk-ticket #${tid} aangemaakt.${urlPart}` : `Ticket aangemaakt.${urlPart}`,
        })
        await mutate()
        if (deviceDetailId === row.id) void mutateFdDetail()
      } catch {
        setFreshdeskMsg({ ok: false, text: 'Netwerkfout — probeer opnieuw.' })
      } finally {
        setFreshdeskBusyId(null)
      }
    },
    [mutate, mutateFdDetail, deviceDetailId]
  )

  if (allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: dashboardUi.pageBg, fontFamily: F, color: dashboardUi.textMuted }}>
        Laden…
      </div>
    )
  }

  if (!allowed) return null

  const inputStyle = {
    background: 'rgba(45,69,124,0.04)',
    border: '1px solid rgba(45,69,124,0.12)',
    color: DYNAMO_BLUE,
    fontFamily: F,
    outline: 'none' as const,
  }
  const inputClass = 'w-full rounded-xl px-3 py-2 text-sm'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-center gap-2 py-2 min-h-[56px]">
          <Link
            href="/dashboard"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90"
          >
            ← Portal
          </Link>
          <span className="text-white text-sm font-semibold">IT-hardware (CMDB)</span>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-5 max-w-[1400px] mx-auto w-full space-y-4" style={{ color: TABLE_TEXT }}>
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:justify-between">
          <div>
            <h1 className="m-0 text-xl sm:text-2xl font-bold" style={{ color: DYNAMO_BLUE }}>
              Interne IT-voorraad
            </h1>
            <p className="m-0 mt-1 text-sm" style={{ color: dashboardUi.textMuted }}>
              Serienummer, hostname, Intune, gebruiker, type, opmerkingen en locatie. Rechten via Beheer → modules per gebruiker.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="sr-only"
              tabIndex={-1}
              onChange={onImportFile}
            />
            <button
              type="button"
              disabled={isLoading || items.length === 0}
              onClick={() => setStatsOpen(true)}
              className="rounded-xl px-5 py-2.5 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ border: `2px solid ${DYNAMO_BLUE}`, color: DYNAMO_BLUE, fontFamily: F }}
              title={items.length === 0 && !isLoading ? 'Geen regels om te tonen' : 'Verdeling per type'}
            >
              Statistiek
            </button>
            <button
              type="button"
              disabled={intuneSyncing || intuneConfigData?.configured === false}
              onClick={() => void onIntuneSync()}
              className="rounded-xl px-5 py-2.5 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ border: `2px solid ${DYNAMO_BLUE}`, color: DYNAMO_BLUE, fontFamily: F }}
              title={
                intuneConfigData?.configured === false
                  ? 'Stel AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET in (server) en verleen Graph DeviceManagementManagedDevices.Read.All'
                  : 'Synchroniseer met Microsoft Intune (Graph API)'
              }
            >
              {intuneSyncing ? 'Intune-sync…' : 'Sync Intune'}
            </button>
            <button
              type="button"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
              className="rounded-xl px-5 py-2.5 text-sm font-bold transition disabled:opacity-50"
              style={{ border: `2px solid ${DYNAMO_BLUE}`, color: DYNAMO_BLUE, fontFamily: F }}
            >
              {importing ? 'Importeren…' : 'Excel / CSV importeren'}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: DYNAMO_BLUE, fontFamily: F }}
            >
              + Toevoegen
            </button>
          </div>
        </div>

        {importMsg && (
          <div
            className="rounded-2xl p-4 text-sm whitespace-pre-wrap"
            style={{
              background: importMsg.ok ? '#f0fdf4' : '#fef2f2',
              border: importMsg.ok ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(220,38,38,0.2)',
              color: importMsg.ok ? '#15803d' : '#b91c1c',
              fontFamily: F,
            }}
          >
            {importMsg.text}
          </div>
        )}

        {intuneMsg && (
          <div
            className="rounded-2xl p-4 text-sm whitespace-pre-wrap"
            style={{
              background: intuneMsg.ok ? '#f0fdf4' : '#fef2f2',
              border: intuneMsg.ok ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(220,38,38,0.2)',
              color: intuneMsg.ok ? '#15803d' : '#b91c1c',
              fontFamily: F,
            }}
          >
            {intuneMsg.text}
          </div>
        )}

        {freshdeskMsg && (
          <div
            className="rounded-2xl p-4 text-sm whitespace-pre-wrap break-all"
            style={{
              background: freshdeskMsg.ok ? '#f0fdf4' : '#fef2f2',
              border: freshdeskMsg.ok ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(220,38,38,0.2)',
              color: freshdeskMsg.ok ? '#15803d' : '#b91c1c',
              fontFamily: F,
            }}
          >
            {freshdeskMsg.text}
          </div>
        )}

        <div
          className="rounded-2xl p-4 flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end"
          style={{ background: dashboardUi.cardWhite.background, border: dashboardUi.cardWhite.border, boxShadow: dashboardUi.cardWhite.boxShadow }}
        >
          <div className="flex-1 min-w-[220px]">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: dashboardUi.textSubtle }}>
              Zoeken
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="search"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Naam (alleen letters) of serienummer / locatie met optie hieronder…"
                className="flex-1 min-w-[200px] rounded-xl px-3 py-2 text-sm border"
                style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE }}
              />
              {hasActiveSearch && (
                <button
                  type="button"
                  className="rounded-xl px-3 py-2 text-xs font-semibold shrink-0"
                  style={{ border: `1px solid ${dashboardUi.borderSoft}`, color: DYNAMO_BLUE, fontFamily: F }}
                  onClick={() => setQ('')}
                >
                  Wis zoekveld
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none text-xs" style={{ color: TABLE_TEXT }}>
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={searchAllFields}
                onChange={e => setSearchAllFields(e.target.checked)}
              />
              <span style={{ color: dashboardUi.textMuted }}>
                Zoek in <span className="font-semibold" style={{ color: TABLE_TEXT }}>alle velden</span> (serie, hostname, locatie, type, notities). Uit: alleen letters (bijv. voornaam) → standaard{' '}
                <span className="font-semibold" style={{ color: TABLE_TEXT }}>gebruiker / e-mail / UPN</span>
              </span>
            </label>
          </div>
          <p className="text-xs m-0 sm:pb-2 max-w-md" style={{ color: dashboardUi.textMuted }}>
            Meerdere woorden: elk woord moet matchen (EN). Alleen letters (bijv. andré, raymond): alleen namen en e-mail. Sorteer op
            kolomkoppen; klik op een regel voor details en Freshdesk.
          </p>
        </div>

        {!isLoading && items.length > 0 && <IntuneOverview items={items} filteredCount={items.length} />}

        {error && (
          <div className="rounded-2xl p-4 text-sm" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c' }}>
            Kon gegevens niet laden.
          </div>
        )}

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: dashboardUi.cardWhite.background, border: dashboardUi.cardWhite.border, boxShadow: dashboardUi.cardWhite.boxShadow }}
        >
          {isLoading && !data ? (
            <p className="p-8 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
              Laden…
            </p>
          ) : (
            <div className="overflow-x-auto">
              <datalist id="it-cmdb-locations">
                {locationOptions.map(loc => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
              <table
                className="w-full text-sm border-collapse min-w-[1280px]"
                style={{ color: TABLE_TEXT, fontFamily: F }}
              >
                <thead>
                  <tr style={{ background: 'rgba(45,69,124,0.06)', borderBottom: '1px solid rgba(45,69,124,0.1)' }}>
                    <CmdbSortTh col="serial_number" label="Serie" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="hostname" label="Hostname" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="compliance" label="Compliance" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="last_sync" label="Sync" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="management" label="Beheer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="user" label="Gebruiker" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="device_type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="notes" label="Opmerkingen" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="location" label="Locatie" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th scope="col" className="text-right px-3 py-3 font-bold whitespace-nowrap" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                      Acties
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
                        Geen regels. Voeg hardware toe of pas de zoekopdracht aan.
                      </td>
                    </tr>
                  ) : (
                    items.map(row => {
                      const snap = isIntuneSnapshot(row.intune_snapshot) ? row.intune_snapshot : null
                      const nonCompliant = isNonCompliantSnapshot(snap)
                      const fdId =
                        row.freshdesk_ticket_id != null
                          ? typeof row.freshdesk_ticket_id === 'number'
                            ? row.freshdesk_ticket_id
                            : Number(row.freshdesk_ticket_id)
                          : null
                      const fdUrl = row.freshdesk_ticket_url ?? null
                      const fdBusy = freshdeskBusyId === row.id
                      return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDeviceDetailId(row.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setDeviceDetailId(row.id)
                          }
                        }}
                        className={`border-b border-[rgba(45,69,124,0.06)] hover:bg-[rgba(45,69,124,0.06)] cursor-pointer ${
                          nonCompliant ? 'border-l-[3px] border-red-500 bg-red-50/50' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold align-top" style={{ color: DYNAMO_BLUE }}>
                          {row.serial_number}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs max-w-[160px] align-top" style={{ color: TABLE_TEXT }}>
                          <span className="break-all">{row.hostname || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 align-top max-w-[150px]">
                          <ComplianceBadge state={snap?.complianceState} />
                        </td>
                        <td className="px-3 py-2.5 text-xs tabular-nums whitespace-nowrap align-top" style={{ color: TABLE_TEXT }} title={snap?.lastSyncDateTime ?? undefined}>
                          {formatIntuneSyncDate(snap?.lastSyncDateTime)}
                        </td>
                        <td className="px-3 py-2.5 max-w-[140px] align-top text-xs leading-snug" style={{ color: TABLE_TEXT }} title={snap?.managementState ? String(snap.managementState) : row.intune ?? ''}>
                          {snap?.managementState != null && String(snap.managementState).trim() !== '' ? (
                            <span className="font-medium">{String(snap.managementState)}</span>
                          ) : row.intune ? (
                            <span className="opacity-90">{row.intune.length > 48 ? `${row.intune.slice(0, 48)}…` : row.intune}</span>
                          ) : (
                            <span style={{ color: 'rgba(100,116,139,0.85)' }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px] align-top" style={{ color: TABLE_TEXT }}>
                          {(() => {
                            const { label, title } = cmdbUserCellDisplay(row, snap)
                            if (label === '—') {
                              return <span style={{ color: 'rgba(100,116,139,0.85)' }}>—</span>
                            }
                            return (
                              <span
                                className="block font-medium truncate max-w-[min(220px,100%)]"
                                style={{ color: TABLE_TEXT, fontFamily: F }}
                                title={title || undefined}
                              >
                                {label}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px] align-top" style={{ color: TABLE_TEXT }}>
                          <span className="block">{row.device_type || '—'}</span>
                          {snap?.manufacturer || snap?.model ? (
                            <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: dashboardUi.textSubtle }} title={[snap.manufacturer, snap.model].filter(Boolean).join(' ')}>
                              {[snap.manufacturer, snap.model].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 max-w-[280px] text-xs leading-relaxed align-top" style={{ color: TABLE_TEXT }}>
                          {row.notes || '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap align-top" style={{ color: TABLE_TEXT }}>
                          {row.location || '—'}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right align-top min-w-[200px]"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex flex-col items-end gap-1.5">
                            {fdId != null && Number.isFinite(fdId) ? (
                              fdUrl ? (
                                <a
                                  href={fdUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-semibold underline-offset-2 hover:underline"
                                  style={{ color: DYNAMO_BLUE, fontFamily: F }}
                                >
                                  Freshdesk #{fdId}
                                </a>
                              ) : (
                                <span className="text-xs font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                                  Freshdesk #{fdId}
                                </span>
                              )
                            ) : (
                              <button
                                type="button"
                                disabled={!freshdeskConfigData?.configured || fdBusy}
                                onClick={() => void createFreshdeskTicketForDevice(row)}
                                className="text-xs font-semibold rounded-lg px-2 py-1 transition disabled:opacity-45"
                                style={{
                                  border: `1px solid ${DYNAMO_BLUE}`,
                                  color: DYNAMO_BLUE,
                                  fontFamily: F,
                                  background: freshdeskConfigData?.configured ? 'rgba(45,69,124,0.06)' : 'rgba(45,69,124,0.04)',
                                }}
                                title={
                                  !freshdeskConfigData?.configured
                                    ? 'Freshdesk niet geconfigureerd op de server (FRESHDESK_DOMAIN, FRESHDESK_API_KEY).'
                                    : 'Maak een supportticket met Intune/CMDB-gegevens'
                                }
                              >
                                {fdBusy ? 'Ticket…' : 'Maak Freshdesk-ticket'}
                              </button>
                            )}
                            <div className="flex flex-wrap justify-end gap-x-3 gap-y-0.5">
                              <button type="button" className="font-semibold" style={{ color: DYNAMO_BLUE }} onClick={() => openEdit(row)}>
                                Bewerken
                              </button>
                              <button type="button" className="font-semibold" style={{ color: '#dc2626' }} onClick={() => remove(row)}>
                                Verwijderen
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && (
            <p className="px-4 py-2 text-xs m-0" style={{ color: dashboardUi.textSubtle }}>
              {items.length} regel{items.length === 1 ? '' : 'en'}
            </p>
          )}
        </div>
      </main>

      {deviceDetailId && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center p-3"
          style={{ background: 'rgba(15,23,42,0.5)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="it-cmdb-device-detail-heading"
          onClick={() => setDeviceDetailId(null)}
        >
          <div
            className="w-full max-w-lg max-h-[min(90vh,720px)] overflow-y-auto rounded-2xl p-5 space-y-4 shadow-2xl"
            style={{ background: 'white', border: '1px solid rgba(45,69,124,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            {fdDetailLoading && !detailRow ? (
              <p className="text-sm m-0" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
                Laden…
              </p>
            ) : !detailRow ? (
              <p className="text-sm m-0" style={{ color: '#b91c1c', fontFamily: F }}>
                Deze regel is niet gevonden (meer) in het huidige filter.
              </p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="it-cmdb-device-detail-heading"
                    className="text-base font-bold m-0 pr-2 leading-snug"
                    style={{ color: DYNAMO_BLUE, fontFamily: F }}
                  >
                    {detailRow.hostname?.trim() || '—'}{' '}
                    <span className="font-mono text-sm font-semibold opacity-90">· {detailRow.serial_number}</span>
                  </h2>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{ border: `1px solid ${DYNAMO_BLUE}`, color: DYNAMO_BLUE, fontFamily: F }}
                    onClick={() => setDeviceDetailId(null)}
                  >
                    Sluiten
                  </button>
                </div>
                {(() => {
                  const snap = isIntuneSnapshot(detailRow.intune_snapshot) ? detailRow.intune_snapshot : null
                  const { label: userLabel, title: userTitle } = cmdbUserCellDisplay(detailRow, snap)
                  return (
                    <div className="rounded-xl p-3 space-y-2 text-sm" style={{ background: 'rgba(45,69,124,0.04)', fontFamily: F }}>
                      <p className="m-0" style={{ color: TABLE_TEXT }}>
                        <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>
                          Gebruiker:{' '}
                        </span>
                        {userLabel !== '—' ? (
                          <span title={userTitle || undefined}>{userLabel}</span>
                        ) : (
                          <span style={{ color: dashboardUi.textMuted }}>—</span>
                        )}
                      </p>
                      <p className="m-0" style={{ color: TABLE_TEXT }}>
                        <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>
                          Compliance:{' '}
                        </span>
                        {snap?.complianceState ? (
                          <ComplianceBadge state={snap.complianceState} />
                        ) : (
                          <span style={{ color: dashboardUi.textMuted }}>—</span>
                        )}
                      </p>
                      <p className="m-0 text-xs" style={{ color: dashboardUi.textMuted }}>
                        Laatste sync: {formatIntuneSyncDate(snap?.lastSyncDateTime)}
                      </p>
                      <p className="m-0 text-xs" style={{ color: dashboardUi.textMuted }}>
                        Type: {detailRow.device_type || '—'}
                        {snap?.manufacturer || snap?.model
                          ? ` · ${[snap.manufacturer, snap.model].filter(Boolean).join(' · ')}`
                          : ''}
                      </p>
                    </div>
                  )
                })()}
                <div className="border-t pt-3" style={{ borderColor: dashboardUi.sectionDivider }}>
                  <p className="text-[11px] font-bold uppercase tracking-wide m-0 mb-2" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
                    Freshdesk
                  </p>
                  {fdDetailLoading ? (
                    <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>
                      Ticketstatus laden…
                    </p>
                  ) : fdDetailData && typeof fdDetailData === 'object' && 'configured' in fdDetailData && fdDetailData.configured === false ? (
                    <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>
                      {'error' in fdDetailData && typeof fdDetailData.error === 'string' ? fdDetailData.error : 'Freshdesk is niet geconfigureerd.'}
                    </p>
                  ) : fdDetailData && typeof fdDetailData === 'object' && 'fetchError' in fdDetailData && fdDetailData.fetchError ? (
                    <p className="text-sm m-0" style={{ color: '#b91c1c' }}>
                      {String(fdDetailData.fetchError)}
                    </p>
                  ) : fdDetailData &&
                    typeof fdDetailData === 'object' &&
                    'activeTicket' in fdDetailData &&
                    fdDetailData.activeTicket != null ? (
                    <div className="space-y-2">
                      <p className="text-sm m-0 font-semibold" style={{ color: TABLE_TEXT }}>
                        {fdDetailData.activeTicket.subject}
                      </p>
                      <p className="text-xs m-0" style={{ color: dashboardUi.textMuted }}>
                        {fdDetailData.activeTicket.statusLabel} · prioriteit {fdDetailData.activeTicket.priority}
                      </p>
                      {fdDetailData.activeTicket.url ? (
                        <a
                          href={fdDetailData.activeTicket.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-sm font-semibold underline"
                          style={{ color: DYNAMO_BLUE, fontFamily: F }}
                        >
                          Ticket #{fdDetailData.activeTicket.id} openen →
                        </a>
                      ) : null}
                    </div>
                  ) : fdDetailData &&
                    typeof fdDetailData === 'object' &&
                    'lastTicket' in fdDetailData &&
                    fdDetailData.lastTicket != null ? (
                    <div className="space-y-2">
                      <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>
                        Het gekoppelde ticket is in Freshdesk opgelost of gesloten (of verwijderd). Je kunt een nieuw ticket aanmaken.
                      </p>
                      <p className="text-sm m-0 font-medium" style={{ color: TABLE_TEXT }}>
                        {fdDetailData.lastTicket.subject}
                      </p>
                      <p className="text-xs m-0" style={{ color: dashboardUi.textMuted }}>
                        Laatst bekend: {fdDetailData.lastTicket.statusLabel}
                      </p>
                      {fdDetailData.lastTicket.url ? (
                        <a
                          href={fdDetailData.lastTicket.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-xs font-semibold underline"
                          style={{ color: DYNAMO_BLUE, fontFamily: F }}
                        >
                          Oud ticket #{fdDetailData.lastTicket.id} (archief) →
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>
                      {fdDetailData &&
                      typeof fdDetailData === 'object' &&
                      'clearedStoredId' in fdDetailData &&
                      fdDetailData.clearedStoredId &&
                      !('lastTicket' in fdDetailData && fdDetailData.lastTicket)
                        ? 'Het eerder gekoppelde ticket bestaat niet meer in Freshdesk (verwijderd). Je kunt een nieuw ticket aanmaken.'
                        : 'Geen actief Freshdesk-ticket voor dit apparaat.'}
                    </p>
                  )}
                  {freshdeskConfigData?.configured &&
                    fdDetailData &&
                    typeof fdDetailData === 'object' &&
                    'configured' in fdDetailData &&
                    fdDetailData.configured === true &&
                    !('fetchError' in fdDetailData && fdDetailData.fetchError) &&
                    'activeTicket' in fdDetailData &&
                    fdDetailData.activeTicket == null && (
                      <button
                        type="button"
                        disabled={freshdeskBusyId === detailRow.id}
                        onClick={() => void createFreshdeskTicketForDevice(detailRow)}
                        className="mt-3 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-50"
                        style={{ background: DYNAMO_BLUE, fontFamily: F }}
                      >
                        {freshdeskBusyId === detailRow.id ? 'Bezig…' : 'Maak Freshdesk-ticket'}
                      </button>
                    )}
                  {fdDetailData &&
                    typeof fdDetailData === 'object' &&
                    'configured' in fdDetailData &&
                    fdDetailData.configured === true &&
                    'histError' in fdDetailData &&
                    typeof fdDetailData.histError === 'string' &&
                    fdDetailData.histError ? (
                    <p className="text-xs m-0 mt-3" style={{ color: '#b45309' }}>
                      Geschiedenis kon niet geladen worden: {fdDetailData.histError}
                    </p>
                  ) : null}
                  {fdDetailData &&
                    typeof fdDetailData === 'object' &&
                    'ticketHistory' in fdDetailData &&
                    Array.isArray(fdDetailData.ticketHistory) &&
                    fdDetailData.ticketHistory.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide m-0" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
                        Ticketgeschiedenis
                      </p>
                      <ul className="m-0 p-0 list-none space-y-2.5">
                        {fdDetailData.ticketHistory.map(h => {
                          const isActive =
                            'activeTicket' in fdDetailData &&
                            fdDetailData.activeTicket != null &&
                            fdDetailData.activeTicket.id === h.id
                          return (
                            <li
                              key={`${h.id}-${h.linkedAt}`}
                              className="rounded-lg p-2.5 text-sm"
                              style={{ background: 'rgba(45,69,124,0.05)', border: '1px solid rgba(45,69,124,0.08)' }}
                            >
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="font-semibold tabular-nums" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                                  #{h.id}
                                </span>
                                {isActive ? (
                                  <span
                                    className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d' }}
                                  >
                                    Actief
                                  </span>
                                ) : null}
                              </div>
                              <p className="m-0 mt-1 line-clamp-2" style={{ color: TABLE_TEXT }}>
                                {h.subject}
                              </p>
                              <p className="text-xs m-0 mt-0.5" style={{ color: dashboardUi.textMuted }}>
                                {h.statusLabel}
                                {h.fetchState === 'ok' ? ` · prioriteit ${h.priority}` : null} · gekoppeld {formatTicketLinkedAt(h.linkedAt)}
                              </p>
                              {h.url ? (
                                <a
                                  href={h.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block mt-1.5 text-xs font-semibold underline"
                                  style={{ color: DYNAMO_BLUE, fontFamily: F }}
                                >
                                  Openen in Freshdesk →
                                </a>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {statsOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3"
          style={{ background: 'rgba(15,23,42,0.45)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="it-cmdb-stats-heading"
          onClick={() => setStatsOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-5 space-y-4"
            style={{ background: 'white', border: '1px solid rgba(45,69,124,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="it-cmdb-stats-heading" className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                Statistiek per type
              </h2>
              <button
                type="button"
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ border: `1px solid ${DYNAMO_BLUE}`, color: DYNAMO_BLUE, fontFamily: F }}
                onClick={() => setStatsOpen(false)}
              >
                Sluiten
              </button>
            </div>
            <p className="text-xs m-0" style={{ color: dashboardUi.textMuted }}>
              {hasActiveSearch
                ? 'Gebaseerd op de huidige zoekopdracht.'
                : 'Alle apparaten in het overzicht.'}{' '}
              <span className="font-semibold" style={{ color: TABLE_TEXT }}>
                {items.length} totaal
              </span>
              {statsByType.length > 0 && (
                <span>
                  {' '}
                  · {statsByType.length} {statsByType.length === 1 ? 'type' : 'verschillende types'}
                </span>
              )}
            </p>
            <div className="grid gap-3 sm:gap-2">
              {statsByType.map(([typeLabel, count]) => {
                const pct = maxTypeCount > 0 ? Math.round((count / maxTypeCount) * 100) : 0
                return (
                  <div key={typeLabel}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-sm font-medium truncate min-w-0" style={{ color: TABLE_TEXT, fontFamily: F }} title={typeLabel}>
                        {typeLabel}
                      </span>
                      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                        {count}
                        <span className="font-normal ml-1" style={{ color: dashboardUi.textMuted }}>
                          ({items.length > 0 ? Math.round((count / items.length) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(45,69,124,0.08)' }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${pct}%`, background: DYNAMO_BLUE }}
                        role="presentation"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3"
          style={{ background: 'rgba(15,23,42,0.45)' }}
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Hardware bewerken' : 'Hardware toevoegen'}
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-4" style={{ background: 'white', border: `1px solid rgba(45,69,124,0.12)` }}>
            <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
              {editing ? 'Regel bewerken' : 'Nieuwe regel'}
            </h2>
            {formError && (
              <div className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#b91c1c', fontFamily: F }}>
                {formError}
              </div>
            )}
            <form onSubmit={saveForm} className="space-y-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                  Serienummer *
                </label>
                <input className={inputClass} style={inputStyle} value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                  Hostname
                </label>
                <input className={inputClass} style={inputStyle} value={form.hostname} onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))} placeholder="DYN-xxxxx" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                  Intune
                </label>
                <input className={inputClass} style={inputStyle} value={form.intune ?? ''} onChange={e => setForm(f => ({ ...f, intune: e.target.value }))} placeholder="Intune, Ja, Nee" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                  Portalgebruiker (DRG)
                </label>
                <select
                  className={inputClass}
                  style={inputStyle}
                  value={form.assigned_user_id}
                  onChange={e => setForm(f => ({ ...f, assigned_user_id: e.target.value }))}
                  aria-label="Koppel aan portalgebruiker"
                >
                  <option value="">— Niet gekoppeld</option>
                  {portalUsers.map(u => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.email || u.user_id}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] m-0 mt-1" style={{ color: dashboardUi.textMuted }}>
                  Alleen gebruikers met een rol in Beheer (gebruiker_rollen).
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                  Gebruiker (vrije tekst / import)
                </label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={form.user_name ?? ''}
                  onChange={e => setForm(f => ({ ...f, user_name: e.target.value }))}
                  placeholder="Naam uit Intune of Excel, naast portal-koppeling"
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                  Type
                </label>
                <input className={inputClass} style={inputStyle} value={form.device_type ?? ''} onChange={e => setForm(f => ({ ...f, device_type: e.target.value }))} placeholder="Dell Latitude …" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                  Opmerkingen
                </label>
                <textarea className={`${inputClass} min-h-[72px]`} style={inputStyle} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                  Locatie
                </label>
                <input className={inputClass} style={inputStyle} value={form.location ?? ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Gebruiker, Server Kast, België…" />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="submit" disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                  {saving ? 'Opslaan…' : 'Opslaan'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold"
                  style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}
                >
                  Annuleren
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
