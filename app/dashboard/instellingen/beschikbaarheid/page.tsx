'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import { BeschikbaarheidBadge } from '@/components/BeschikbaarheidBadge'
import { berekenStatus, DAG_LABELS, ALLE_DAGEN, TIJDZONE_OPTIES, type BeschikbaarheidRecord } from '@/lib/beschikbaarheid'
import { useToast } from '@/components/Toast'
import type { MailboxOof, MailboxWorkHours } from '@/lib/microsoft-mailbox'

const F = FONT_FAMILY

// Datum naar datetime-local string (YYYY-MM-DDTHH:MM)
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Naar lokale tijd
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// datetime-local → ISO UTC
function localToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

export default function BeschikbaarheidInstellingenPage() {
  const addToast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [graphConfigured, setGraphConfigured] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // OOF velden
  const [oofStatus, setOofStatus] = useState<'disabled' | 'alwaysEnabled' | 'scheduled'>('disabled')
  const [oofStart, setOofStart] = useState('')
  const [oofEnd, setOofEnd] = useState('')
  const [oofInternal, setOofInternal] = useState('')
  const [oofExternal, setOofExternal] = useState('')

  // Werktijden velden
  const [workDays, setWorkDays] = useState<string[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  const [workStart, setWorkStart] = useState('09:00')
  const [workEnd, setWorkEnd] = useState('17:00')
  const [workTz, setWorkTz] = useState('W. Europe Standard Time')

  const fillForm = useCallback((row: BeschikbaarheidRecord) => {
    setOofStatus((row.oof_status as 'disabled' | 'alwaysEnabled' | 'scheduled') ?? 'disabled')
    setOofStart(toDatetimeLocal(row.oof_start))
    setOofEnd(toDatetimeLocal(row.oof_end))
    setOofInternal(row.oof_internal_msg ?? '')
    setOofExternal(row.oof_external_msg ?? '')
    setWorkDays(row.work_days ?? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
    setWorkStart(row.work_start_time ?? '09:00')
    setWorkEnd(row.work_end_time ?? '17:00')
    setWorkTz(row.work_timezone ?? 'W. Europe Standard Time')
  }, [])

  // Ophalen bij laden
  useEffect(() => {
    setLoading(true)
    fetch('/api/beschikbaarheid')
      .then(r => r.json())
      .then((data: { settings?: BeschikbaarheidRecord; graphConfigured?: boolean; synced?: boolean; syncError?: string }) => {
        setGraphConfigured(data.graphConfigured ?? false)
        setSyncError(data.syncError ?? null)
        if (data.settings) fillForm(data.settings)
      })
      .catch(() => addToast('Instellingen ophalen mislukt', 'error'))
      .finally(() => setLoading(false))
  }, [fillForm, addToast])

  // Handmatige sync vanuit Graph
  const handleSync = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/beschikbaarheid?force=1')
      const data = await res.json() as { settings?: BeschikbaarheidRecord; syncError?: string }
      if (data.syncError) { setSyncError(data.syncError); addToast('Sync gedeeltelijk mislukt', 'warning') }
      else { if (data.settings) fillForm(data.settings); addToast('Gesynchroniseerd met Microsoft', 'success') }
    } catch { addToast('Sync mislukt', 'error') }
    finally { setSyncing(false) }
  }

  // Opslaan
  const handleSave = async () => {
    setSaving(true)
    try {
      const oof: MailboxOof = {
        status: oofStatus,
        start: oofStart ? localToIso(oofStart) : null,
        end: oofEnd ? localToIso(oofEnd) : null,
        internalMsg: oofInternal,
        externalMsg: oofExternal,
      }
      const workHours: MailboxWorkHours = {
        days: workDays,
        startTime: workStart,
        endTime: workEnd,
        timezone: workTz,
      }
      const res = await fetch('/api/beschikbaarheid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oof, workHours }),
      })
      const data = await res.json() as { ok?: boolean; graphErrors?: string[]; error?: string }
      if (!res.ok) { addToast(data.error ?? 'Opslaan mislukt', 'error'); return }
      if (data.graphErrors?.length) {
        addToast(`Opgeslagen, maar Graph-fout: ${data.graphErrors[0]}`, 'warning')
      } else {
        addToast(graphConfigured ? 'Opgeslagen en gesynchroniseerd met Microsoft' : 'Opgeslagen', 'success')
      }
    } catch { addToast('Netwerkfout — probeer opnieuw', 'error') }
    finally { setSaving(false) }
  }

  // Live preview
  const previewRec: BeschikbaarheidRecord = {
    user_id: '',
    oof_status: oofStatus,
    oof_start: oofStart ? localToIso(oofStart) : null,
    oof_end: oofEnd ? localToIso(oofEnd) : null,
    oof_internal_msg: oofInternal,
    oof_external_msg: oofExternal,
    work_days: workDays,
    work_start_time: workStart,
    work_end_time: workEnd,
    work_timezone: workTz,
    graph_synced_at: null,
    updated_at: new Date().toISOString(),
  }
  const previewStatus = berekenStatus(previewRec)

  const inputCls = 'w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-[#2D457C] focus:ring-2 focus:ring-[#2D457C]/20'
  const inputStyle = { fontFamily: F, borderColor: 'rgba(45,69,124,0.2)', color: '#1e293b' }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10" style={{ borderColor: dashboardUi.sectionDivider }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href="/dashboard/instellingen"
            className="text-sm font-medium flex items-center gap-1.5 hover:opacity-75 transition-opacity"
            style={{ color: DYNAMO_BLUE }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Instellingen
          </Link>
          <span className="text-gray-300 select-none">/</span>
          <span className="text-sm font-semibold" style={{ color: '#1e293b' }}>Beschikbaarheid</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">

        {/* Paginakop */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold m-0" style={{ color: DYNAMO_BLUE }}>Beschikbaarheid</h1>
            <p className="text-sm m-0 mt-1" style={{ color: dashboardUi.textMuted }}>
              Beheer je out-of-office en werktijden.
              {graphConfigured && ' Wijzigingen worden direct in Microsoft 365 opgeslagen.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Live status preview */}
            <BeschikbaarheidBadge
              status={previewStatus}
              oofEnd={oofStatus === 'scheduled' && oofEnd ? localToIso(oofEnd) : null}
            />
            {graphConfigured && (
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing || loading}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden className={syncing ? 'animate-spin' : ''}>
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                {syncing ? 'Syncing…' : 'Sync Microsoft'}
              </button>
            )}
          </div>
        </div>

        {syncError && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <strong>Sync-waarschuwing:</strong> {syncError}
          </div>
        )}

        {!graphConfigured && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            Microsoft Graph is niet geconfigureerd. Wijzigingen worden lokaal opgeslagen maar niet doorgevoerd in Outlook.
            Zet <code>AZURE_TENANT_ID</code>, <code>AZURE_CLIENT_ID</code> en <code>AZURE_CLIENT_SECRET</code> in de serveromgeving en voeg de applicatiemachtiging <code>MailboxSettings.ReadWrite.All</code> toe.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin inline-block" style={{ borderColor: DYNAMO_BLUE }} />
          </div>
        ) : (
          <>
            {/* ── Out of Office ────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Out of office</h2>

              {/* Status toggle */}
              <div className="flex flex-col gap-2">
                {(
                  [
                    { value: 'disabled', label: 'Uitgeschakeld' },
                    { value: 'alwaysEnabled', label: 'Altijd aan' },
                    { value: 'scheduled', label: 'Gepland (op datum)' },
                  ] as const
                ).map(opt => (
                  <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="radio"
                      name="oofStatus"
                      value={opt.value}
                      checked={oofStatus === opt.value}
                      onChange={() => setOofStatus(opt.value)}
                      className="accent-[#2D457C] w-4 h-4"
                    />
                    <span className="text-sm font-medium" style={{ color: '#1e293b' }}>{opt.label}</span>
                  </label>
                ))}
              </div>

              {/* Geplande periode */}
              {oofStatus === 'scheduled' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Van</label>
                    <input type="datetime-local" value={oofStart} onChange={e => setOofStart(e.target.value)}
                      className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Tot</label>
                    <input type="datetime-local" value={oofEnd} onChange={e => setOofEnd(e.target.value)}
                      className={inputCls} style={inputStyle} />
                  </div>
                </div>
              )}

              {/* Berichten */}
              {oofStatus !== 'disabled' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>
                      Bericht voor collega&apos;s (intern)
                    </label>
                    <textarea
                      value={oofInternal}
                      onChange={e => setOofInternal(e.target.value)}
                      rows={3}
                      placeholder="Ik ben momenteel afwezig..."
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>
                      Bericht voor externe afzenders
                    </label>
                    <textarea
                      value={oofExternal}
                      onChange={e => setOofExternal(e.target.value)}
                      rows={3}
                      placeholder="Bedankt voor uw bericht. Ik ben momenteel niet beschikbaar..."
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ── Werktijden ───────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Werktijden</h2>

              {/* Werkdagen */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: dashboardUi.textSubtle }}>Werkdagen</label>
                <div className="flex flex-wrap gap-2">
                  {ALLE_DAGEN.map(dag => {
                    const actief = workDays.includes(dag)
                    return (
                      <button
                        key={dag}
                        type="button"
                        onClick={() =>
                          setWorkDays(actief ? workDays.filter(d => d !== dag) : [...workDays, dag])
                        }
                        className="rounded-xl px-3 py-1.5 text-xs font-semibold border transition"
                        style={{
                          background: actief ? DYNAMO_BLUE : 'white',
                          color: actief ? 'white' : '#64748b',
                          borderColor: actief ? DYNAMO_BLUE : 'rgba(0,0,0,0.12)',
                        }}
                      >
                        {DAG_LABELS[dag].slice(0, 2)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tijden */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Begintijd</label>
                  <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Eindtijd</label>
                  <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)}
                    className={inputCls} style={inputStyle} />
                </div>
              </div>

              {/* Tijdzone */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Tijdzone</label>
                <select
                  value={workTz}
                  onChange={e => setWorkTz(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                >
                  {TIJDZONE_OPTIES.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </section>

            {/* Opslaan */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-xl px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: DYNAMO_BLUE, fontFamily: F }}
              >
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
