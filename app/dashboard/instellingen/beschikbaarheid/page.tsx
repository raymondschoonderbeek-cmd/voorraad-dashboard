'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import { BeschikbaarheidBadge } from '@/components/BeschikbaarheidBadge'
import {
  berekenStatus, berekenVolgendeLabel,
  DAG_LABELS, ALLE_DAGEN, TIJDZONE_OPTIES,
  DEFAULT_WEEK_SCHEMA,
  type BeschikbaarheidRecord, type WeekSchema, type DagNaam, type WerklocatieSchema,
} from '@/lib/beschikbaarheid'
import { useToast } from '@/components/Toast'
import type { MailboxOof } from '@/lib/microsoft-mailbox'

const F = FONT_FAMILY

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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

  // OOF
  const [oofStatus, setOofStatus] = useState<'disabled' | 'alwaysEnabled' | 'scheduled'>('disabled')
  const [oofStart, setOofStart] = useState('')
  const [oofEnd, setOofEnd] = useState('')
  const [oofInternal, setOofInternal] = useState('')
  const [oofExternal, setOofExternal] = useState('')

  // Werktijden
  const [workSchedule, setWorkSchedule] = useState<WeekSchema>(DEFAULT_WEEK_SCHEMA)
  const [workTz, setWorkTz] = useState('W. Europe Standard Time')

  // Werklocatie (vandaag, éénmalig)
  const [werklocatie, setWerklocatie] = useState<string>('')
  const [werklocatieAndere, setWerklocatieAndere] = useState('')

  // Werklocatie schema (standaard per dag)
  const [werklocatieSchema, setWerklocatieSchema] = useState<WerklocatieSchema>({})

  const fillForm = useCallback((row: BeschikbaarheidRecord) => {
    setOofStatus((row.oof_status as typeof oofStatus) ?? 'disabled')
    setOofStart(toDatetimeLocal(row.oof_start))
    setOofEnd(toDatetimeLocal(row.oof_end))
    setOofInternal(row.oof_internal_msg ?? '')
    setOofExternal(row.oof_external_msg ?? '')
    setWorkSchedule(row.work_schedule ?? DEFAULT_WEEK_SCHEMA)
    setWorkTz(row.work_timezone ?? 'W. Europe Standard Time')
    setWerklocatieSchema((row.werklocatie_schema as WerklocatieSchema) ?? {})
    const loc = row.werklocatie ?? ''
    if (loc === 'Thuis' || loc === 'Kantoor' || loc === '') {
      setWerklocatie(loc)
      setWerklocatieAndere('')
    } else {
      setWerklocatie('anders')
      setWerklocatieAndere(loc)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch('/api/beschikbaarheid')
      .then(r => r.json())
      .then((data: { settings?: BeschikbaarheidRecord; graphConfigured?: boolean; syncError?: string }) => {
        setGraphConfigured(data.graphConfigured ?? false)
        setSyncError(data.syncError ?? null)
        if (data.settings) fillForm(data.settings)
      })
      .catch(() => addToast('Instellingen ophalen mislukt', 'error'))
      .finally(() => setLoading(false))
  }, [fillForm, addToast])

  const syncFromGraph = useCallback(async (): Promise<boolean> => {
    const res = await fetch('/api/beschikbaarheid')
    const data = await res.json() as { settings?: BeschikbaarheidRecord; syncError?: string }
    if (data.syncError) { setSyncError(data.syncError); return false }
    if (data.settings) fillForm(data.settings)
    return true
  }, [fillForm])

  const handleSync = async () => {
    setSyncing(true); setSyncError(null)
    try {
      const ok = await syncFromGraph()
      if (ok) addToast('Gesynchroniseerd met Microsoft', 'success')
      else addToast('Sync gedeeltelijk mislukt', 'warning')
    } catch { addToast('Sync mislukt', 'error') }
    finally { setSyncing(false) }
  }

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
      const werklocatieWaarde = werklocatie === 'anders'
        ? (werklocatieAndere.trim() || null)
        : (werklocatie || null)
      const res = await fetch('/api/beschikbaarheid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oof, workSchedule, workTimezone: workTz, werklocatie: werklocatieWaarde, werklocatieSchema }),
      })
      const data = await res.json() as { ok?: boolean; graphErrors?: string[]; error?: string; settings?: BeschikbaarheidRecord; synced?: boolean }
      if (!res.ok) { addToast(data.error ?? 'Opslaan mislukt', 'error'); return }
      if (data.graphErrors?.length) {
        addToast(`Opgeslagen, maar Microsoft-fout: ${data.graphErrors[0]}`, 'warning')
      } else {
        addToast(graphConfigured ? 'Opgeslagen en gesynchroniseerd met Outlook' : 'Opgeslagen', 'success')
      }
      // Vul form met verse settings uit de response (na-sync vanuit Graph)
      if (data.settings) {
        fillForm(data.settings)
      }
    } catch { addToast('Netwerkfout', 'error') }
    finally { setSaving(false) }
  }

  // Helper: zet één veld van een dag
  const setDagVeld = (dag: DagNaam, veld: 'enabled' | 'start' | 'end', waarde: boolean | string) => {
    setWorkSchedule(prev => ({
      ...prev,
      [dag]: { ...prev[dag], [veld]: waarde },
    }))
  }

  // Kopieer tijden van één dag naar alle actieve dagen
  const kopieertijden = (bronDag: DagNaam) => {
    const bron = workSchedule[bronDag]
    setWorkSchedule(prev => {
      const nieuw = { ...prev }
      for (const dag of ALLE_DAGEN) {
        if (nieuw[dag].enabled) {
          nieuw[dag] = { ...nieuw[dag], start: bron.start, end: bron.end }
        }
      }
      return nieuw
    })
  }

  // Live status preview
  const previewRec: BeschikbaarheidRecord = {
    user_id: '',
    oof_status: oofStatus,
    oof_start: oofStart ? localToIso(oofStart) : null,
    oof_end: oofEnd ? localToIso(oofEnd) : null,
    oof_internal_msg: oofInternal,
    oof_external_msg: oofExternal,
    work_schedule: workSchedule,
    work_timezone: workTz,
    werklocatie: werklocatie === 'anders' ? werklocatieAndere.trim() || null : werklocatie || null,
    werklocatie_schema: werklocatieSchema,
    graph_synced_at: null,
    updated_at: new Date().toISOString(),
  }
  const previewStatus = berekenStatus(previewRec)

  const inputCls = 'rounded-lg border px-2 py-1.5 text-sm outline-none transition focus:border-[#2D457C] focus:ring-2 focus:ring-[#2D457C]/20'
  const inputStyle = { fontFamily: F, borderColor: 'rgba(45,69,124,0.2)', color: '#1e293b' }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      {/* Header */}
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-4 sm:px-6 flex items-center gap-3 py-2 border-b border-white/10 min-h-[44px]">
          <Link href="/dashboard/instellingen" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90 shrink-0">
            ← Instellingen
          </Link>
          <span className="text-white/50 text-xs select-none">Beschikbaarheid</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">

        {/* Paginakop */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold m-0" style={{ color: DYNAMO_BLUE }}>Beschikbaarheid</h1>
            <p className="text-sm m-0 mt-1" style={{ color: dashboardUi.textMuted }}>
              Stel per dag je werktijden en out-of-office in.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <BeschikbaarheidBadge
              status={previewStatus}
              oofStart={oofStatus === 'scheduled' && oofStart ? localToIso(oofStart) : null}
              oofEnd={oofStatus === 'scheduled' && oofEnd ? localToIso(oofEnd) : null}
              nextAvailableLabel={berekenVolgendeLabel(previewRec)}
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
            <strong>Let op:</strong> {syncError}
          </div>
        )}
        {!graphConfigured && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            Microsoft Graph niet geconfigureerd — wijzigingen worden lokaal opgeslagen.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <span className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
          </div>
        ) : (
          <>
            {/* ── Out of Office ──────────────────────────────────── */}
            <section className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Out of office</h2>

              <div className="flex flex-col gap-2">
                {([
                  { value: 'disabled',      label: 'Uitgeschakeld' },
                  { value: 'alwaysEnabled', label: 'Altijd aan' },
                  { value: 'scheduled',     label: 'Gepland (datum en tijd)' },
                ] as const).map(opt => (
                  <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                    <input type="radio" name="oofStatus" value={opt.value}
                      checked={oofStatus === opt.value} onChange={() => setOofStatus(opt.value)}
                      className="accent-[#2D457C] w-4 h-4" />
                    <span className="text-sm font-medium" style={{ color: '#1e293b' }}>{opt.label}</span>
                  </label>
                ))}
              </div>

              {oofStatus === 'scheduled' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Van</label>
                    <input type="datetime-local" value={oofStart} onChange={e => setOofStart(e.target.value)}
                      className={`${inputCls} w-full`} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Tot</label>
                    <input type="datetime-local" value={oofEnd} onChange={e => setOofEnd(e.target.value)}
                      className={`${inputCls} w-full`} style={inputStyle} />
                  </div>
                </div>
              )}

              {oofStatus !== 'disabled' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Bericht voor collega&apos;s (intern)</label>
                    <textarea value={oofInternal} onChange={e => setOofInternal(e.target.value)} rows={3}
                      placeholder="Ik ben momenteel afwezig…"
                      className={`${inputCls} w-full resize-none`} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Bericht voor externe afzenders</label>
                    <textarea value={oofExternal} onChange={e => setOofExternal(e.target.value)} rows={3}
                      placeholder="Bedankt voor uw bericht. Ik ben momenteel niet beschikbaar…"
                      className={`${inputCls} w-full resize-none`} style={inputStyle} />
                  </div>
                </div>
              )}
            </section>

            {/* ── Werktijden ─────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Werktijden per dag</h2>
                {/* Tijdzone */}
                <select value={workTz} onChange={e => setWorkTz(e.target.value)}
                  className={`${inputCls} text-xs`} style={{ ...inputStyle, fontSize: '12px' }}>
                  {TIJDZONE_OPTIES.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Per-dag rijen */}
              <div className="space-y-1">
                {/* Header */}
                <div className="grid items-center gap-2 px-1 pb-1"
                  style={{ gridTemplateColumns: '1fr auto auto auto auto' }}>
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: dashboardUi.textSubtle }}>Dag</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide w-16 text-center" style={{ color: dashboardUi.textSubtle }}>Begin</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: dashboardUi.textSubtle }}>—</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide w-16 text-center" style={{ color: dashboardUi.textSubtle }}>Eind</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide w-8" style={{ color: dashboardUi.textSubtle }}></span>
                </div>

                {ALLE_DAGEN.map(dag => {
                  const d = workSchedule[dag]
                  return (
                    <div
                      key={dag}
                      className="grid items-center gap-2 rounded-xl px-3 py-2 transition-colors"
                      style={{
                        gridTemplateColumns: '1fr auto auto auto auto',
                        background: d.enabled ? 'rgba(45,69,124,0.04)' : 'transparent',
                        opacity: d.enabled ? 1 : 0.45,
                      }}
                    >
                      {/* Dag + toggle */}
                      <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={d.enabled}
                          onChange={e => setDagVeld(dag, 'enabled', e.target.checked)}
                          className="accent-[#2D457C] w-4 h-4 shrink-0"
                        />
                        <span className="text-sm font-semibold truncate" style={{ color: '#1e293b' }}>
                          {DAG_LABELS[dag]}
                        </span>
                      </label>

                      {/* Begintijd */}
                      <input
                        type="time"
                        value={d.start}
                        disabled={!d.enabled}
                        onChange={e => setDagVeld(dag, 'start', e.target.value)}
                        className={`${inputCls} w-24 text-center`}
                        style={{ ...inputStyle, opacity: d.enabled ? 1 : 0.5 }}
                      />

                      <span className="text-sm text-gray-400 select-none">—</span>

                      {/* Eindtijd */}
                      <input
                        type="time"
                        value={d.end}
                        disabled={!d.enabled}
                        onChange={e => setDagVeld(dag, 'end', e.target.value)}
                        className={`${inputCls} w-24 text-center`}
                        style={{ ...inputStyle, opacity: d.enabled ? 1 : 0.5 }}
                      />

                      {/* Kopieer naar alle actieve dagen */}
                      {d.enabled && (
                        <button
                          type="button"
                          title="Kopieer naar alle actieve dagen"
                          onClick={() => kopieertijden(dag)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[rgba(45,69,124,0.1)] transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ color: DYNAMO_BLUE }} aria-hidden>
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </button>
                      )}
                      {!d.enabled && <div className="w-7" />}
                    </div>
                  )
                })}
              </div>

              <p className="text-xs" style={{ color: dashboardUi.textSubtle }}>
                Klik op <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mx-0.5 -mt-0.5" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> om de tijden van die dag naar alle actieve dagen te kopiëren.
              </p>
            </section>

            {/* ── Standaard werklocatie per dag ─────────────────── */}
            <section className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <div>
                <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Standaard werklocatie per dag</h2>
                <p className="text-xs mt-1 m-0" style={{ color: dashboardUi.textMuted }}>
                  Stel in waar je normaal gesproken per dag werkt. Gesynchroniseerd vanuit je Outlook-agenda.
                </p>
              </div>

              <div className="space-y-1">
                {ALLE_DAGEN.filter(dag => workSchedule[dag]?.enabled).map(dag => {
                  const huidige = werklocatieSchema[dag] ?? ''
                  const isAnders = huidige !== '' && huidige !== 'Thuis' && huidige !== 'Kantoor'
                  return (
                    <div key={dag} className="grid items-center gap-2 rounded-xl px-3 py-2"
                      style={{ gridTemplateColumns: '120px 1fr', background: 'rgba(45,69,124,0.03)' }}>
                      <span className="text-sm font-semibold" style={{ color: '#1e293b', fontFamily: F }}>
                        {DAG_LABELS[dag]}
                      </span>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        {(['', 'Thuis', 'Kantoor'] as const).map(opt => (
                          <button key={opt} type="button"
                            onClick={() => setWerklocatieSchema(prev => ({ ...prev, [dag]: opt }))}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold border transition"
                            style={{
                              background: huidige === opt ? DYNAMO_BLUE : 'white',
                              color: huidige === opt ? 'white' : DYNAMO_BLUE,
                              borderColor: huidige === opt ? DYNAMO_BLUE : 'rgba(45,69,124,0.2)',
                              fontFamily: F,
                            }}
                          >
                            {opt === '' ? '–' : opt === 'Thuis' ? '🏠 Thuis' : '🏢 Kantoor'}
                          </button>
                        ))}
                        <input
                          type="text"
                          value={isAnders ? huidige : ''}
                          onChange={e => setWerklocatieSchema(prev => ({ ...prev, [dag]: e.target.value }))}
                          placeholder="Andere locatie"
                          className={`${inputCls} text-xs`}
                          style={{ ...inputStyle, width: '130px', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── Werklocatie vandaag (override) ─────────────────── */}
            <section className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <div>
                <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Werklocatie vandaag</h2>
                <p className="text-xs mt-1 m-0" style={{ color: dashboardUi.textMuted }}>
                  Afwijking van je standaard? Stel hier een eenmalige override in voor vandaag.
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                {(['', 'Thuis', 'Kantoor', 'anders'] as const).map(opt => {
                  const label = opt === '' ? 'Standaard (geen override)' : opt === 'anders' ? 'Andere locatie…' : opt
                  const actief = werklocatie === opt
                  return (
                    <button key={opt} type="button" onClick={() => setWerklocatie(opt)}
                      className="rounded-xl px-4 py-2 text-sm font-semibold border transition"
                      style={{
                        background: actief ? DYNAMO_BLUE : 'white',
                        color: actief ? 'white' : DYNAMO_BLUE,
                        borderColor: actief ? DYNAMO_BLUE : 'rgba(45,69,124,0.2)',
                        fontFamily: F,
                      }}
                    >
                      {opt === 'Thuis' && '🏠 '}{opt === 'Kantoor' && '🏢 '}{label}
                    </button>
                  )
                })}
              </div>

              {werklocatie === 'anders' && (
                <input type="text" value={werklocatieAndere} onChange={e => setWerklocatieAndere(e.target.value)}
                  placeholder="bijv. Vestiging Amsterdam, klant, onderweg…"
                  className={`${inputCls} w-full`} style={inputStyle} />
              )}
            </section>

            {/* Opslaan */}
            <div className="flex justify-end">
              <button type="button" onClick={() => void handleSave()} disabled={saving}
                className="rounded-xl px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
