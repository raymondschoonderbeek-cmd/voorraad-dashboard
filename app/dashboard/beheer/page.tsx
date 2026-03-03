'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

const DYNAMO_BLUE = '#0d1f4e'
const DYNAMO_GOLD = '#f0c040'
const F = "'Outfit', sans-serif"

type Rol = { id: number; user_id: string; rol: string; naam: string; created_at: string }
type WinkelToegang = { id: number; user_id: string; winkel_id: number }
type Winkel = { id: number; naam: string; dealer_nummer: string; postcode?: string; stad?: string; lat?: number; lng?: number; wilmar_organisation_id?: number; wilmar_branch_id?: number }
type Tab = 'gebruikers' | 'winkels' | 'import'

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
)

export default function BeheerPage() {
  const [tab, setTab] = useState<Tab>('gebruikers')
  const [rollen, setRollen] = useState<Rol[]>([])
  const [winkelToegang, setWinkelToegang] = useState<WinkelToegang[]>([])
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toonForm, setToonForm] = useState(false)
  const [bewerkGebruiker, setBewerkGebruiker] = useState<Rol | null>(null)
  const [bewerkWinkel, setBewerkWinkel] = useState<Winkel | null>(null)
  const [toonWinkelForm, setToonWinkelForm] = useState(false)
  const [winkelLoading, setWinkelLoading] = useState(false)

  // Nieuw gebruiker
  const [nieuwEmail, setNieuwEmail] = useState('')
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [nieuwRol, setNieuwRol] = useState('viewer')
  const [geselecteerdeWinkels, setGeselecteerdeWinkels] = useState<number[]>([])
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // Nieuw winkel form
  const [nieuwWinkelNaam, setNieuwWinkelNaam] = useState('')
  const [nieuwWinkelDealer, setNieuwWinkelDealer] = useState('')
  const [nieuwWinkelPostcode, setNieuwWinkelPostcode] = useState('')
  const [nieuwWinkelStad, setNieuwWinkelStad] = useState('')

  // Wilmar
  const [wilmarStores, setWilmarStores] = useState<any[]>([])
  const [wilmarStoresLoading, setWilmarStoresLoading] = useState(false)

  // Excel import
  const [importData, setImportData] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const haalGebruikersOp = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/gebruikers')
    if (res.status === 403) {
      setError('Geen toegang. Alleen admins.')
      setLoading(false)
      return
    }
    const data = await res.json()
    setRollen(data.rollen ?? [])
    setWinkelToegang(data.winkelToegang ?? [])
    setWinkels(data.winkels ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { haalGebruikersOp() }, [haalGebruikersOp])

  async function haalWilmarStoresOp() {
    setWilmarStoresLoading(true)
    try {
      const res = await fetch('/api/wilmar?action=stores')
      const data = await res.json()
      setWilmarStores(Array.isArray(data) ? data : [])
    } catch {
      setWilmarStores([])
    }
    setWilmarStoresLoading(false)
  }

  async function voegGebruikerToe(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true); setFormError(''); setFormSuccess('')
    const res = await fetch('/api/gebruikers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: nieuwEmail, naam: nieuwNaam, rol: nieuwRol, winkel_ids: geselecteerdeWinkels }),
    })
    const data = await res.json()
    setFormLoading(false)
    if (!res.ok) { setFormError(data.error ?? 'Er ging iets mis') }
    else {
      setFormSuccess(`Uitnodiging verstuurd naar ${nieuwEmail}!`)
      setNieuwEmail(''); setNieuwNaam(''); setNieuwRol('viewer'); setGeselecteerdeWinkels([])
      setToonForm(false)
      await haalGebruikersOp()
    }
  }

  async function updateGebruiker(e: React.FormEvent) {
    e.preventDefault()
    if (!bewerkGebruiker) return
    setFormLoading(true)
    const res = await fetch('/api/gebruikers/rollen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: bewerkGebruiker.user_id, rol: bewerkGebruiker.rol, naam: bewerkGebruiker.naam, winkel_ids: geselecteerdeWinkels }),
    })
    setFormLoading(false)
    if (res.ok) { setBewerkGebruiker(null); setGeselecteerdeWinkels([]); await haalGebruikersOp() }
  }

  async function verwijderGebruiker(userId: string, naam: string) {
    if (!confirm(`Gebruiker "${naam}" verwijderen?`)) return
    await fetch(`/api/gebruikers?user_id=${userId}`, { method: 'DELETE' })
    await haalGebruikersOp()
  }

  async function voegWinkelToe(e: React.FormEvent) {
    e.preventDefault()
    setWinkelLoading(true)
    await fetch('/api/winkels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam: nieuwWinkelNaam, dealer_nummer: nieuwWinkelDealer, postcode: nieuwWinkelPostcode, stad: nieuwWinkelStad }),
    })
    setNieuwWinkelNaam(''); setNieuwWinkelDealer(''); setNieuwWinkelPostcode(''); setNieuwWinkelStad('')
    setToonWinkelForm(false); setWinkelLoading(false)
    await haalGebruikersOp()
  }

  async function slaWinkelOp(e: React.FormEvent) {
    e.preventDefault()
    if (!bewerkWinkel) return
    setWinkelLoading(true)
    await fetch('/api/winkels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bewerkWinkel.id,
        naam: bewerkWinkel.naam,
        dealer_nummer: bewerkWinkel.dealer_nummer,
        postcode: bewerkWinkel.postcode,
        stad: bewerkWinkel.stad,
     wilmar_organisation_id: bewerkWinkel.wilmar_organisation_id ?? null,
  wilmar_branch_id: bewerkWinkel.wilmar_branch_id ?? null,
      }),
    })
    setWinkelLoading(false); setBewerkWinkel(null)
    await haalGebruikersOp()
  }

  async function verwijderWinkel(id: number, naam: string) {
    if (!confirm(`Winkel "${naam}" verwijderen?`)) return
    await fetch(`/api/winkels?id=${id}`, { method: 'DELETE' })
    await haalGebruikersOp()
  }

  function toggleWinkel(id: number) {
    setGeselecteerdeWinkels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function startBewerken(rol: Rol) {
    setBewerkGebruiker(rol); setToonForm(false)
    setGeselecteerdeWinkels(winkelToegang.filter(wt => wt.user_id === rol.user_id).map(wt => wt.winkel_id))
  }

  function winkelNamenVoorGebruiker(userId: string) {
    const ids = winkelToegang.filter(wt => wt.user_id === userId).map(wt => wt.winkel_id)
    if (ids.length === 0) return 'Alle winkels'
    return winkels.filter(w => ids.includes(w.id)).map(w => w.naam).join(', ')
  }

  async function verwerkExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(''); setImportSuccess(''); setImportData([])
    try {
      const XLSX = await import('xlsx' as any)
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      const parsed = rows.map(r => ({
        naam: String(r.naam || r.Naam || r.NAAM || '').trim(),
        dealer_nummer: String(r.dealer_nummer || r['Dealer nummer'] || r.DEALER_NUMMER || '').trim(),
        postcode: String(r.postcode || r.Postcode || r.POSTCODE || '').trim(),
        stad: String(r.stad || r.Stad || r.STAD || '').trim(),
      })).filter(r => r.naam && r.dealer_nummer)
      setImportData(parsed)
    } catch {
      setImportError('Kon het bestand niet lezen. Zorg dat het een geldig .xlsx bestand is.')
    }
  }

  async function importeerWinkels() {
    if (importData.length === 0) return
    setImportLoading(true); setImportError(''); setImportSuccess('')
    let succes = 0
    for (const winkel of importData) {
      const res = await fetch('/api/winkels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(winkel),
      })
      if (res.ok) succes++
    }
    setImportLoading(false)
    setImportSuccess(`${succes} van ${importData.length} winkels succesvol geïmporteerd!`)
    setImportData([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    await haalGebruikersOp()
  }

  const inputStyle = { background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
  const inputClass = "w-full rounded-xl px-3 py-2 text-sm placeholder:text-gray-400"

  const tabs: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: 'gebruikers', label: 'Gebruikers', icon: '👤', count: rollen.length },
    { key: 'winkels', label: 'Winkels', icon: '🏪', count: winkels.length },
    { key: 'import', label: 'Excel Import', icon: '📊' },
  ]

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb', fontFamily: F }}>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      {/* Navigatie */}
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-30">
        <div className="px-5 flex items-stretch" style={{ minHeight: '56px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3 pr-6" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black" style={{ background: DYNAMO_GOLD }}>
              <span style={{ color: DYNAMO_BLUE, fontFamily: F, fontWeight: 800, fontSize: '15px' }}>D</span>
            </div>
            <div>
              <div className="font-bold text-sm text-white leading-tight" style={{ letterSpacing: '0.06em', fontFamily: F }}>DYNAMO</div>
              <div className="text-xs font-semibold leading-tight" style={{ color: DYNAMO_GOLD, letterSpacing: '0.12em', fontFamily: F }}>RETAIL GROUP</div>
            </div>
          </div>
          <div className="flex items-center px-5">
            <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: F }}>Beheer</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3 pl-5">
            <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }}>
              <IconArrowLeft /> Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 p-5 max-w-5xl mx-auto w-full space-y-5">

        {/* Hero */}
        <div className="relative rounded-2xl overflow-hidden" style={{ background: DYNAMO_BLUE, minHeight: 120 }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(240,192,64,0.1) 0%, transparent 60%)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: DYNAMO_GOLD }} />
          <div className="relative p-7 flex items-center justify-between gap-6">
            <div>
              <h1 style={{ fontFamily: F, color: 'white', fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>Beheer</h1>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', marginTop: '4px', fontFamily: F }}>
                Beheer gebruikers, winkels en importeer data via Excel
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center px-4">
                <div style={{ color: DYNAMO_GOLD, fontSize: '22px', fontWeight: 700, fontFamily: F, lineHeight: 1 }}>{rollen.length}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: F, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Gebruikers</div>
              </div>
              <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)' }} />
              <div className="text-center px-4">
                <div style={{ color: 'white', fontSize: '22px', fontWeight: 700, fontFamily: F, lineHeight: 1 }}>{winkels.length}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: F, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winkels</div>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="rounded-2xl p-4 text-sm font-medium" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontFamily: F }}>{error}</div>}
        {formSuccess && <div className="rounded-2xl p-4 text-sm font-medium" style={{ background: '#f0fdf4', border: '1px solid rgba(22,163,74,0.2)', color: '#16a34a', fontFamily: F }}>✓ {formSuccess}</div>}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setToonForm(false); setBewerkGebruiker(null); setToonWinkelForm(false); setBewerkWinkel(null) }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all"
              style={tab === t.key ? { background: DYNAMO_BLUE, color: 'white', fontFamily: F } : { color: 'rgba(13,31,78,0.5)', fontFamily: F }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span className="rounded-full px-1.5 py-0.5 text-xs font-bold" style={tab === t.key ? { background: 'rgba(255,255,255,0.15)', color: 'white' } : { background: 'rgba(13,31,78,0.07)', color: 'rgba(13,31,78,0.5)' }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TAB: GEBRUIKERS ── */}
        {tab === 'gebruikers' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => { setToonForm(v => !v); setBewerkGebruiker(null); setGeselecteerdeWinkels([]) }} className="rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 flex items-center gap-2" style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: F }}>
                + Gebruiker uitnodigen
              </button>
            </div>

            {toonForm && (
              <div className="rounded-2xl p-5 space-y-4" style={{ background: 'white', border: `2px solid ${DYNAMO_GOLD}`, boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <h2 className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Nieuwe gebruiker uitnodigen</h2>
                <form onSubmit={voegGebruikerToe} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>E-mailadres *</label>
                      <input type="email" placeholder="naam@bedrijf.nl" value={nieuwEmail} onChange={e => setNieuwEmail(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Naam</label>
                      <input type="text" placeholder="Volledige naam" value={nieuwNaam} onChange={e => setNieuwNaam(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Rol</label>
                    <div className="flex gap-3">
                      {[{ value: 'viewer', label: 'Viewer', info: 'Kan voorraad bekijken' }, { value: 'admin', label: 'Admin', info: 'Volledige toegang' }].map(r => (
                        <label key={r.value} className="flex-1 cursor-pointer">
                          <input type="radio" name="rol" value={r.value} checked={nieuwRol === r.value} onChange={() => setNieuwRol(r.value)} className="sr-only" />
                          <div className="rounded-xl border-2 p-3 transition" style={nieuwRol === r.value ? { borderColor: DYNAMO_BLUE, background: 'rgba(13,31,78,0.04)' } : { borderColor: 'rgba(13,31,78,0.1)' }}>
                            <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.label}</div>
                            <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.45)', fontFamily: F }}>{r.info}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Winkeltoegang <span style={{ fontWeight: 400, opacity: 0.6 }}>(leeg = alle winkels)</span></label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {winkels.map(w => (
                        <label key={w.id} className="flex items-center gap-2 cursor-pointer rounded-xl border p-2.5 transition" style={geselecteerdeWinkels.includes(w.id) ? { borderColor: DYNAMO_BLUE, background: 'rgba(13,31,78,0.04)' } : { borderColor: 'rgba(13,31,78,0.1)' }}>
                          <input type="checkbox" checked={geselecteerdeWinkels.includes(w.id)} onChange={() => toggleWinkel(w.id)} className="accent-blue-600" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{w.naam}</div>
                            <div className="text-xs" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>#{w.dealer_nummer}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  {formError && <p className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{formError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={formLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                      {formLoading ? 'Versturen...' : 'Uitnodiging versturen'}
                    </button>
                    <button type="button" onClick={() => setToonForm(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70 transition" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            {bewerkGebruiker && (
              <div className="rounded-2xl p-5 space-y-4" style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <h2 className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>✏️ {bewerkGebruiker.naam} bewerken</h2>
                <form onSubmit={updateGebruiker} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Naam</label>
                      <input type="text" value={bewerkGebruiker.naam} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, naam: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Rol</label>
                      <select value={bewerkGebruiker.rol} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, rol: e.target.value })} className={inputClass} style={inputStyle}>
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Winkeltoegang</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {winkels.map(w => (
                        <label key={w.id} className="flex items-center gap-2 cursor-pointer rounded-xl border p-2.5 transition" style={geselecteerdeWinkels.includes(w.id) ? { borderColor: DYNAMO_BLUE, background: 'rgba(13,31,78,0.04)' } : { borderColor: 'rgba(13,31,78,0.1)' }}>
                          <input type="checkbox" checked={geselecteerdeWinkels.includes(w.id)} onChange={() => toggleWinkel(w.id)} className="accent-blue-600" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{w.naam}</div>
                            <div className="text-xs" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>#{w.dealer_nummer}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={formLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{formLoading ? 'Opslaan...' : 'Opslaan'}</button>
                    <button type="button" onClick={() => { setBewerkGebruiker(null); setGeselecteerdeWinkels([]) }} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70 transition" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <div className="p-4" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Gebruikersoverzicht</div>
                <div className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{rollen.length} gebruikers</div>
              </div>
              {loading ? (
                <div className="p-10 text-center">
                  <div className="w-7 h-7 border-2 border-gray-200 rounded-full animate-spin mx-auto mb-2" style={{ borderTopColor: DYNAMO_BLUE }} />
                </div>
              ) : rollen.length === 0 ? (
                <div className="p-10 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Nog geen gebruikers</div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgba(13,31,78,0.06)' }}>
                  {rollen.map(rol => (
                    <div key={rol.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-gray-50/50">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                        {(rol.naam || 'G').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{rol.naam || '(Geen naam)'}</span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={rol.rol === 'admin' ? { background: 'rgba(240,192,64,0.15)', color: '#92660a' } : { background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.6)' }}>
                            {rol.rol === 'admin' ? '👑 Admin' : '👁 Viewer'}
                          </span>
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{winkelNamenVoorGebruiker(rol.user_id)}</div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => startBewerken(rol)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(13,31,78,0.05)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Bewerken</button>
                        <button onClick={() => verwijderGebruiker(rol.user_id, rol.naam)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)', fontFamily: F }}>Verwijderen</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: WINKELS ── */}
        {tab === 'winkels' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => { setToonWinkelForm(v => !v); setBewerkWinkel(null) }} className="rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 flex items-center gap-2" style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: F }}>
                + Winkel toevoegen
              </button>
            </div>

            {toonWinkelForm && (
              <div className="rounded-2xl p-5" style={{ background: 'white', border: `2px solid ${DYNAMO_GOLD}`, boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <h2 className="text-sm font-bold mb-4" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Nieuwe winkel</h2>
                <form onSubmit={voegWinkelToe} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Naam *</label>
                      <input placeholder="Winkel naam" value={nieuwWinkelNaam} onChange={e => setNieuwWinkelNaam(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Dealer nummer *</label>
                      <input placeholder="bijv. 12345" value={nieuwWinkelDealer} onChange={e => setNieuwWinkelDealer(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Postcode</label>
                      <input placeholder="bijv. 1234AB" value={nieuwWinkelPostcode} onChange={e => setNieuwWinkelPostcode(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Stad</label>
                      <input placeholder="bijv. Amsterdam" value={nieuwWinkelStad} onChange={e => setNieuwWinkelStad(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={winkelLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{winkelLoading ? 'Bezig...' : 'Toevoegen'}</button>
                    <button type="button" onClick={() => setToonWinkelForm(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            {bewerkWinkel && (
              <div className="rounded-2xl p-5" style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <h2 className="text-sm font-bold mb-4" style={{ color: DYNAMO_BLUE, fontFamily: F }}>✏️ {bewerkWinkel.naam} bewerken</h2>
                <form onSubmit={slaWinkelOp} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Naam *</label>
                      <input value={bewerkWinkel.naam} onChange={e => setBewerkWinkel({ ...bewerkWinkel, naam: e.target.value })} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Dealer nummer *</label>
                      <input value={bewerkWinkel.dealer_nummer} onChange={e => setBewerkWinkel({ ...bewerkWinkel, dealer_nummer: e.target.value })} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Postcode</label>
                      <input value={bewerkWinkel.postcode ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, postcode: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Stad</label>
                      <input value={bewerkWinkel.stad ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, stad: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                  </div>

                  {/* Wilmar koppeling */}
                  <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.08)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>🔗 Wilmar koppeling</p>
                      <button type="button" onClick={haalWilmarStoresOp} disabled={wilmarStoresLoading} className="text-xs px-2 py-1 rounded-lg transition hover:opacity-70" style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: F }}>
                        {wilmarStoresLoading ? 'Laden...' : 'Laad Wilmar winkels'}
                      </button>
                    </div>
                    {bewerkWinkel.wilmar_branch_id && wilmarStores.length === 0 && (
                      <p className="text-xs" style={{ color: '#16a34a', fontFamily: F }}>✓ Gekoppeld (branch: {bewerkWinkel.wilmar_branch_id}) — klik op laden om te wijzigen</p>
                    )}
                    {wilmarStores.length > 0 && (
  <div>
    <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Koppel aan Wilmar winkel</label>
    <select
      value={String(bewerkWinkel?.wilmar_branch_id ?? '')}
      onChange={e => {
        const val = e.target.value
        setBewerkWinkel(prev => {
          if (!prev) return prev
          if (!val) return { ...prev, wilmar_branch_id: undefined, wilmar_organisation_id: undefined }
          const store = wilmarStores.find(s => String(s.branchId) === val)
          if (!store) return prev
          return { ...prev, wilmar_branch_id: store.branchId, wilmar_organisation_id: store.organisationId }
        })
      }}
      className={inputClass}
      style={inputStyle}
    >
      <option value="">— Niet gekoppeld —</option>
      {wilmarStores.map(s => (
        <option key={s.branchId} value={String(s.branchId)}>
          {s.name} {s.city ? `(${s.city})` : ''}
        </option>
      ))}
    </select>
    {bewerkWinkel?.wilmar_branch_id && (
      <p className="text-xs mt-1" style={{ color: '#16a34a', fontFamily: F }}>
        ✓ Gekoppeld: org {bewerkWinkel.wilmar_organisation_id}, branch {bewerkWinkel.wilmar_branch_id}
      </p>
    )}
  </div>
)}
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={winkelLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{winkelLoading ? 'Opslaan...' : 'Opslaan'}</button>
                    <button type="button" onClick={() => setBewerkWinkel(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <div className="p-4" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Winkeloverzicht</div>
                <div className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{winkels.length} winkels</div>
              </div>
              {winkels.length === 0 ? (
                <div className="p-10 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Nog geen winkels</div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgba(13,31,78,0.06)' }}>
                  {winkels.map((w, i) => (
                    <div key={w.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-gray-50/50">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#65a30d','#db2777'][i % 8] }}>
                        {w.naam.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{w.naam}</span>
                          {w.wilmar_branch_id && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', fontFamily: F }}>🔗 Wilmar</span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>
                          #{w.dealer_nummer}{w.stad ? ` · ${w.stad}` : ''}{w.postcode ? ` · ${w.postcode}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { setBewerkWinkel(w); setToonWinkelForm(false) }} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(13,31,78,0.05)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Bewerken</button>
                        <button onClick={() => verwijderWinkel(w.id, w.naam)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)', fontFamily: F }}>Verwijderen</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: EXCEL IMPORT ── */}
        {tab === 'import' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <h2 className="text-sm font-bold mb-1" style={{ color: DYNAMO_BLUE, fontFamily: F, borderTop: `3px solid ${DYNAMO_GOLD}`, paddingTop: '12px', marginTop: '-4px' }}>📊 Winkels importeren via Excel</h2>
              <p className="text-xs mb-5" style={{ color: 'rgba(13,31,78,0.5)', fontFamily: F }}>Upload een .xlsx bestand met kolommen: <strong>naam</strong>, <strong>dealer_nummer</strong>, <strong>postcode</strong>, <strong>stad</strong></p>

              <div className="rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition hover:opacity-80" style={{ borderColor: 'rgba(13,31,78,0.15)', background: 'rgba(13,31,78,0.02)' }} onClick={() => fileInputRef.current?.click()}>
                <div className="text-3xl mb-2">📂</div>
                <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Klik om een Excel bestand te kiezen</div>
                <div className="text-xs mt-1" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Ondersteund: .xlsx, .xls</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={verwerkExcel} />
              </div>

              {importError && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#dc2626', fontFamily: F }}>{importError}</div>}
              {importSuccess && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#f0fdf4', color: '#16a34a', fontFamily: F }}>✓ {importSuccess}</div>}

              {importData.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{importData.length} winkels gevonden</span>
                    <button onClick={() => { setImportData([]); if (fileInputRef.current) fileInputRef.current.value = '' }} className="text-xs hover:opacity-70" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Wissen</button>
                  </div>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(13,31,78,0.08)' }}>
                    <table className="w-full text-xs">
                      <thead style={{ background: DYNAMO_BLUE }}>
                        <tr>{['Naam', 'Dealer #', 'Postcode', 'Stad'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: F }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {importData.slice(0, 10).map((r, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'rgba(13,31,78,0.02)', borderBottom: '1px solid rgba(13,31,78,0.05)' }}>
                            <td className="px-3 py-2 font-medium" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.naam}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.dealer_nummer}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.postcode || '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.stad || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importData.length > 10 && <div className="px-3 py-2 text-xs text-center" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>+ {importData.length - 10} meer rijen</div>}
                  </div>
                  <button onClick={importeerWinkels} disabled={importLoading} className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 transition hover:opacity-90" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                    {importLoading ? 'Importeren...' : `${importData.length} winkels importeren`}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <h3 className="text-xs font-bold uppercase mb-3" style={{ color: 'rgba(13,31,78,0.4)', letterSpacing: '0.1em', fontFamily: F }}>Verwacht formaat</h3>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(13,31,78,0.08)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: DYNAMO_BLUE }}>
                    <tr>{['naam', 'dealer_nummer', 'postcode', 'stad'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: DYNAMO_GOLD, fontFamily: F }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {[['Dynamo Amsterdam','10001','1012AB','Amsterdam'],['Dynamo Rotterdam','10002','3011AD','Rotterdam'],['Dynamo Utrecht','10003','3511EP','Utrecht']].map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'rgba(13,31,78,0.02)', borderBottom: '1px solid rgba(13,31,78,0.05)' }}>
                        {r.map((c, j) => <td key={j} className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.7)', fontFamily: F }}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}