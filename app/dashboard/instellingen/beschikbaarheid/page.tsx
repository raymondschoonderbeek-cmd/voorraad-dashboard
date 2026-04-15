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

type LogEntry = {
  id: number
  time: string
  event: string
  data: unknown
  ok?: boolean
}

let logIdCounter = 0

export default function BeschikbaarheidInstellingenPage() {
  const addToast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [graphConfigured, setGraphConfigured] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [graphMismatch, setGraphMismatch] = useState<{ portalStart: string; portalEnd: string; graphStart: string; graphEnd: string } | null>(null)

  // Debug log
  const [debugLog, setDebugLog] = useState<LogEntry[]>([])
  const [showDebug, setShowDebug] = useState(false)

  const addLog = useCallback((event: string, data: unknown, ok?: boolean) => {
    const entry: LogEntry = {
      id: ++logIdCounter,
      time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      event,
      data,
      ok,
    }
    setDebugLog(prev => [entry, ...prev].slice(0, 30))
  }, [])

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
    fetch('/api/beschikbaarheid?debug=true')
      .then(r => r.json())
      .then((data: { settings?: BeschikbaarheidRecord; graphConfigured?: boolean; syncError?: string; synced?: boolean; debug?: unknown; graphMismatch?: { portalStart: string; portalEnd: string; graphStart: string; graphEnd: string } | null; shouldSyncWorkSchedule?: boolean }) => {
        setGraphConfigured(data.graphConfigured ?? false)
        setSyncError(data.syncError ?? null)
        setGraphMismatch(data.graphMismatch ?? null)
        addLog('GET /api/beschikbaarheid (pagina-load)', {
          graphConfigured: data.graphConfigured,
          synced: data.synced,
          syncError: data.syncError,
          shouldSyncWorkSchedule: data.shouldSyncWorkSchedule,
          graphMismatch: data.graphMismatch,
          graphRaw: data.debug,
          settingsWorkSchedule: data.settings?.work_schedule,
          settingsWorkTimezone: data.settings?.work_timezone,
        }, !data.syncError)
        if (data.settings) fillForm(data.settings)
      })
      .catch((e) => { addToast('Instellingen ophalen mislukt', 'error'); addLog('GET fout', String(e), false) })
      .finally(() => setLoading(false))
  }, [fillForm, addToast, addLog])

  const syncFromGraph = useCallback(async (): Promise<boolean> => {
    // force=true: alles overschrijven vanuit Outlook (werktijden + schema)
    const res = await fetch('/api/beschikbaarheid?force=true&debug=true')
    const data = await res.json() as { settings?: BeschikbaarheidRecord; syncError?: string; synced?: boolean; debug?: unknown; graphMismatch?: null }
    addLog('GET ?force=true (Sync Microsoft)', {
      synced: data.synced,
      syncError: data.syncError,
      graphRaw: data.debug,
      settingsWorkSchedule: data.settings?.work_schedule,
      settingsWorkTimezone: data.settings?.work_timezone,
    }, !data.syncError)
    if (data.syncError) { setSyncError(data.syncError); return false }
    setGraphMismatch(null) // na force-sync is portal in sync met Graph
    if (data.settings) fillForm(data.settings)
    return true
  }, [fillForm, addLog])

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
      const patchBody = { oof, workSchedule, workTimezone: workTz, werklocatieSchema, werklocatie: werklocatieWaarde }
      addLog('PATCH →  verstuurd naar server', {
        workSchedule,
        workTimezone: workTz,
        werklocatieSchema,
        werklocatie: werklocatieWaarde,
        oofStatus,
      })
      const res = await fetch('/api/beschikbaarheid?debug=true', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      const data = await res.json() as { ok?: boolean; graphErrors?: string[]; error?: string; settings?: BeschikbaarheidRecord; synced?: boolean; debug?: unknown; graphSyncType?: string }
      addLog('PATCH ← response van server', {
        httpStatus: res.status,
        ok: data.ok,
        graphSyncType: data.graphSyncType,
        graphErrors: data.graphErrors,
        serverDebug: data.debug,
        savedWorkSchedule: data.settings?.work_schedule,
        savedWorkTimezone: data.settings?.work_timezone,
      }, res.ok && !data.graphErrors?.length)
      if (!res.ok) { addToast(data.error ?? 'Opslaan mislukt', 'error'); return }
      if (data.graphErrors?.length) {
        addToast(`Opgeslagen, maar Microsoft-fout: ${data.graphErrors[0]}`, 'warning')
      } else if (data.graphSyncType === 'bijgewerkt') {
        addToast('Opgeslagen en gesynchroniseerd met Outlook', 'success')
        setGraphMismatch(null) // Outlook is nu bijgewerkt met portal-tijden
      } else if (data.graphSyncType === 'overgeslagen') {
        addToast('Opgeslagen — Outlook niet bijgewerkt (tijden verschillen per dag)', 'success')
      } else {
        addToast('Opgeslagen', 'success')
      }
      if (data.settings) {
        fillForm(data.settings)
      }
    } catch (e) { addToast('Netwerkfout', 'error'); addLog('PATCH fout', String(e), false) }
    finally { setSaving(false) }
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

  // Graph sync status: uniforme tijden = Outlook kan worden bijgewerkt
  const activeDagen = ALLE_DAGEN.filter(d => workSchedule[d]?.enabled)
  const firstActiveDag = activeDagen[0] as DagNaam | undefined
  const tijdenUniform = firstActiveDag !== undefined && activeDagen.every(d =>
    workSchedule[d].start === workSchedule[firstActiveDag].start &&
    workSchedule[d].end === workSchedule[firstActiveDag].end
  )

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
        {graphMismatch && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
            <p className="font-semibold m-0">Graph workingHours wijkt af van portal schema</p>
            <p className="m-0">Portal: {graphMismatch.portalStart}–{graphMismatch.portalEnd} &nbsp;|&nbsp; Outlook: {graphMismatch.graphStart}–{graphMismatch.graphEnd}</p>
            <p className="m-0 text-xs opacity-80">Portal-tijden zijn leidend. Klik <strong>Opslaan</strong> om Outlook bij te werken, of <strong>Sync Microsoft</strong> om Outlook-tijden over te nemen.</p>
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
              <div>
                <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Werktijden</h2>
                <p className="text-xs mt-1 m-0" style={{ color: dashboardUi.textMuted }}>
                  Stel per dag je begin- en eindtijd in. Tijden worden lokaal opgeslagen.
                </p>
              </div>

              {/* Per-dag tijdinputs */}
              <div className="space-y-1.5">
                {ALLE_DAGEN.map(dag => {
                  const d = workSchedule[dag as DagNaam]
                  return (
                    <div key={dag} className="flex items-center gap-3 min-h-[36px]">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={d?.enabled ?? false}
                        onChange={e => {
                          const enabled = e.target.checked
                          setWorkSchedule(prev => ({
                            ...prev,
                            [dag]: { ...prev[dag as DagNaam], enabled },
                          }))
                        }}
                        className="accent-[#2D457C] w-4 h-4 rounded shrink-0"
                      />
                      {/* Dagnaam */}
                      <span
                        className="text-sm font-semibold w-20 shrink-0 select-none"
                        style={{ color: d?.enabled ? '#1e293b' : dashboardUi.textSubtle }}
                      >
                        {DAG_LABELS[dag as DagNaam]}
                      </span>
                      {/* Tijdinputs — alleen als dag actief */}
                      {d?.enabled ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="time"
                            value={d.start}
                            onChange={e => setWorkSchedule(prev => ({
                              ...prev,
                              [dag]: { ...prev[dag as DagNaam], start: e.target.value },
                            }))}
                            className={`${inputCls} tabular-nums`}
                            style={{ ...inputStyle, width: '7.5rem' }}
                          />
                          <span className="text-xs select-none" style={{ color: dashboardUi.textSubtle }}>–</span>
                          <input
                            type="time"
                            value={d.end}
                            onChange={e => setWorkSchedule(prev => ({
                              ...prev,
                              [dag]: { ...prev[dag as DagNaam], end: e.target.value },
                            }))}
                            className={`${inputCls} tabular-nums`}
                            style={{ ...inputStyle, width: '7.5rem' }}
                          />
                          {/* Kopieer tijden van deze dag naar alle andere actieve dagen */}
                          <button
                            type="button"
                            title="Kopieer tijden naar alle werkdagen"
                            onClick={() => setWorkSchedule(prev => {
                              const nieuw = { ...prev }
                              for (const d2 of ALLE_DAGEN) {
                                if (nieuw[d2 as DagNaam].enabled) {
                                  nieuw[d2 as DagNaam] = { ...nieuw[d2 as DagNaam], start: d.start, end: d.end }
                                }
                              }
                              return nieuw
                            })}
                            className="rounded-lg px-2 py-1.5 text-xs border transition hover:opacity-70 select-none"
                            style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white', fontFamily: F }}
                          >
                            Kopieer naar alle
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>niet actief</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Graph sync status */}
              {activeDagen.length > 0 && (
                <div
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
                  style={{
                    background: tijdenUniform ? 'rgba(22,163,74,0.06)' : 'rgba(245,158,11,0.08)',
                    color: tijdenUniform ? '#15803d' : '#92400e',
                  }}
                >
                  <span className="mt-px shrink-0">{tijdenUniform ? '✓' : '⚠'}</span>
                  <span>
                    {tijdenUniform
                      ? 'Alle werkdagen hebben dezelfde tijden — Outlook wordt bijgewerkt bij opslaan.'
                      : 'Tijden verschillen per dag — bij opslaan worden ze lokaal bewaard. Outlook wordt niet bijgewerkt (Graph ondersteunt geen per-dag tijden).'}
                  </span>
                </div>
              )}

              {/* Tijdzone */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: dashboardUi.textSubtle }}>Tijdzone</label>
                <select
                  value={workTz}
                  onChange={e => setWorkTz(e.target.value)}
                  className={`${inputCls} w-full`}
                  style={inputStyle}
                >
                  {TIJDZONE_OPTIES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </section>

            {/* ── Standaard werklocatie per dag ─────────────────── */}
            <section className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <div>
                <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Standaard werklocatie per dag</h2>
                <p className="text-xs mt-1 m-0" style={{ color: dashboardUi.textMuted }}>
                  Stel per werkdag je standaard locatie in.
                </p>
              </div>

              {activeDagen.length === 0 ? (
                <p className="text-sm" style={{ color: dashboardUi.textSubtle }}>
                  Geen werkdagen actief — stel eerst je werktijden in.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeDagen.map(dag => {
                    const huidig = werklocatieSchema[dag as DagNaam] ?? ''
                    const isCustom = huidig !== '' && huidig !== 'Thuis' && huidig !== 'Kantoor' && huidig !== 'Extern'
                    return (
                      <div key={dag} className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold w-20 shrink-0" style={{ color: '#1e293b' }}>
                          {DAG_LABELS[dag as DagNaam]}
                        </span>
                        <div className="flex gap-1.5 flex-wrap">
                          {(['', 'Thuis', 'Kantoor', 'Extern'] as const).map(opt => (
                            <button
                              key={opt || 'geen'}
                              type="button"
                              onClick={() => setWerklocatieSchema(prev => {
                                const nieuw = { ...prev }
                                if (opt === '') { delete nieuw[dag as DagNaam] }
                                else { nieuw[dag as DagNaam] = opt }
                                return nieuw
                              })}
                              className="rounded-lg px-2.5 py-1 text-xs font-semibold border transition hover:opacity-80"
                              style={{
                                background: huidig === opt ? DYNAMO_BLUE : 'white',
                                color: huidig === opt ? 'white' : DYNAMO_BLUE,
                                borderColor: huidig === opt ? DYNAMO_BLUE : 'rgba(45,69,124,0.2)',
                                fontFamily: F,
                              }}
                            >
                              {opt === '' ? '–' : opt === 'Thuis' ? '🏠 Thuis' : opt === 'Kantoor' ? '🏢 Kantoor' : '📍 Extern'}
                            </button>
                          ))}
                          {/* Toon custom waarde (gesynchroniseerd vanuit Outlook) als badge */}
                          {isCustom && (
                            <span className="rounded-lg px-2.5 py-1 text-xs font-semibold border"
                              style={{ background: DYNAMO_BLUE, color: 'white', borderColor: DYNAMO_BLUE }}>
                              📍 {huidig}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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

        {/* ── Debug log panel ──────────────────────────────── */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
          <button
            type="button"
            onClick={() => setShowDebug(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold"
            style={{ background: '#1e1e2e', color: '#cdd6f4', fontFamily: 'monospace' }}
          >
            <span>🪲 Debug log  ({debugLog.length} events)</span>
            <span style={{ opacity: 0.6 }}>{showDebug ? '▲ verberg' : '▼ toon'}</span>
          </button>

          {showDebug && (
            <div style={{ background: '#1e1e2e', maxHeight: 520, overflowY: 'auto' }}>
              {debugLog.length === 0 && (
                <p className="text-center py-6 text-xs" style={{ color: '#6c7086', fontFamily: 'monospace' }}>
                  Nog geen log-entries. Laad de pagina opnieuw of klik Opslaan / Sync.
                </p>
              )}
              {debugLog.map(entry => (
                <div key={entry.id} className="border-b" style={{ borderColor: '#313244' }}>
                  <div className="flex items-center gap-2 px-4 py-2" style={{ background: '#181825' }}>
                    <span className="text-xs tabular-nums" style={{ color: '#6c7086', fontFamily: 'monospace' }}>{entry.time}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-bold"
                      style={{
                        fontFamily: 'monospace',
                        background: entry.ok === false ? '#45213a' : entry.ok === true ? '#1e3a2f' : '#2a2a3e',
                        color: entry.ok === false ? '#f38ba8' : entry.ok === true ? '#a6e3a1' : '#89b4fa',
                      }}
                    >
                      {entry.event}
                    </span>
                    {entry.ok === false && <span className="text-xs" style={{ color: '#f38ba8' }}>✗ fout</span>}
                    {entry.ok === true && <span className="text-xs" style={{ color: '#a6e3a1' }}>✓ ok</span>}
                  </div>
                  <pre
                    className="px-4 py-3 text-xs overflow-x-auto m-0"
                    style={{ fontFamily: 'monospace', color: '#cdd6f4', background: '#1e1e2e', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                  >
                    {JSON.stringify(entry.data, null, 2)}
                  </pre>
                </div>
              ))}
              {debugLog.length > 0 && (
                <div className="px-4 py-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDebugLog([])}
                    className="text-xs px-3 py-1 rounded"
                    style={{ background: '#313244', color: '#cdd6f4', fontFamily: 'monospace' }}
                  >
                    wis log
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
