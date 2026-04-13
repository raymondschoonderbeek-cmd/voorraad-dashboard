'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'

const F = FONT_FAMILY

interface LogEntry {
  id: number
  created_at: string
  ticket_id: string | null
  status: string
  bericht: string
  geupload: string[]
  fouten: string[]
}

interface Taak {
  id: number
  naam: string
  ftp_host: string | null
  ftp_user: string | null
  ftp_password_set: boolean
  ftp_port: number
  ftp_pad: string
  webhook_secret: string | null
  actief: boolean
  updated_at: string | null
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
      style={{ background: copied ? '#dcfce7' : 'rgba(45,69,124,0.08)', color: copied ? '#15803d' : DYNAMO_BLUE, fontFamily: F }}
    >
      {copied ? '✓ Gekopieerd' : 'Kopieer'}
    </button>
  )
}

export default function FtpTaakPage() {
  const router = useRouter()
  const params = useParams()
  const taakId = params.id as string

  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [taak, setTaak] = useState<Taak | null>(null)
  const [laden, setLaden] = useState(true)
  const [log, setLog] = useState<LogEntry[]>([])
  const [logLaden, setLogLaden] = useState(false)

  // Form state
  const [naam, setNaam] = useState('')
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [port, setPort] = useState('21')
  const [pad, setPad] = useState('/')
  const [actief, setActief] = useState(true)
  const [geheimTonen, setGeheimTonen] = useState(false)

  // Status
  const [opslaan, setOpslaan] = useState(false)
  const [opslaanMsg, setOpslaanMsg] = useState<{ ok: boolean; tekst: string } | null>(null)
  const [testen, setTesten] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; tekst: string } | null>(null)

  const laadLog = useCallback(async (id: string) => {
    setLogLaden(true)
    const res = await fetch(`/api/admin/ftp-koppeling/log?koppeling_id=${id}`)
    const data = await res.json() as { log?: LogEntry[] }
    setLog(data.log ?? [])
    setLogLaden(false)
  }, [])

  const laadTaak = useCallback(async (id: string) => {
    setLaden(true)
    const res = await fetch(`/api/admin/ftp-koppeling/${id}`)
    if (!res.ok) { setLaden(false); return }
    const data = await res.json() as { taak: Taak }
    const t = data.taak
    setTaak(t)
    setNaam(t.naam ?? '')
    setHost(t.ftp_host ?? '')
    setUser(t.ftp_user ?? '')
    setPort(String(t.ftp_port ?? 21))
    setPad(t.ftp_pad ?? '/')
    setActief(t.actief)
    setLaden(false)
  }, [])

  useEffect(() => {
    async function check() {
      const res = await fetch('/api/auth/session-info')
      const info = await res.json().catch(() => ({})) as { isAdmin?: boolean }
      if (!info.isAdmin) { setAllowed(false); return }
      setAllowed(true)
      void laadTaak(taakId)
      void laadLog(taakId)
    }
    void check()
  }, [taakId, laadTaak, laadLog])

  useEffect(() => {
    if (allowed === false) router.replace('/dashboard')
  }, [allowed, router])

  async function slaOp(e: React.FormEvent) {
    e.preventDefault()
    setOpslaan(true)
    setOpslaanMsg(null)
    const res = await fetch(`/api/admin/ftp-koppeling/${taakId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        naam: naam.trim(),
        ftp_host: host.trim(),
        ftp_user: user.trim(),
        ftp_password: password || undefined,
        ftp_port: parseInt(port) || 21,
        ftp_pad: pad.trim() || '/',
        actief,
      }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    setOpslaan(false)
    if (!res.ok) {
      setOpslaanMsg({ ok: false, tekst: data.error ?? 'Opslaan mislukt' })
    } else {
      setOpslaanMsg({ ok: true, tekst: 'Instellingen opgeslagen.' })
      setPassword('')
      void laadTaak(taakId)
    }
  }

  async function genereerGeheim() {
    setOpslaan(true)
    const res = await fetch(`/api/admin/ftp-koppeling/${taakId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genereer_secret: true }),
    })
    setOpslaan(false)
    if (res.ok) void laadTaak(taakId)
  }

  async function testVerbinding() {
    setTesten(true)
    setTestMsg(null)
    const res = await fetch(`/api/admin/ftp-koppeling/${taakId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    })
    const data = await res.json() as { ok?: boolean; bericht?: string; error?: string }
    setTesten(false)
    setTestMsg({ ok: data.ok ?? res.ok, tekst: data.bericht ?? data.error ?? 'Onbekend resultaat' })
  }

  if (allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: dashboardUi.pageBg, fontFamily: F, color: dashboardUi.textMuted }}>
        Laden…
      </div>
    )
  }
  if (!allowed) return null

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/freshdesk-ftp/${taakId}`
    : `/api/webhooks/freshdesk-ftp/${taakId}`

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none'
  const inputStyle = { border: '1px solid rgba(45,69,124,0.2)', fontFamily: F, color: '#1e293b', background: 'white' }
  const labelCls = 'block text-xs font-bold mb-1.5 uppercase tracking-wide'
  const labelStyle = { color: 'rgba(45,69,124,0.55)', fontFamily: F }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-4 sm:px-6 flex items-center gap-3 py-3 min-h-[52px]">
          <Link href="/dashboard/ftp-koppeling" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90 shrink-0">
            ← Overzicht
          </Link>
          <span className="text-white text-sm font-semibold">{laden ? 'Laden…' : naam || 'FTP Taak'}</span>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-5">

        {laden ? (
          <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Laden…</p>
        ) : (
          <>
            {/* Webhook info */}
            <div className="rounded-2xl p-5 space-y-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
              <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Freshdesk Observer instellen</h2>

              <div>
                <p className={labelCls} style={labelStyle}>Webhook URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-xl px-3 py-2 text-xs break-all" style={{ background: 'rgba(45,69,124,0.05)', color: '#1e293b', fontFamily: 'monospace' }}>
                    {webhookUrl}
                  </code>
                  <CopyButton value={webhookUrl} />
                </div>
              </div>

              <div>
                <p className={labelCls} style={labelStyle}>Webhook secret</p>
                {taak?.webhook_secret ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-xl px-3 py-2 text-xs break-all" style={{ background: 'rgba(45,69,124,0.05)', color: '#1e293b', fontFamily: 'monospace' }}>
                      {geheimTonen ? taak.webhook_secret : '••••••••••••••••••••••••••••••••'}
                    </code>
                    <button type="button" onClick={() => setGeheimTonen(v => !v)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(45,69,124,0.08)', color: DYNAMO_BLUE, fontFamily: F }}>
                      {geheimTonen ? 'Verberg' : 'Toon'}
                    </button>
                    {geheimTonen && <CopyButton value={taak.webhook_secret} />}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Nog geen secret.</p>
                )}
                <button type="button" onClick={() => void genereerGeheim()} disabled={opslaan} className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 disabled:opacity-50" style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}>
                  Nieuw secret genereren
                </button>
              </div>

              <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: 'rgba(45,69,124,0.04)', color: 'rgba(45,69,124,0.7)', fontFamily: F }}>
                <p className="font-bold m-0">Configureer in Freshdesk Observer:</p>
                <p className="m-0">1. Actie: <strong>Trigger webhook</strong> → POST naar bovenstaande URL</p>
                <p className="m-0">2. Voeg custom header toe: <code style={{ fontFamily: 'monospace' }}>X-Webhook-Secret: [secret]</code></p>
                <p className="m-0">3. Body (JSON): <code style={{ fontFamily: 'monospace' }}>{'{"ticket_id": "{{ticket.id}}"}'}</code></p>
              </div>
            </div>

            {/* FTP instellingen */}
            <form onSubmit={e => void slaOp(e)} className="rounded-2xl p-5 space-y-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>FTP-instellingen</h2>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setActief(v => !v)}
                    className="relative w-10 h-5 rounded-full transition-colors cursor-pointer"
                    style={{ background: actief ? DYNAMO_BLUE : 'rgba(45,69,124,0.2)' }}
                  >
                    <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: actief ? 'translateX(20px)' : 'none' }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: actief ? DYNAMO_BLUE : 'rgba(45,69,124,0.4)', fontFamily: F }}>
                    {actief ? 'Actief' : 'Inactief'}
                  </span>
                </label>
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>Naam taak</label>
                <input type="text" value={naam} onChange={e => setNaam(e.target.value)} placeholder="Bijv. Thule FTP" className={inputCls} style={inputStyle} required />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelCls} style={labelStyle}>FTP Host</label>
                  <input type="text" value={host} onChange={e => setHost(e.target.value)} placeholder="ftp2.biketotaal.com" className={inputCls} style={inputStyle} required />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Poort</label>
                  <input type="number" value={port} onChange={e => setPort(e.target.value)} placeholder="21" className={inputCls} style={inputStyle} min={1} max={65535} />
                </div>
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>Gebruikersnaam</label>
                <input type="text" value={user} onChange={e => setUser(e.target.value)} placeholder="ftpuser" className={inputCls} style={inputStyle} autoComplete="username" required />
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>
                  Wachtwoord {taak?.ftp_password_set && <span className="font-normal normal-case" style={{ color: '#15803d' }}>✓ ingesteld</span>}
                </label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={taak?.ftp_password_set ? 'Laat leeg om huidig wachtwoord te bewaren' : 'Wachtwoord'} className={inputCls} style={inputStyle} autoComplete="new-password" />
              </div>

              <div>
                <label className={labelCls} style={labelStyle}>Doelmap op FTP</label>
                <input type="text" value={pad} onChange={e => setPad(e.target.value)} placeholder="/uploads" className={inputCls} style={inputStyle} />
                <p className="text-xs mt-1" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>Map wordt aangemaakt als die niet bestaat.</p>
              </div>

              {opslaanMsg && (
                <div className="rounded-xl p-3 text-sm" style={{ background: opslaanMsg.ok ? '#f0fdf4' : '#fef2f2', color: opslaanMsg.ok ? '#15803d' : '#b91c1c', border: `1px solid ${opslaanMsg.ok ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
                  {opslaanMsg.tekst}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={opslaan} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                  {opslaan ? 'Opslaan…' : 'Opslaan'}
                </button>
                <button type="button" onClick={() => void testVerbinding()} disabled={testen || !taak?.ftp_password_set} className="rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50" style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F, background: 'white' }}>
                  {testen ? 'Testen…' : 'Test verbinding'}
                </button>
              </div>

              {testMsg && (
                <div className="rounded-xl p-3 text-sm" style={{ background: testMsg.ok ? '#f0fdf4' : '#fef2f2', color: testMsg.ok ? '#15803d' : '#b91c1c', border: `1px solid ${testMsg.ok ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
                  {testMsg.ok ? '✓ ' : '✗ '}{testMsg.tekst}
                </div>
              )}
            </form>

            {/* Activiteitenlog */}
            <div className="rounded-2xl p-5 space-y-3" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Recente activiteit</h2>
                <button type="button" onClick={() => void laadLog(taakId)} disabled={logLaden} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 disabled:opacity-50" style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}>
                  {logLaden ? 'Laden…' : '↻ Vernieuwen'}
                </button>
              </div>

              {logLaden && log.length === 0 ? (
                <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Laden…</p>
              ) : log.length === 0 ? (
                <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Nog geen activiteit geregistreerd.</p>
              ) : (
                <div className="space-y-2">
                  {log.map(entry => {
                    const statusKleur: Record<string, { bg: string; text: string }> = {
                      ok: { bg: '#f0fdf4', text: '#15803d' },
                      deels_ok: { bg: '#fffbeb', text: '#b45309' },
                      fout: { bg: '#fef2f2', text: '#b91c1c' },
                      auth_fout: { bg: '#fef2f2', text: '#b91c1c' },
                      geen_bijlagen: { bg: 'rgba(45,69,124,0.05)', text: 'rgba(45,69,124,0.6)' },
                    }
                    const kleur = statusKleur[entry.status] ?? { bg: 'rgba(45,69,124,0.05)', text: 'rgba(45,69,124,0.6)' }
                    const datum = new Date(entry.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={entry.id} className="rounded-xl p-3 text-xs space-y-1" style={{ background: kleur.bg, border: `1px solid ${kleur.text}22` }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold" style={{ color: kleur.text }}>{entry.status.replace('_', ' ')}</span>
                          {entry.ticket_id && <span style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>Ticket #{entry.ticket_id}</span>}
                          <span className="ml-auto" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>{datum}</span>
                        </div>
                        <p className="m-0" style={{ color: kleur.text, fontFamily: F }}>{entry.bericht}</p>
                        {entry.geupload && entry.geupload.length > 0 && (
                          <p className="m-0" style={{ color: '#15803d', fontFamily: F }}>Geüpload: {entry.geupload.join(', ')}</p>
                        )}
                        {entry.fouten && entry.fouten.length > 0 && (
                          <p className="m-0" style={{ color: '#b91c1c', fontFamily: F }}>Fouten: {entry.fouten.join(', ')}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
