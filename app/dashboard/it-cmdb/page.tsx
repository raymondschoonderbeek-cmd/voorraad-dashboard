'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import type { ItCmdbHardware, ItCmdbHardwareListItem } from '@/lib/it-cmdb-types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const F = FONT_FAMILY
/** Vaste leesbare tekst op witte kaarten (niet `textMuted` — te licht op wit) */
const TABLE_TEXT = '#1e293b'

const FILTER_DEBOUNCE_MS = 350

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

function emptyForm(): Omit<ItCmdbHardware, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'assigned_user_id'> & {
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
  const [filterSerial, setFilterSerial] = useState('')
  const [filterHostname, setFilterHostname] = useState('')
  const [filterIntune, setFilterIntune] = useState('')
  const [filterUserName, setFilterUserName] = useState('')
  const [filterDeviceType, setFilterDeviceType] = useState('')
  const [filterNotes, setFilterNotes] = useState('')
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
  const dFilterSerial = useDebouncedValue(filterSerial, FILTER_DEBOUNCE_MS)
  const dFilterHostname = useDebouncedValue(filterHostname, FILTER_DEBOUNCE_MS)
  const dFilterIntune = useDebouncedValue(filterIntune, FILTER_DEBOUNCE_MS)
  const dFilterUserName = useDebouncedValue(filterUserName, FILTER_DEBOUNCE_MS)
  const dFilterDeviceType = useDebouncedValue(filterDeviceType, FILTER_DEBOUNCE_MS)
  const dFilterNotes = useDebouncedValue(filterNotes, FILTER_DEBOUNCE_MS)
  const dFilterLocation = useDebouncedValue(filterLocation, FILTER_DEBOUNCE_MS)

  const queryUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (dq.trim()) p.set('q', dq.trim())
    if (dFilterSerial.trim()) p.set('serial', dFilterSerial.trim())
    if (dFilterHostname.trim()) p.set('hostname', dFilterHostname.trim())
    if (dFilterIntune.trim()) p.set('intune', dFilterIntune.trim())
    if (dFilterUserName.trim()) p.set('user_name', dFilterUserName.trim())
    if (dFilterDeviceType.trim()) p.set('device_type', dFilterDeviceType.trim())
    if (dFilterNotes.trim()) p.set('notes', dFilterNotes.trim())
    if (dFilterLocation.trim()) p.set('location', dFilterLocation.trim())
    const s = p.toString()
    return s ? `/api/it-cmdb?${s}` : '/api/it-cmdb'
  }, [
    dq,
    dFilterSerial,
    dFilterHostname,
    dFilterIntune,
    dFilterUserName,
    dFilterDeviceType,
    dFilterNotes,
    dFilterLocation,
  ])

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

  const items = data?.items ?? []
  const portalUsers = portalUsersData?.users ?? []

  const locationOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      const l = it.location?.trim()
      if (l) set.add(l)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'))
  }, [items])

  const hasActiveFilter = Boolean(
    q.trim() ||
      filterSerial.trim() ||
      filterHostname.trim() ||
      filterIntune.trim() ||
      filterUserName.trim() ||
      filterDeviceType.trim() ||
      filterNotes.trim() ||
      filterLocation.trim()
  )

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

        <div
          className="rounded-2xl p-4 flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end"
          style={{ background: dashboardUi.cardWhite.background, border: dashboardUi.cardWhite.border, boxShadow: dashboardUi.cardWhite.boxShadow }}
        >
          <div className="flex-1 min-w-[220px]">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: dashboardUi.textSubtle }}>
              Zoeken in alle kolommen
            </label>
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Woord in serie, hostname, gebruiker, type, opmerkingen, locatie, Intune…"
              className="w-full rounded-xl px-3 py-2 text-sm border"
              style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE }}
            />
          </div>
          <p className="text-xs m-0 sm:pb-2 max-w-md" style={{ color: dashboardUi.textMuted }}>
            Per kolom filter je in de tabel hieronder; kolomfilters worden gecombineerd met dit zoekveld.
          </p>
        </div>

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
                className="w-full text-sm border-collapse min-w-[980px]"
                style={{ color: TABLE_TEXT, fontFamily: F }}
              >
                <thead>
                  <tr style={{ background: 'rgba(45,69,124,0.06)', borderBottom: '1px solid rgba(45,69,124,0.1)' }}>
                    {['Serie', 'Hostname', 'Intune', 'Gebruiker', 'Type', 'Opmerkingen', 'Locatie', ''].map(h => (
                      <th key={h || 'acties'} className="text-left px-3 py-3 font-bold whitespace-nowrap" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                  <tr style={{ background: 'rgba(45,69,124,0.04)', borderBottom: '1px solid rgba(45,69,124,0.12)' }}>
                    <th className="px-2 py-2 align-top font-normal">
                      <input
                        type="search"
                        value={filterSerial}
                        onChange={e => setFilterSerial(e.target.value)}
                        placeholder="Filter…"
                        aria-label="Filter op serienummer"
                        className="w-full min-w-[7rem] rounded-lg px-2 py-1.5 text-xs border"
                        style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE, fontFamily: F }}
                      />
                    </th>
                    <th className="px-2 py-2 align-top font-normal">
                      <input
                        type="search"
                        value={filterHostname}
                        onChange={e => setFilterHostname(e.target.value)}
                        placeholder="Filter…"
                        aria-label="Filter op hostname"
                        className="w-full min-w-[7rem] rounded-lg px-2 py-1.5 text-xs border"
                        style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE, fontFamily: F }}
                      />
                    </th>
                    <th className="px-2 py-2 align-top font-normal">
                      <input
                        type="search"
                        value={filterIntune}
                        onChange={e => setFilterIntune(e.target.value)}
                        placeholder="Filter…"
                        aria-label="Filter op Intune"
                        className="w-full min-w-[5rem] rounded-lg px-2 py-1.5 text-xs border"
                        style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE, fontFamily: F }}
                      />
                    </th>
                    <th className="px-2 py-2 align-top font-normal">
                      <input
                        type="search"
                        value={filterUserName}
                        onChange={e => setFilterUserName(e.target.value)}
                        placeholder="Filter…"
                        aria-label="Filter op gebruiker"
                        className="w-full min-w-[6rem] rounded-lg px-2 py-1.5 text-xs border"
                        style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE, fontFamily: F }}
                      />
                    </th>
                    <th className="px-2 py-2 align-top font-normal">
                      <input
                        type="search"
                        value={filterDeviceType}
                        onChange={e => setFilterDeviceType(e.target.value)}
                        placeholder="Filter…"
                        aria-label="Filter op type"
                        className="w-full min-w-[6rem] rounded-lg px-2 py-1.5 text-xs border"
                        style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE, fontFamily: F }}
                      />
                    </th>
                    <th className="px-2 py-2 align-top font-normal">
                      <input
                        type="search"
                        value={filterNotes}
                        onChange={e => setFilterNotes(e.target.value)}
                        placeholder="Filter…"
                        aria-label="Filter op opmerkingen"
                        className="w-full min-w-[8rem] rounded-lg px-2 py-1.5 text-xs border"
                        style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE, fontFamily: F }}
                      />
                    </th>
                    <th className="px-2 py-2 align-top font-normal">
                      <input
                        list="it-cmdb-locations"
                        value={filterLocation}
                        onChange={e => setFilterLocation(e.target.value)}
                        placeholder="Filter…"
                        aria-label="Filter op locatie"
                        className="w-full min-w-[6rem] rounded-lg px-2 py-1.5 text-xs border"
                        style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE, fontFamily: F }}
                      />
                    </th>
                    <th className="px-2 py-2 align-top font-normal w-[1%] whitespace-nowrap">
                      {hasActiveFilter && (
                        <button
                          type="button"
                          className="text-xs font-semibold underline-offset-2 hover:underline"
                          style={{ color: DYNAMO_BLUE, fontFamily: F }}
                          onClick={() => {
                            setQ('')
                            setFilterSerial('')
                            setFilterHostname('')
                            setFilterIntune('')
                            setFilterUserName('')
                            setFilterDeviceType('')
                            setFilterNotes('')
                            setFilterLocation('')
                          }}
                        >
                          Wis filters
                        </button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
                        Geen regels. Voeg hardware toe of pas de filters aan.
                      </td>
                    </tr>
                  ) : (
                    items.map(row => (
                      <tr key={row.id} className="border-b border-[rgba(45,69,124,0.06)] hover:bg-[rgba(45,69,124,0.03)]">
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold align-top" style={{ color: DYNAMO_BLUE }}>
                          {row.serial_number}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs max-w-[180px] align-top" style={{ color: TABLE_TEXT }}>
                          {row.hostname || '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap align-top" style={{ color: TABLE_TEXT }}>
                          {row.intune || '—'}
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px] align-top" style={{ color: TABLE_TEXT }}>
                          {row.assigned_user_email ? (
                            <span className="block">
                              <span className="font-medium" title="Gekoppeld aan portal">
                                {row.assigned_user_email}
                              </span>
                              {row.user_name?.trim() && row.user_name.trim() !== row.assigned_user_email ? (
                                <span className="block text-xs mt-0.5 opacity-85" title="Vrije tekst / import">
                                  {row.user_name}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            row.user_name || '—'
                          )}
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px] align-top" style={{ color: TABLE_TEXT }}>
                          {row.device_type || '—'}
                        </td>
                        <td className="px-3 py-2.5 max-w-[280px] text-xs leading-relaxed align-top" style={{ color: TABLE_TEXT }}>
                          {row.notes || '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap align-top" style={{ color: TABLE_TEXT }}>
                          {row.location || '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right align-top">
                          <button type="button" className="font-semibold mr-3" style={{ color: DYNAMO_BLUE }} onClick={() => openEdit(row)}>
                            Bewerken
                          </button>
                          <button type="button" className="font-semibold" style={{ color: '#dc2626' }} onClick={() => remove(row)}>
                            Verwijderen
                          </button>
                        </td>
                      </tr>
                    ))
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
              {hasActiveFilter
                ? 'Gebaseerd op de huidige zoek- en filterresultaten.'
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
