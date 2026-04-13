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
const TABLE_TEXT = '#1e293b'

function isIntuneSnapshot(v: unknown): v is IntuneSnapshot {
  return v != null && typeof v === 'object' && !Array.isArray(v) && typeof (v as IntuneSnapshot).graphDeviceId === 'string'
}

function formatIntuneSyncDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatTicketLinkedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

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
  if (intuneAddr && intuneAddr.toLowerCase() !== portalEmail.toLowerCase()) lines.push(`Intune: ${intuneAddr}`)
  if (rawName && !looksLikeEmail(rawName)) return { label: rawName, title: lines.length ? lines.join('\n') : rawName }
  if (portalEmail) return { label: prettyNameFromEmail(portalEmail), title: lines.join('\n') || portalEmail }
  if (intuneAddr) return { label: prettyNameFromEmail(intuneAddr), title: lines.join('\n') || intuneAddr }
  if (rawName && looksLikeEmail(rawName)) return { label: prettyNameFromEmail(rawName), title: rawName }
  return { label: '—', title: '' }
}

function isNonCompliantSnapshot(s: IntuneSnapshot | null): boolean {
  const st = s?.complianceState?.trim()
  if (!st) return false
  const lo = st.toLowerCase()
  return lo.includes('noncompliant') || lo.includes('non-compliant')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function UserAvatar({ name }: { name: string }) {
  const init = name && name !== '—' ? initials(name) : '?'
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold select-none"
      style={{ background: 'rgba(45,69,124,0.12)', color: DYNAMO_BLUE, fontFamily: F }}
    >
      {init}
    </div>
  )
}

function ComplianceBadge({ state }: { state: string | null | undefined }) {
  const s = state?.trim()
  if (!s) return <span className="text-xs text-gray-400">—</span>
  const lower = s.toLowerCase()
  let bg = 'rgba(100,116,139,0.1)'
  let fg = '#475569'
  if (lower === 'compliant') { bg = '#dcfce7'; fg = '#15803d' }
  else if (lower.includes('noncompliant') || lower.includes('non-compliant')) { bg = '#fee2e2'; fg = '#b91c1c' }
  else if (lower.includes('grace') || lower.includes('graceperiod')) { bg = '#fef9c3'; fg = '#a16207' }
  else if (lower === 'unknown' || lower === 'configmanager') { bg = 'rgba(45,69,124,0.08)'; fg = DYNAMO_BLUE }
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-tight whitespace-nowrap"
      style={{ background: bg, color: fg, fontFamily: F }}
      title={s}
    >
      {s}
    </span>
  )
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: 'blue' | 'green' | 'red' | 'gray'; icon: string }) {
  const palette = {
    blue:  { bg: 'rgba(45,69,124,0.06)',      fg: DYNAMO_BLUE,  border: 'rgba(45,69,124,0.15)' },
    green: { bg: '#f0fdf4',                   fg: '#15803d',    border: 'rgba(22,163,74,0.2)'  },
    red:   { bg: '#fef2f2',                   fg: '#b91c1c',    border: 'rgba(220,38,38,0.2)'  },
    gray:  { bg: '#f8fafc',                   fg: '#475569',    border: 'rgba(100,116,139,0.2)' },
  }
  const c = palette[color]
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <span className="text-xl">{icon}</span>
      <span className="text-2xl font-bold tabular-nums" style={{ color: c.fg, fontFamily: F }}>{value}</span>
      <span className="text-xs font-semibold" style={{ color: c.fg, opacity: 0.7, fontFamily: F }}>{label}</span>
    </div>
  )
}

function CmdbSortTh({ col, label, sortKey, sortDir, onSort }: {
  col: CmdbSortKey; label: string; sortKey: CmdbSortKey; sortDir: 'asc' | 'desc'; onSort: (c: CmdbSortKey) => void
}) {
  const active = sortKey === col
  return (
    <th scope="col" className="text-left px-4 py-3 font-bold whitespace-nowrap" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
      <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-1 -mx-1 py-0.5 hover:bg-[rgba(45,69,124,0.08)]" onClick={e => { e.stopPropagation(); onSort(col) }}>
        <span>{label}</span>
        <span className={`text-[10px] ${active ? 'opacity-90' : 'opacity-25'}`} aria-hidden>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
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

function emptyForm(): Omit<ItCmdbHardware, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'assigned_user_id' | 'intune_snapshot' | 'freshdesk_ticket_id'> & { assigned_user_id: string } {
  return { serial_number: '', hostname: '', intune: '', user_name: '', assigned_user_id: '', device_type: '', notes: '', location: '' }
}

export default function ItCmdbPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [q, setQ] = useState('')
  const [searchAllFields, setSearchAllFields] = useState(false)
  const [sortKey, setSortKey] = useState<CmdbSortKey>('serial_number')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterType, setFilterType] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
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
  const [intuneOpen, setIntuneOpen] = useState(false)
  const [freshdeskBusyId, setFreshdeskBusyId] = useState<string | null>(null)
  const [freshdeskMsg, setFreshdeskMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [deviceDetailId, setDeviceDetailId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    let cancelled = false
    async function run() {
      const res = await fetch('/api/auth/session-info')
      const info = await res.json().catch(() => ({}))
      if (cancelled) return
      setAllowed(info.canAccessItCmdb === true)
    }
    void run()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (allowed === false) router.replace('/dashboard')
  }, [allowed, router])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenuId) return
    const handler = () => setOpenMenuId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenuId])

  useEffect(() => {
    if (!deviceDetailId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeviceDetailId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deviceDetailId])

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
      if (prevKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prevKey }
      setSortDir('asc')
      return key
    })
  }, [])

  function toggleMenu(id: string, e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (openMenuId === id) { setOpenMenuId(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpenMenuId(id)
  }

  const { data, error, isLoading, mutate } = useSWR<{ items: ItCmdbHardwareListItem[] }>(
    allowed ? queryUrl : null, fetcher, { keepPreviousData: true }
  )
  const { data: portalUsersData } = useSWR<{ users: { user_id: string; email: string }[] }>(
    allowed ? '/api/it-cmdb/portal-users' : null, fetcher
  )
  const { data: intuneConfigData } = useSWR<{ configured: boolean }>(
    allowed ? '/api/it-cmdb/intune-sync' : null, fetcher, { shouldRetryOnError: false }
  )
  const { data: freshdeskConfigData } = useSWR<{ configured: boolean }>(
    allowed ? '/api/it-cmdb/freshdesk-ticket' : null, fetcher, { shouldRetryOnError: false }
  )

  const fdDetailUrl = allowed && deviceDetailId ? `/api/it-cmdb/freshdesk-ticket?hardwareId=${encodeURIComponent(deviceDetailId)}` : null
  type FdTicketHistoryRow = { id: number; linkedAt: string; subject: string; status: number; statusLabel: string; priority: number; url: string | null; fetchState: 'ok' | 'missing' | 'error' }

  const { data: fdDetailData, isLoading: fdDetailLoading, mutate: mutateFdDetail } = useSWR<
    | { configured: boolean }
    | { configured: boolean; clearedStoredId?: boolean; fetchError?: string; histError?: string; ticketHistory?: FdTicketHistoryRow[]; item?: ItCmdbHardwareListItem; activeTicket?: { id: number; subject: string; status: number; statusLabel: string; priority: number; url: string | null } | null; lastTicket?: { id: number; subject: string; status: number; statusLabel: string; priority: number; url: string | null } | null; error?: string }
    | { configured: false; error?: string; item: ItCmdbHardwareListItem; activeTicket?: null; lastTicket?: null; clearedStoredId?: false; ticketHistory?: readonly [] }
  >(fdDetailUrl, fetcher, { shouldRetryOnError: false })

  useEffect(() => {
    if (fdDetailData && typeof fdDetailData === 'object' && 'clearedStoredId' in fdDetailData && fdDetailData.clearedStoredId) {
      void mutate()
    }
  }, [fdDetailData, mutate])

  const items = data?.items ?? []
  const portalUsers = portalUsersData?.users ?? []

  const detailRow = useMemo(() => {
    if (!deviceDetailId) return null
    if (fdDetailData && typeof fdDetailData === 'object' && 'item' in fdDetailData && fdDetailData.item) return fdDetailData.item
    return items.find(i => i.id === deviceDetailId) ?? null
  }, [deviceDetailId, fdDetailData, items])

  const typeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) { const t = it.device_type?.trim(); if (t) set.add(t) }
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'))
  }, [items])

  const locationOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) { const l = it.location?.trim(); if (l) set.add(l) }
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'))
  }, [items])

  const filteredItems = useMemo(() => {
    let result = items
    if (filterType) result = result.filter(it => it.device_type?.trim() === filterType)
    if (filterLocation) result = result.filter(it => it.location?.trim() === filterLocation)
    return result
  }, [items, filterType, filterLocation])

  const statsByType = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) { const t = it.device_type?.trim() || '(Geen type)'; m.set(t, (m.get(t) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  const maxTypeCount = statsByType[0]?.[1] ?? 1

  // Summary stats
  const compliantCount = useMemo(() => items.filter(it => {
    const snap = isIntuneSnapshot(it.intune_snapshot) ? it.intune_snapshot : null
    return snap?.complianceState?.toLowerCase() === 'compliant'
  }).length, [items])

  const nonCompliantCount = useMemo(() => items.filter(it => {
    const snap = isIntuneSnapshot(it.intune_snapshot) ? it.intune_snapshot : null
    return isNonCompliantSnapshot(snap)
  }).length, [items])

  const noIntuneCount = useMemo(() => items.filter(it => !isIntuneSnapshot(it.intune_snapshot)).length, [items])

  const hasActiveFilters = Boolean(q.trim()) || Boolean(filterType) || Boolean(filterLocation)

  function openCreate() { setEditing(null); setForm(emptyForm()); setFormError(''); setModalOpen(true) }
  function openEdit(row: ItCmdbHardwareListItem) {
    setEditing(row)
    setForm({ serial_number: row.serial_number, hostname: row.hostname ?? '', intune: row.intune ?? '', user_name: row.user_name ?? '', assigned_user_id: row.assigned_user_id ?? '', device_type: row.device_type ?? '', notes: row.notes ?? '', location: row.location ?? '' })
    setFormError('')
    setModalOpen(true)
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault()
    if (!form.serial_number.trim()) { setFormError('Serienummer is verplicht.'); return }
    setSaving(true); setFormError('')
    try {
      const body = { serial_number: form.serial_number.trim(), hostname: form.hostname, intune: form.intune || null, user_name: form.user_name || null, assigned_user_id: form.assigned_user_id.trim() ? form.assigned_user_id : null, device_type: form.device_type || null, notes: form.notes || null, location: form.location || null }
      if (editing) {
        const res = await fetch(`/api/it-cmdb/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? 'Opslaan mislukt')
      } else {
        const res = await fetch('/api/it-cmdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? 'Aanmaken mislukt')
      }
      setModalOpen(false); await mutate()
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Opslaan mislukt') }
    setSaving(false)
  }

  async function onIntuneSync() {
    setIntuneSyncing(true); setIntuneMsg(null)
    try {
      const res = await fetch('/api/it-cmdb/intune-sync', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setIntuneMsg({ ok: false, text: typeof d.error === 'string' ? d.error : 'Intune-sync mislukt' }); return }
      const parts = [`${d.graphDevices ?? 0} apparaten opgehaald`, `${d.inserted ?? 0} nieuw`, `${d.updated ?? 0} bijgewerkt`]
      if (d.autoGekoppeld > 0) parts.push(`${d.autoGekoppeld} automatisch gekoppeld aan gebruiker`)
      if (d.skippedNoSerial > 0) parts.push(`${d.skippedNoSerial} zonder serienummer overgeslagen`)
      if (d.errorCount > 0) parts.push(`${d.errorCount} schrijffout(en)`)
      let text = parts.join(' · ')
      if (Array.isArray(d.errors) && d.errors.length > 0) { text += `\n${d.errors.slice(0, 8).join('\n')}`; if (d.errors.length > 8) text += '\n…' }
      setIntuneMsg({ ok: d.errorCount > 0 ? false : true, text })
      await mutate()
    } catch { setIntuneMsg({ ok: false, text: 'Netwerkfout bij Intune-sync' }) }
    setIntuneSyncing(false)
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setImporting(true); setImportMsg(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/it-cmdb/import', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setImportMsg({ ok: false, text: typeof d.error === 'string' ? d.error : 'Import mislukt' }); return }
      let text = `${d.inserted ?? 0} nieuw, ${d.updated ?? 0} bijgewerkt`
      if (Array.isArray(d.errors) && d.errors.length > 0) { text += ` (${d.errors.length} fout(en))\n${d.errors.slice(0, 8).join('\n')}`; if (d.errors.length > 8) text += '\n…' }
      setImportMsg({ ok: true, text }); await mutate()
    } catch { setImportMsg({ ok: false, text: 'Netwerkfout' }) }
    setImporting(false)
  }

  const remove = useCallback(async (row: ItCmdbHardwareListItem) => {
    if (!confirm(`Apparaat ${row.serial_number} verwijderen?`)) return
    const res = await fetch(`/api/it-cmdb/${row.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Verwijderen mislukt'); return }
    await mutate()
  }, [mutate])

  const createFreshdeskTicketForDevice = useCallback(async (row: ItCmdbHardwareListItem) => {
    setFreshdeskMsg(null); setFreshdeskBusyId(row.id)
    try {
      const res = await fetch('/api/it-cmdb/freshdesk-ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hardwareId: row.id }) })
      const j = await res.json().catch(() => ({})) as { error?: string; ticketId?: number; ticketUrl?: string | null }
      if (res.status === 409) {
        setFreshdeskMsg({ ok: false, text: typeof j.ticketId === 'number' ? `Er bestaat al een Freshdesk-ticket (#${j.ticketId}) voor dit apparaat.` : j.error ?? 'Er bestaat al een ticket.' })
        await mutate(); if (deviceDetailId === row.id) void mutateFdDetail(); return
      }
      if (!res.ok) { setFreshdeskMsg({ ok: false, text: typeof j.error === 'string' ? j.error : 'Ticket aanmaken mislukt.' }); return }
      const urlPart = typeof j.ticketUrl === 'string' && j.ticketUrl ? ` ${j.ticketUrl}` : ''
      setFreshdeskMsg({ ok: true, text: typeof j.ticketId === 'number' ? `Freshdesk-ticket #${j.ticketId} aangemaakt.${urlPart}` : `Ticket aangemaakt.${urlPart}` })
      await mutate(); if (deviceDetailId === row.id) void mutateFdDetail()
    } catch { setFreshdeskMsg({ ok: false, text: 'Netwerkfout — probeer opnieuw.' }) }
    finally { setFreshdeskBusyId(null) }
  }, [mutate, mutateFdDetail, deviceDetailId])

  if (allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: dashboardUi.pageBg, fontFamily: F, color: dashboardUi.textMuted }}>
        Laden…
      </div>
    )
  }
  if (!allowed) return null

  const inputStyle = { background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.12)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' as const }
  const inputClass = 'w-full rounded-xl px-3 py-2 text-sm'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      {/* ── Header ── */}
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        {/* Top bar */}
        <div className="px-4 sm:px-6 flex items-center gap-3 py-2 border-b border-white/10 min-h-[44px]">
          <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90 shrink-0">
            ← Portal
          </Link>
          <span className="text-white/50 text-xs select-none">IT CMDB</span>
        </div>
        {/* Tab navigation */}
        <div className="px-4 sm:px-6 flex gap-0 overflow-x-auto scrollbar-none">
          <Link
            href="/dashboard/it-cmdb"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 border-white text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            Interne Hardware
          </Link>
          <Link
            href="/dashboard/it-cmdb/catalogus"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 border-transparent text-white/55 hover:text-white/85 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Catalogus
          </Link>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-[1400px] mx-auto w-full space-y-5" style={{ color: TABLE_TEXT }}>

        {/* ── Title + primary actions ── */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold m-0" style={{ color: DYNAMO_BLUE }}>Interne IT-voorraad</h1>
            <p className="text-sm m-0 mt-1" style={{ color: dashboardUi.textMuted }}>Hardware, serienummers, Intune &amp; locaties.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="sr-only" tabIndex={-1} onChange={onImportFile} />
            <button
              type="button"
              disabled={intuneSyncing || intuneConfigData?.configured === false}
              onClick={() => void onIntuneSync()}
              className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white', fontFamily: F }}
              title={intuneConfigData?.configured === false ? 'Stel Azure-omgevingsvariabelen in en verleen DeviceManagementManagedDevices.Read.All' : 'Synchroniseer met Microsoft Intune'}
            >
              {intuneSyncing ? (
                <span className="inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
              ) : (
                <svg width="15" height="15" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
              )}
              {intuneSyncing ? 'Synchroniseren…' : 'Sync Microsoft'}
            </button>
            <button
              type="button"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
              className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
              style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white', fontFamily: F }}
            >
              {importing ? 'Importeren…' : '↑ Importeer Excel / CSV'}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white"
              style={{ background: DYNAMO_BLUE, fontFamily: F }}
            >
              + Apparaat toevoegen
            </button>
          </div>
        </div>

        {/* ── Summary stat cards ── */}
        {(items.length > 0 || isLoading) && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Apparaten totaal" value={items.length} color="blue" icon="💻" />
            <StatCard label="Compliant" value={compliantCount} color="green" icon="✓" />
            <StatCard label="Non-compliant" value={nonCompliantCount} color="red" icon="✗" />
            <StatCard label="Geen Intune-data" value={noIntuneCount} color="gray" icon="—" />
          </div>
        )}

        {/* ── Notification messages ── */}
        {importMsg && (
          <div className="rounded-2xl p-4 text-sm whitespace-pre-wrap" style={{ background: importMsg.ok ? '#f0fdf4' : '#fef2f2', border: importMsg.ok ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(220,38,38,0.2)', color: importMsg.ok ? '#15803d' : '#b91c1c' }}>
            {importMsg.text}
          </div>
        )}
        {intuneMsg && (
          <div className="rounded-2xl p-4 text-sm whitespace-pre-wrap" style={{ background: intuneMsg.ok ? '#f0fdf4' : '#fef2f2', border: intuneMsg.ok ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(220,38,38,0.2)', color: intuneMsg.ok ? '#15803d' : '#b91c1c' }}>
            {intuneMsg.text}
          </div>
        )}
        {freshdeskMsg && (
          <div className="rounded-2xl p-4 text-sm whitespace-pre-wrap break-all" style={{ background: freshdeskMsg.ok ? '#f0fdf4' : '#fef2f2', border: freshdeskMsg.ok ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(220,38,38,0.2)', color: freshdeskMsg.ok ? '#15803d' : '#b91c1c' }}>
            {freshdeskMsg.text}
          </div>
        )}
        {error && (
          <div className="rounded-2xl p-4 text-sm" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c' }}>
            Kon gegevens niet laden.
          </div>
        )}

        {/* ── Filter bar ── */}
        <div className="bg-white rounded-2xl p-4 flex flex-wrap gap-3 items-end" style={{ border: '1px solid rgba(45,69,124,0.1)', boxShadow: '0 1px 4px rgba(45,69,124,0.05)' }}>
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-[11px] font-bold uppercase tracking-wide block mb-1.5" style={{ color: 'rgba(45,69,124,0.5)' }}>Zoeken</label>
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Naam, serienummer, hostname…"
              className="w-full rounded-xl px-3 py-2 text-sm border outline-none"
              style={{ borderColor: 'rgba(45,69,124,0.15)', color: TABLE_TEXT }}
            />
          </div>
          {/* Type filter */}
          <div className="min-w-[150px]">
            <label className="text-[11px] font-bold uppercase tracking-wide block mb-1.5" style={{ color: 'rgba(45,69,124,0.5)' }}>Type</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm border outline-none cursor-pointer"
              style={{ borderColor: 'rgba(45,69,124,0.15)', color: filterType ? TABLE_TEXT : 'rgba(45,69,124,0.4)', background: 'white' }}
            >
              <option value="">Alle types</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Location filter */}
          <div className="min-w-[150px]">
            <label className="text-[11px] font-bold uppercase tracking-wide block mb-1.5" style={{ color: 'rgba(45,69,124,0.5)' }}>Locatie</label>
            <select
              value={filterLocation}
              onChange={e => setFilterLocation(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm border outline-none cursor-pointer"
              style={{ borderColor: 'rgba(45,69,124,0.15)', color: filterLocation ? TABLE_TEXT : 'rgba(45,69,124,0.4)', background: 'white' }}
            >
              <option value="">Alle locaties</option>
              {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {/* All-fields toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none pb-2" style={{ color: dashboardUi.textMuted }}>
            <input type="checkbox" checked={searchAllFields} onChange={e => setSearchAllFields(e.target.checked)} className="rounded" />
            <span className="text-xs">Alle velden</span>
          </label>
          {/* Clear */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setQ(''); setFilterType(''); setFilterLocation('') }}
              className="rounded-xl px-3 py-2 text-xs font-semibold pb-2"
              style={{ border: '1px solid rgba(45,69,124,0.15)', color: DYNAMO_BLUE }}
            >
              Wis filters
            </button>
          )}
        </div>

        {/* ── Results count + stats link ── */}
        <div className="flex items-center justify-between">
          <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>
            <span className="font-semibold" style={{ color: TABLE_TEXT }}>{filteredItems.length}</span>{' '}
            appara{filteredItems.length === 1 ? 'at' : 'ten'}
            {filteredItems.length !== items.length && <span className="ml-1">(van {items.length} totaal)</span>}
          </p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              className="text-xs font-semibold hover:underline"
              style={{ color: DYNAMO_BLUE }}
            >
              Statistiek per type →
            </button>
          )}
        </div>

        {/* ── Desktop table ── */}
        <div className="hidden sm:block rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)', boxShadow: '0 1px 4px rgba(45,69,124,0.05)' }}>
          {isLoading && !data ? (
            <p className="p-8 text-center text-sm m-0" style={{ color: dashboardUi.textMuted }}>Laden…</p>
          ) : (
            <div className="overflow-x-auto">
              <datalist id="it-cmdb-locations">
                {locationOptions.map(loc => <option key={loc} value={loc} />)}
              </datalist>
              <table className="w-full text-sm border-collapse min-w-[640px]" style={{ color: TABLE_TEXT, fontFamily: F }}>
                <thead>
                  <tr style={{ background: 'rgba(45,69,124,0.04)', borderBottom: '2px solid rgba(45,69,124,0.08)' }}>
                    <CmdbSortTh col="serial_number" label="Apparaat" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="compliance" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="user" label="Gebruiker" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <CmdbSortTh col="location" label="Locatie" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th scope="col" className="px-4 py-3 text-right font-bold text-xs uppercase tracking-wide" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F, width: 48 }}>
                      &nbsp;
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
                        {hasActiveFilters ? 'Geen apparaten gevonden voor deze filters.' : 'Geen apparaten. Voeg een apparaat toe of importeer via Excel / CSV.'}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(row => {
                      const snap = isIntuneSnapshot(row.intune_snapshot) ? row.intune_snapshot : null
                      const nonCompliant = isNonCompliantSnapshot(snap)
                      const { label: userLabel, title: userTitle } = cmdbUserCellDisplay(row, snap)
                      const fdId = row.freshdesk_ticket_id != null ? (typeof row.freshdesk_ticket_id === 'number' ? row.freshdesk_ticket_id : Number(row.freshdesk_ticket_id)) : null
                      return (
                        <tr
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDeviceDetailId(row.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDeviceDetailId(row.id) } }}
                          className={`border-b cursor-pointer transition-colors ${nonCompliant ? 'bg-red-50/60 border-l-2 border-l-red-400' : 'hover:bg-[rgba(45,69,124,0.03)]'}`}
                          style={{ borderBottomColor: 'rgba(45,69,124,0.06)' }}
                        >
                          {/* Apparaat column */}
                          <td className="px-4 py-3 min-w-[200px]">
                            <div className="font-semibold text-gray-900 leading-snug">
                              {row.hostname?.trim() || row.serial_number}
                            </div>
                            {row.hostname?.trim() && (
                              <div className="font-mono text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.5)' }}>
                                {row.serial_number}
                              </div>
                            )}
                            {(snap?.manufacturer || snap?.model) && (
                              <div className="text-[11px] mt-0.5 leading-tight" style={{ color: dashboardUi.textSubtle }}>
                                {[snap.manufacturer, snap.model].filter(Boolean).join(' · ')}
                              </div>
                            )}
                            {row.device_type && (
                              <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: 'rgba(45,69,124,0.07)', color: DYNAMO_BLUE }}>
                                {row.device_type}
                              </span>
                            )}
                          </td>

                          {/* Status column */}
                          <td className="px-4 py-3 min-w-[140px]">
                            <ComplianceBadge state={snap?.complianceState} />
                            {snap?.lastSyncDateTime && (
                              <div className="text-[11px] mt-1.5 tabular-nums" style={{ color: dashboardUi.textSubtle }}>
                                {formatIntuneSyncDate(snap.lastSyncDateTime)}
                              </div>
                            )}
                            {snap?.managementState && (
                              <div className="text-[11px] mt-0.5" style={{ color: dashboardUi.textSubtle }}>
                                {String(snap.managementState)}
                              </div>
                            )}
                            {fdId != null && Number.isFinite(fdId) && (
                              <div className="mt-1.5">
                                {row.freshdesk_ticket_url ? (
                                  <a href={row.freshdesk_ticket_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                    className="text-[11px] font-semibold underline-offset-2 hover:underline" style={{ color: DYNAMO_BLUE }}>
                                    #{fdId}
                                  </a>
                                ) : (
                                  <span className="text-[11px] font-semibold" style={{ color: DYNAMO_BLUE }}>#{fdId}</span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Gebruiker column */}
                          <td className="px-4 py-3 min-w-[160px]">
                            {userLabel !== '—' ? (
                              <div className="flex items-center gap-2.5" title={userTitle || undefined}>
                                <UserAvatar name={userLabel} />
                                <span className="text-sm font-medium truncate max-w-[160px]" style={{ color: TABLE_TEXT }}>{userLabel}</span>
                              </div>
                            ) : (
                              <span className="text-sm" style={{ color: 'rgba(100,116,139,0.6)' }}>—</span>
                            )}
                          </td>

                          {/* Locatie column */}
                          <td className="px-4 py-3 text-sm" style={{ color: row.location ? TABLE_TEXT : 'rgba(100,116,139,0.6)' }}>
                            {row.location || '—'}
                            {row.notes && (
                              <div className="text-[11px] mt-0.5 max-w-[200px] truncate" style={{ color: dashboardUi.textSubtle }} title={row.notes}>
                                {row.notes}
                              </div>
                            )}
                          </td>

                          {/* Actions column — 3-dot */}
                          <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={e => toggleMenu(row.id, e)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-lg font-bold transition hover:bg-gray-100 ml-auto"
                              style={{ color: 'rgba(45,69,124,0.4)' }}
                              title="Acties"
                              aria-label="Acties"
                            >
                              ⋯
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Mobile card layout ── */}
        <div className="sm:hidden space-y-3">
          {isLoading && !data ? (
            <p className="text-sm text-center py-8 m-0" style={{ color: dashboardUi.textMuted }}>Laden…</p>
          ) : filteredItems.length === 0 ? (
            <p className="text-sm text-center py-8 m-0" style={{ color: dashboardUi.textMuted }}>
              {hasActiveFilters ? 'Geen apparaten gevonden.' : 'Geen apparaten. Voeg er een toe.'}
            </p>
          ) : (
            filteredItems.map(row => {
              const snap = isIntuneSnapshot(row.intune_snapshot) ? row.intune_snapshot : null
              const nonCompliant = isNonCompliantSnapshot(snap)
              const { label: userLabel } = cmdbUserCellDisplay(row, snap)
              return (
                <div
                  key={row.id}
                  onClick={() => setDeviceDetailId(row.id)}
                  className={`rounded-2xl p-4 cursor-pointer transition-colors ${nonCompliant ? 'bg-red-50 border-l-4 border-l-red-400' : 'bg-white hover:bg-gray-50'}`}
                  style={{ border: nonCompliant ? '1px solid rgba(220,38,38,0.2)' : '1px solid rgba(45,69,124,0.1)', boxShadow: '0 1px 4px rgba(45,69,124,0.05)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{row.hostname?.trim() || row.serial_number}</div>
                      {row.hostname?.trim() && (
                        <div className="font-mono text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.5)' }}>{row.serial_number}</div>
                      )}
                      {row.device_type && (
                        <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: 'rgba(45,69,124,0.07)', color: DYNAMO_BLUE }}>
                          {row.device_type}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0">
                      <ComplianceBadge state={snap?.complianceState} />
                    </div>
                  </div>
                  {userLabel !== '—' && (
                    <div className="flex items-center gap-2 mt-3">
                      <UserAvatar name={userLabel} />
                      <span className="text-sm font-medium truncate" style={{ color: TABLE_TEXT }}>{userLabel}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'rgba(45,69,124,0.06)' }}>
                    <span className="text-xs" style={{ color: dashboardUi.textMuted }}>{row.location || '—'}</span>
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button type="button" onClick={() => openEdit(row)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.2)' }}>
                        Bewerken
                      </button>
                      <button type="button" onClick={() => remove(row)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: '#b91c1c', border: '1px solid rgba(220,38,38,0.2)' }}>
                        Verwijderen
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── Intune section (collapsible) ── */}
        {items.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)', boxShadow: '0 1px 4px rgba(45,69,124,0.05)' }}>
            <button
              type="button"
              onClick={() => setIntuneOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 transition hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                <span className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Microsoft Intune overzicht</span>
              </div>
              <span className="text-xs font-bold" style={{ color: 'rgba(45,69,124,0.4)' }}>{intuneOpen ? '▲ Inklappen' : '▼ Uitklappen'}</span>
            </button>
            {intuneOpen && (
              <div className="border-t px-5 py-4" style={{ borderColor: 'rgba(45,69,124,0.08)' }}>
                <IntuneOverview items={items} filteredCount={filteredItems.length} />
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── 3-dot dropdown menu (fixed overlay) ── */}
      {openMenuId && (() => {
        const row = filteredItems.find(r => r.id === openMenuId)
        if (!row) return null
        const fdId = row.freshdesk_ticket_id != null ? (typeof row.freshdesk_ticket_id === 'number' ? row.freshdesk_ticket_id : Number(row.freshdesk_ticket_id)) : null
        const fdBusy = freshdeskBusyId === row.id
        return (
          <div
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 500, border: '1px solid rgba(45,69,124,0.12)', boxShadow: '0 8px 32px rgba(45,69,124,0.18)' }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-xl py-1 min-w-[176px]"
          >
            <button
              type="button"
              onClick={() => { openEdit(row); setOpenMenuId(null) }}
              className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              style={{ color: TABLE_TEXT, fontFamily: F }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Bewerken
            </button>
            <button
              type="button"
              onClick={() => { setDeviceDetailId(row.id); setOpenMenuId(null) }}
              className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              style={{ color: TABLE_TEXT, fontFamily: F }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              Details &amp; Freshdesk
            </button>
            {!fdId && freshdeskConfigData?.configured && (
              <button
                type="button"
                disabled={fdBusy}
                onClick={() => { void createFreshdeskTicketForDevice(row); setOpenMenuId(null) }}
                className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                style={{ color: TABLE_TEXT, fontFamily: F }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.7h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.91-1.14a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.01z"/></svg>
                {fdBusy ? 'Bezig…' : 'Maak Freshdesk-ticket'}
              </button>
            )}
            <div className="my-1 border-t" style={{ borderColor: 'rgba(45,69,124,0.08)' }} />
            <button
              type="button"
              onClick={() => { void remove(row); setOpenMenuId(null) }}
              className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors"
              style={{ color: '#b91c1c', fontFamily: F }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Verwijderen
            </button>
          </div>
        )
      })()}

      {/* ── Device detail modal ── */}
      {deviceDetailId && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-3" style={{ background: 'rgba(15,23,42,0.5)' }} role="dialog" aria-modal="true" aria-labelledby="it-cmdb-device-detail-heading" onClick={() => setDeviceDetailId(null)}>
          <div className="w-full max-w-lg max-h-[min(90vh,720px)] overflow-y-auto rounded-2xl p-5 space-y-4 shadow-2xl" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.12)' }} onClick={e => e.stopPropagation()}>
            {fdDetailLoading && !detailRow ? (
              <p className="text-sm m-0" style={{ color: dashboardUi.textMuted, fontFamily: F }}>Laden…</p>
            ) : !detailRow ? (
              <p className="text-sm m-0" style={{ color: '#b91c1c', fontFamily: F }}>Apparaat niet gevonden in het huidige filter.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h2 id="it-cmdb-device-detail-heading" className="text-base font-bold m-0 pr-2 leading-snug" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                    {detailRow.hostname?.trim() || '—'}{' '}
                    <span className="font-mono text-sm font-semibold opacity-90">· {detailRow.serial_number}</span>
                  </h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => { openEdit(detailRow); setDeviceDetailId(null) }} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: `1px solid ${DYNAMO_BLUE}`, color: DYNAMO_BLUE, fontFamily: F }}>
                      Bewerken
                    </button>
                    <button type="button" onClick={() => setDeviceDetailId(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: '1px solid rgba(45,69,124,0.2)', color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
                      Sluiten
                    </button>
                  </div>
                </div>
                {(() => {
                  const snap = isIntuneSnapshot(detailRow.intune_snapshot) ? detailRow.intune_snapshot : null
                  const { label: userLabel, title: userTitle } = cmdbUserCellDisplay(detailRow, snap)
                  return (
                    <div className="rounded-xl p-3 space-y-2 text-sm" style={{ background: 'rgba(45,69,124,0.04)', fontFamily: F }}>
                      <p className="m-0" style={{ color: TABLE_TEXT }}>
                        <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>Gebruiker: </span>
                        {userLabel !== '—' ? <span title={userTitle || undefined}>{userLabel}</span> : <span style={{ color: dashboardUi.textMuted }}>—</span>}
                      </p>
                      <p className="m-0" style={{ color: TABLE_TEXT }}>
                        <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>Compliance: </span>
                        {snap?.complianceState ? <ComplianceBadge state={snap.complianceState} /> : <span style={{ color: dashboardUi.textMuted }}>—</span>}
                      </p>
                      <p className="m-0 text-xs" style={{ color: dashboardUi.textMuted }}>Laatste sync: {formatIntuneSyncDate(snap?.lastSyncDateTime)}</p>
                      <p className="m-0 text-xs" style={{ color: dashboardUi.textMuted }}>
                        Type: {detailRow.device_type || '—'}{snap?.manufacturer || snap?.model ? ` · ${[snap.manufacturer, snap.model].filter(Boolean).join(' · ')}` : ''}
                      </p>
                      {detailRow.notes && <p className="m-0 text-xs" style={{ color: dashboardUi.textMuted }}>Notities: {detailRow.notes}</p>}
                    </div>
                  )
                })()}
                <div className="border-t pt-3" style={{ borderColor: dashboardUi.sectionDivider }}>
                  <p className="text-[11px] font-bold uppercase tracking-wide m-0 mb-2" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>Freshdesk</p>
                  {fdDetailLoading ? (
                    <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>Ticketstatus laden…</p>
                  ) : fdDetailData && typeof fdDetailData === 'object' && 'configured' in fdDetailData && fdDetailData.configured === false ? (
                    <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>{'error' in fdDetailData && typeof fdDetailData.error === 'string' ? fdDetailData.error : 'Freshdesk is niet geconfigureerd.'}</p>
                  ) : fdDetailData && typeof fdDetailData === 'object' && 'fetchError' in fdDetailData && fdDetailData.fetchError ? (
                    <p className="text-sm m-0" style={{ color: '#b91c1c' }}>{String(fdDetailData.fetchError)}</p>
                  ) : fdDetailData && typeof fdDetailData === 'object' && 'activeTicket' in fdDetailData && fdDetailData.activeTicket != null ? (
                    <div className="space-y-2">
                      <p className="text-sm m-0 font-semibold" style={{ color: TABLE_TEXT }}>{fdDetailData.activeTicket.subject}</p>
                      <p className="text-xs m-0" style={{ color: dashboardUi.textMuted }}>{fdDetailData.activeTicket.statusLabel} · prioriteit {fdDetailData.activeTicket.priority}</p>
                      {fdDetailData.activeTicket.url && (
                        <a href={fdDetailData.activeTicket.url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold underline" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                          Ticket #{fdDetailData.activeTicket.id} openen →
                        </a>
                      )}
                    </div>
                  ) : fdDetailData && typeof fdDetailData === 'object' && 'lastTicket' in fdDetailData && fdDetailData.lastTicket != null ? (
                    <div className="space-y-2">
                      <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>Het gekoppelde ticket is opgelost of gesloten. Je kunt een nieuw ticket aanmaken.</p>
                      <p className="text-sm m-0 font-medium" style={{ color: TABLE_TEXT }}>{fdDetailData.lastTicket.subject}</p>
                      <p className="text-xs m-0" style={{ color: dashboardUi.textMuted }}>Laatst bekend: {fdDetailData.lastTicket.statusLabel}</p>
                      {fdDetailData.lastTicket.url && (
                        <a href={fdDetailData.lastTicket.url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold underline" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                          Oud ticket #{fdDetailData.lastTicket.id} (archief) →
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm m-0" style={{ color: dashboardUi.textMuted }}>
                      {fdDetailData && typeof fdDetailData === 'object' && 'clearedStoredId' in fdDetailData && fdDetailData.clearedStoredId && !('lastTicket' in fdDetailData && fdDetailData.lastTicket)
                        ? 'Het eerder gekoppelde ticket bestaat niet meer in Freshdesk. Je kunt een nieuw ticket aanmaken.'
                        : 'Geen actief Freshdesk-ticket voor dit apparaat.'}
                    </p>
                  )}
                  {freshdeskConfigData?.configured && fdDetailData && typeof fdDetailData === 'object' && 'configured' in fdDetailData && fdDetailData.configured === true && !('fetchError' in fdDetailData && fdDetailData.fetchError) && 'activeTicket' in fdDetailData && fdDetailData.activeTicket == null && (
                    <button type="button" disabled={freshdeskBusyId === detailRow.id} onClick={() => void createFreshdeskTicketForDevice(detailRow)} className="mt-3 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                      {freshdeskBusyId === detailRow.id ? 'Bezig…' : 'Maak Freshdesk-ticket'}
                    </button>
                  )}
                  {fdDetailData && typeof fdDetailData === 'object' && 'configured' in fdDetailData && fdDetailData.configured === true && 'histError' in fdDetailData && typeof fdDetailData.histError === 'string' && fdDetailData.histError ? (
                    <p className="text-xs m-0 mt-3" style={{ color: '#b45309' }}>Geschiedenis kon niet geladen worden: {fdDetailData.histError}</p>
                  ) : null}
                  {fdDetailData && typeof fdDetailData === 'object' && 'ticketHistory' in fdDetailData && Array.isArray(fdDetailData.ticketHistory) && fdDetailData.ticketHistory.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide m-0" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>Ticketgeschiedenis</p>
                      <ul className="m-0 p-0 list-none space-y-2.5">
                        {fdDetailData.ticketHistory.map(h => {
                          const isActive = 'activeTicket' in fdDetailData && fdDetailData.activeTicket != null && fdDetailData.activeTicket.id === h.id
                          return (
                            <li key={`${h.id}-${h.linkedAt}`} className="rounded-lg p-2.5 text-sm" style={{ background: 'rgba(45,69,124,0.05)', border: '1px solid rgba(45,69,124,0.08)' }}>
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="font-semibold tabular-nums" style={{ color: DYNAMO_BLUE, fontFamily: F }}>#{h.id}</span>
                                {isActive && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d' }}>Actief</span>}
                              </div>
                              <p className="m-0 mt-1 line-clamp-2" style={{ color: TABLE_TEXT }}>{h.subject}</p>
                              <p className="text-xs m-0 mt-0.5" style={{ color: dashboardUi.textMuted }}>
                                {h.statusLabel}{h.fetchState === 'ok' ? ` · prioriteit ${h.priority}` : null} · gekoppeld {formatTicketLinkedAt(h.linkedAt)}
                              </p>
                              {h.url && <a href={h.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-1.5 text-xs font-semibold underline" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Openen in Freshdesk →</a>}
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

      {/* ── Statistiek modal ── */}
      {statsOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3" style={{ background: 'rgba(15,23,42,0.45)' }} role="dialog" aria-modal="true" aria-labelledby="it-cmdb-stats-heading" onClick={() => setStatsOpen(false)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-5 space-y-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.12)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="it-cmdb-stats-heading" className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Statistiek per type</h2>
              <button type="button" className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: `1px solid ${DYNAMO_BLUE}`, color: DYNAMO_BLUE, fontFamily: F }} onClick={() => setStatsOpen(false)}>Sluiten</button>
            </div>
            <p className="text-xs m-0" style={{ color: dashboardUi.textMuted }}>
              {hasActiveFilters ? 'Gebaseerd op de huidige filters.' : 'Alle apparaten.'}{' '}
              <span className="font-semibold" style={{ color: TABLE_TEXT }}>{items.length} totaal</span>
              {statsByType.length > 0 && <span> · {statsByType.length} {statsByType.length === 1 ? 'type' : 'types'}</span>}
            </p>
            <div className="grid gap-3">
              {statsByType.map(([typeLabel, count]) => {
                const pct = maxTypeCount > 0 ? Math.round((count / maxTypeCount) * 100) : 0
                return (
                  <div key={typeLabel}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-sm font-medium truncate min-w-0" style={{ color: TABLE_TEXT, fontFamily: F }} title={typeLabel}>{typeLabel}</span>
                      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                        {count}<span className="font-normal ml-1" style={{ color: dashboardUi.textMuted }}>({items.length > 0 ? Math.round((count / items.length) * 100) : 0}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(45,69,124,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: DYNAMO_BLUE }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3" style={{ background: 'rgba(15,23,42,0.45)' }} role="dialog" aria-modal="true" aria-label={editing ? 'Hardware bewerken' : 'Hardware toevoegen'}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.12)' }}>
            <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{editing ? 'Apparaat bewerken' : 'Nieuw apparaat'}</h2>
            {formError && <div className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#b91c1c', fontFamily: F }}>{formError}</div>}
            <form onSubmit={saveForm} className="space-y-3">
              {([
                ['Serienummer *', 'serial_number', 'text', ''],
                ['Hostname', 'hostname', 'text', 'DYN-xxxxx'],
                ['Intune', 'intune', 'text', 'Intune, Ja, Nee'],
                ['Type', 'device_type', 'text', 'Dell Latitude …'],
                ['Locatie', 'location', 'text', 'Gebruiker, Server Kast, België…'],
              ] as [string, keyof typeof form, string, string][]).map(([label, field, type, placeholder]) => (
                <div key={field}>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>{label}</label>
                  <input className={inputClass} style={inputStyle} type={type} placeholder={placeholder} value={(form[field] as string) ?? ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} required={field === 'serial_number'} />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>Portalgebruiker (DRG)</label>
                <select className={inputClass} style={inputStyle} value={form.assigned_user_id} onChange={e => setForm(f => ({ ...f, assigned_user_id: e.target.value }))} aria-label="Koppel aan portalgebruiker">
                  <option value="">— Niet gekoppeld</option>
                  {portalUsers.map(u => <option key={u.user_id} value={u.user_id}>{u.email || u.user_id}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>Gebruiker (vrije tekst)</label>
                <input className={inputClass} style={inputStyle} value={form.user_name ?? ''} onChange={e => setForm(f => ({ ...f, user_name: e.target.value }))} placeholder="Naam uit Intune of Excel" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>Opmerkingen</label>
                <textarea className={`${inputClass} min-h-[72px] resize-none`} style={inputStyle} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="submit" disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                  {saving ? 'Opslaan…' : 'Opslaan'}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl px-5 py-2.5 text-sm font-semibold" style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}>
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
