'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import type { ItCmdbHardware } from '@/lib/it-cmdb-types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const F = FONT_FAMILY

function emptyForm(): Omit<ItCmdbHardware, 'id' | 'created_at' | 'updated_at' | 'created_by'> {
  return {
    serial_number: '',
    hostname: '',
    intune: '',
    user_name: '',
    device_type: '',
    notes: '',
    location: '',
  }
}

export default function ItCmdbPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [q, setQ] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterIntune, setFilterIntune] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ItCmdbHardware | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

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

  const queryUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (filterLocation.trim()) p.set('location', filterLocation.trim())
    if (filterIntune.trim()) p.set('intune', filterIntune.trim())
    const s = p.toString()
    return s ? `/api/it-cmdb?${s}` : '/api/it-cmdb'
  }, [q, filterLocation, filterIntune])

  const { data, error, isLoading, mutate } = useSWR<{ items: ItCmdbHardware[] }>(allowed ? queryUrl : null, fetcher)

  const items = data?.items ?? []

  const locationOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      const l = it.location?.trim()
      if (l) set.add(l)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'))
  }, [items])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(row: ItCmdbHardware) {
    setEditing(row)
    setForm({
      serial_number: row.serial_number,
      hostname: row.hostname ?? '',
      intune: row.intune ?? '',
      user_name: row.user_name ?? '',
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
    async (row: ItCmdbHardware) => {
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

      <main className="flex-1 p-3 sm:p-5 max-w-[1400px] mx-auto w-full space-y-4">
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

        <div
          className="rounded-2xl p-4 flex flex-col xl:flex-row flex-wrap gap-3"
          style={{ background: dashboardUi.cardWhite.background, border: dashboardUi.cardWhite.border, boxShadow: dashboardUi.cardWhite.boxShadow }}
        >
          <div className="flex-1 min-w-[200px]">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: dashboardUi.textSubtle }}>
              Zoeken
            </label>
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Serie, hostname, gebruiker, type, locatie…"
              className="w-full rounded-xl px-3 py-2 text-sm border"
              style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE }}
            />
          </div>
          <div className="w-full sm:w-48">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: dashboardUi.textSubtle }}>
              Locatie (filter)
            </label>
            <input
              list="it-cmdb-locations"
              value={filterLocation}
              onChange={e => setFilterLocation(e.target.value)}
              placeholder="bijv. Gebruiker"
              className="w-full rounded-xl px-3 py-2 text-sm border"
              style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE }}
            />
            <datalist id="it-cmdb-locations">
              {locationOptions.map(loc => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>
          <div className="w-full sm:w-40">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: dashboardUi.textSubtle }}>
              Intune (filter)
            </label>
            <input
              value={filterIntune}
              onChange={e => setFilterIntune(e.target.value)}
              placeholder="Intune, Ja, Nee…"
              className="w-full rounded-xl px-3 py-2 text-sm border"
              style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE }}
            />
          </div>
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
          {isLoading ? (
            <p className="p-8 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
              Laden…
            </p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
              Geen regels. Voeg hardware toe of pas de filters aan.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr style={{ background: 'rgba(45,69,124,0.06)', borderBottom: '1px solid rgba(45,69,124,0.1)' }}>
                    {['Serie', 'Hostname', 'Intune', 'Gebruiker', 'Type', 'Opmerkingen', 'Locatie', ''].map(h => (
                      <th key={h} className="text-left px-3 py-3 font-bold whitespace-nowrap" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(row => (
                    <tr key={row.id} className="border-b border-[rgba(45,69,124,0.06)] hover:bg-[rgba(45,69,124,0.02)]">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold" style={{ color: DYNAMO_BLUE }}>
                        {row.serial_number}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs max-w-[180px]" style={{ color: dashboardUi.textMuted }}>
                        {row.hostname || '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.intune || '—'}</td>
                      <td className="px-3 py-2.5 max-w-[160px]">{row.user_name || '—'}</td>
                      <td className="px-3 py-2.5 max-w-[200px]">{row.device_type || '—'}</td>
                      <td className="px-3 py-2.5 max-w-[240px] text-xs" style={{ color: dashboardUi.textMuted }}>
                        {row.notes || '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.location || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right">
                        <button type="button" className="font-semibold mr-3" style={{ color: DYNAMO_BLUE }} onClick={() => openEdit(row)}>
                          Bewerken
                        </button>
                        <button type="button" className="font-semibold" style={{ color: '#dc2626' }} onClick={() => remove(row)}>
                          Verwijderen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && items.length > 0 && (
            <p className="px-4 py-2 text-xs m-0" style={{ color: dashboardUi.textSubtle }}>
              {items.length} regel{items.length === 1 ? '' : 'en'}
            </p>
          )}
        </div>
      </main>

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
                  Gebruiker
                </label>
                <input className={inputClass} style={inputStyle} value={form.user_name ?? ''} onChange={e => setForm(f => ({ ...f, user_name: e.target.value }))} />
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
