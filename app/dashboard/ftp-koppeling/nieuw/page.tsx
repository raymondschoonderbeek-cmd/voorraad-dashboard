'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'

const F = FONT_FAMILY

export default function NieuweFtpTaakPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  const [naam, setNaam] = useState('')
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [port, setPort] = useState('21')
  const [pad, setPad] = useState('/')
  const [actief, setActief] = useState(true)

  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    async function check() {
      const res = await fetch('/api/auth/session-info')
      const info = await res.json().catch(() => ({})) as { isAdmin?: boolean }
      if (!info.isAdmin) { setAllowed(false); return }
      setAllowed(true)
    }
    void check()
  }, [])

  useEffect(() => {
    if (allowed === false) router.replace('/dashboard')
  }, [allowed, router])

  async function maakAan(e: React.FormEvent) {
    e.preventDefault()
    setOpslaan(true)
    setFout(null)
    const res = await fetch('/api/admin/ftp-koppeling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        naam: naam.trim(),
        ftp_host: host.trim() || undefined,
        ftp_user: user.trim() || undefined,
        ftp_password: password || undefined,
        ftp_port: parseInt(port) || 21,
        ftp_pad: pad.trim() || '/',
        actief,
      }),
    })
    const data = await res.json() as { ok?: boolean; id?: number; error?: string }
    setOpslaan(false)
    if (!res.ok || !data.id) {
      setFout(data.error ?? 'Aanmaken mislukt')
    } else {
      router.push(`/dashboard/ftp-koppeling/${data.id}`)
    }
  }

  if (allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: dashboardUi.pageBg, fontFamily: F, color: dashboardUi.textMuted }}>
        Laden…
      </div>
    )
  }
  if (!allowed) return null

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
          <span className="text-white text-sm font-semibold">Nieuwe FTP-taak</span>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full">
        <form onSubmit={e => void maakAan(e)} className="rounded-2xl p-5 space-y-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE }}>Nieuwe taak aanmaken</h2>
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
              <input type="text" value={host} onChange={e => setHost(e.target.value)} placeholder="ftp2.biketotaal.com" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Poort</label>
              <input type="number" value={port} onChange={e => setPort(e.target.value)} placeholder="21" className={inputCls} style={inputStyle} min={1} max={65535} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Gebruikersnaam</label>
            <input type="text" value={user} onChange={e => setUser(e.target.value)} placeholder="ftpuser" className={inputCls} style={inputStyle} autoComplete="username" />
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Wachtwoord</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Wachtwoord" className={inputCls} style={inputStyle} autoComplete="new-password" />
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Doelmap op FTP</label>
            <input type="text" value={pad} onChange={e => setPad(e.target.value)} placeholder="/uploads" className={inputCls} style={inputStyle} />
            <p className="text-xs mt-1" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>Map wordt aangemaakt als die niet bestaat.</p>
          </div>

          {fout && (
            <div className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid rgba(220,38,38,0.2)' }}>
              {fout}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={opslaan || !naam.trim()} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
              {opslaan ? 'Aanmaken…' : 'Taak aanmaken'}
            </button>
            <Link href="/dashboard/ftp-koppeling" className="rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-90" style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}>
              Annuleren
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}
