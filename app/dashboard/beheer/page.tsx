'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const DYNAMO_BLUE = '#0d1f4e'
const DYNAMO_GOLD = '#f0c040'

type Rol = { id: number; user_id: string; rol: string; naam: string; created_at: string }
type WinkelToegang = { id: number; user_id: string; winkel_id: number }
type Winkel = { id: number; naam: string; dealer_nummer: string }

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
)

const IconUser = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)

export default function BeheerPage() {
  const [rollen, setRollen] = useState<Rol[]>([])
  const [winkelToegang, setWinkelToegang] = useState<WinkelToegang[]>([])
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toonForm, setToonForm] = useState(false)
  const [bewerkGebruiker, setBewerkGebruiker] = useState<Rol | null>(null)

  // Nieuw gebruiker form
  const [nieuwEmail, setNieuwEmail] = useState('')
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [nieuwRol, setNieuwRol] = useState('viewer')
  const [geselecteerdeWinkels, setGeselecteerdeWinkels] = useState<number[]>([])
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const haalGebruikersOp = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/gebruikers')
    if (res.status === 403) {
      setError('Je hebt geen toegang tot deze pagina. Alleen admins kunnen gebruikers beheren.')
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

  async function voegGebruikerToe(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)
    setFormError('')
    setFormSuccess('')

    const res = await fetch('/api/gebruikers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: nieuwEmail,
        naam: nieuwNaam,
        rol: nieuwRol,
        winkel_ids: geselecteerdeWinkels,
      }),
    })

    const data = await res.json()
    setFormLoading(false)

    if (!res.ok) {
      setFormError(data.error ?? 'Er ging iets mis')
    } else {
      setFormSuccess(`Uitnodiging verstuurd naar ${nieuwEmail}!`)
      setNieuwEmail('')
      setNieuwNaam('')
      setNieuwRol('viewer')
      setGeselecteerdeWinkels([])
      setToonForm(false)
      await haalGebruikersOp()
    }
  }

  async function updateGebruiker(e: React.FormEvent) {
    e.preventDefault()
    if (!bewerkGebruiker) return
    setFormLoading(true)
    setFormError('')

    const res = await fetch('/api/gebruikers/rollen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: bewerkGebruiker.user_id,
        rol: bewerkGebruiker.rol,
        naam: bewerkGebruiker.naam,
        winkel_ids: geselecteerdeWinkels,
      }),
    })

    setFormLoading(false)
    if (res.ok) {
      setBewerkGebruiker(null)
      setGeselecteerdeWinkels([])
      await haalGebruikersOp()
    }
  }

  async function verwijderGebruiker(userId: string, naam: string) {
    if (!confirm(`Gebruiker "${naam}" verwijderen?`)) return
    await fetch(`/api/gebruikers?user_id=${userId}`, { method: 'DELETE' })
    await haalGebruikersOp()
  }

  function toggleWinkel(id: number) {
    setGeselecteerdeWinkels(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function startBewerken(rol: Rol) {
    setBewerkGebruiker(rol)
    setToonForm(false)
    const huidigeWinkels = winkelToegang
      .filter(wt => wt.user_id === rol.user_id)
      .map(wt => wt.winkel_id)
    setGeselecteerdeWinkels(huidigeWinkels)
  }

  function winkelNamenVoorGebruiker(userId: string) {
    const ids = winkelToegang.filter(wt => wt.user_id === userId).map(wt => wt.winkel_id)
    if (ids.length === 0) return 'Alle winkels'
    return winkels.filter(w => ids.includes(w.id)).map(w => w.naam).join(', ')
  }

  const inputClass = "w-full rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb' }}>

      {/* Navigatie */}
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-30 shadow-lg">
        <div className="px-5 flex items-stretch gap-0 min-h-[56px]">
          <div className="flex items-center gap-3 pr-6 border-r border-white/10">
            <div style={{ background: DYNAMO_GOLD }} className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-base">
              <span style={{ color: DYNAMO_BLUE }}>D</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight tracking-wide">DYNAMO</div>
              <div style={{ color: DYNAMO_GOLD }} className="text-xs font-semibold tracking-widest leading-tight">RETAIL GROUP</div>
            </div>
          </div>

          <div className="flex items-center px-5">
            <span className="text-white/80 text-sm font-semibold">Gebruikersbeheer</span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-3 pl-5">
            <Link href="/dashboard" className="rounded-lg px-4 py-2 text-sm font-bold border border-white/20 text-white hover:bg-white/10 transition flex items-center gap-2">
              <IconArrowLeft /> Dashboard
            </Link>
          </div>
        </div>
        <div style={{ background: DYNAMO_GOLD, height: '3px' }} />
      </header>

      <main className="flex-1 p-5 max-w-5xl mx-auto w-full space-y-5">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black" style={{ color: DYNAMO_BLUE }}>Gebruikersbeheer</h1>
            <p className="text-sm text-gray-500 mt-1">Beheer wie toegang heeft tot het dashboard en welke winkels zij kunnen zien.</p>
          </div>
          <button
            onClick={() => { setToonForm(v => !v); setBewerkGebruiker(null); setGeselecteerdeWinkels([]) }}
            className="rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 flex items-center gap-2 shrink-0"
            style={{ background: DYNAMO_BLUE, color: 'white' }}
          >
            + Gebruiker uitnodigen
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800 font-medium">{error}</div>
        )}

        {formSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-800 font-medium">✓ {formSuccess}</div>
        )}

        {/* Uitnodigingsform */}
        {toonForm && (
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-6" style={{ borderColor: DYNAMO_GOLD }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: DYNAMO_BLUE }}>Nieuwe gebruiker uitnodigen</h2>
            <form onSubmit={voegGebruikerToe} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">E-mailadres *</label>
                  <input type="email" placeholder="naam@bedrijf.nl" value={nieuwEmail} onChange={e => setNieuwEmail(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Naam</label>
                  <input type="text" placeholder="Volledige naam" value={nieuwNaam} onChange={e => setNieuwNaam(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Rol</label>
                <div className="flex gap-3">
                  {[
                    { value: 'viewer', label: 'Viewer', omschrijving: 'Kan voorraad bekijken' },
                    { value: 'admin', label: 'Admin', omschrijving: 'Volledige toegang + beheer' },
                  ].map(r => (
                    <label key={r.value} className="flex-1 cursor-pointer">
                      <input type="radio" name="rol" value={r.value} checked={nieuwRol === r.value} onChange={() => setNieuwRol(r.value)} className="sr-only" />
                      <div className="rounded-xl border-2 p-3 transition" style={nieuwRol === r.value ? { borderColor: DYNAMO_BLUE, background: '#eef2ff' } : { borderColor: '#e5e7eb' }}>
                        <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE }}>{r.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{r.omschrijving}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-2 block">
                  Winkeltoegang <span className="text-gray-400 font-normal">(leeg = alle winkels)</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {winkels.map(w => (
                    <label key={w.id} className="flex items-center gap-2 cursor-pointer rounded-lg border p-2.5 transition hover:bg-gray-50" style={geselecteerdeWinkels.includes(w.id) ? { borderColor: DYNAMO_BLUE, background: '#eef2ff' } : { borderColor: '#e5e7eb' }}>
                      <input type="checkbox" checked={geselecteerdeWinkels.includes(w.id)} onChange={() => toggleWinkel(w.id)} className="accent-blue-600" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: DYNAMO_BLUE }}>{w.naam}</div>
                        <div className="text-xs text-gray-400">#{w.dealer_nummer}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={formLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition hover:opacity-90" style={{ background: DYNAMO_BLUE }}>
                  {formLoading ? 'Uitnodiging versturen...' : 'Uitnodiging versturen'}
                </button>
                <button type="button" onClick={() => setToonForm(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                  Annuleren
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Bewerk gebruiker */}
        {bewerkGebruiker && (
          <div className="bg-white rounded-2xl border-2 shadow-sm p-6" style={{ borderColor: DYNAMO_BLUE }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: DYNAMO_BLUE }}>Gebruiker bewerken — {bewerkGebruiker.naam}</h2>
            <form onSubmit={updateGebruiker} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Naam</label>
                  <input type="text" value={bewerkGebruiker.naam} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, naam: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Rol</label>
                  <select value={bewerkGebruiker.rol} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, rol: e.target.value })} className={inputClass}>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-2 block">
                  Winkeltoegang <span className="text-gray-400 font-normal">(leeg = alle winkels)</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {winkels.map(w => (
                    <label key={w.id} className="flex items-center gap-2 cursor-pointer rounded-lg border p-2.5 transition hover:bg-gray-50" style={geselecteerdeWinkels.includes(w.id) ? { borderColor: DYNAMO_BLUE, background: '#eef2ff' } : { borderColor: '#e5e7eb' }}>
                      <input type="checkbox" checked={geselecteerdeWinkels.includes(w.id)} onChange={() => toggleWinkel(w.id)} className="accent-blue-600" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: DYNAMO_BLUE }}>{w.naam}</div>
                        <div className="text-xs text-gray-400">#{w.dealer_nummer}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={formLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE }}>
                  {formLoading ? 'Opslaan...' : 'Opslaan'}
                </button>
                <button type="button" onClick={() => { setBewerkGebruiker(null); setGeselecteerdeWinkels([]) }} className="rounded-xl px-4 py-2.5 text-sm font-semibold border border-gray-300 hover:bg-gray-50">
                  Annuleren
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Gebruikerslijst */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between" style={{ borderTop: `3px solid ${DYNAMO_BLUE}` }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: DYNAMO_BLUE }}>Gebruikers</h2>
              <p className="text-xs text-gray-500">{rollen.length} gebruikers</p>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">
              <div className="w-8 h-8 border-4 border-gray-200 rounded-full animate-spin mx-auto mb-2" style={{ borderTopColor: DYNAMO_BLUE }} />
              Laden...
            </div>
          ) : rollen.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <div className="flex justify-center mb-2 opacity-30"><IconUser /></div>
              <p className="text-sm">Nog geen gebruikers. Nodig iemand uit!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rollen.map(rol => (
                <div key={rol.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: DYNAMO_BLUE }}>
                    {(rol.naam || 'G').charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{rol.naam || '(Geen naam)'}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rol.rol === 'admin' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-50 text-blue-700'}`}>
                        {rol.rol === 'admin' ? '👑 Admin' : '👁 Viewer'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      {winkelNamenVoorGebruiker(rol.user_id)}
                    </div>
                  </div>

                  {/* Acties */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startBewerken(rol)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50 transition"
                    >
                      Bewerken
                    </button>
                    <button
                      onClick={() => verwijderGebruiker(rol.user_id, rol.naam)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-500 bg-white hover:bg-red-50 transition"
                    >
                      Verwijderen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info blok */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: DYNAMO_BLUE }}>Hoe werkt het?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="text-xl shrink-0">📧</span>
              <div><strong className="text-gray-800">Uitnodigen</strong><br />De gebruiker ontvangt een e-mail om een wachtwoord in te stellen.</div>
            </div>
            <div className="flex gap-3">
              <span className="text-xl shrink-0">🏪</span>
              <div><strong className="text-gray-800">Winkeltoegang</strong><br />Laat leeg voor toegang tot alle winkels, of selecteer specifieke winkels.</div>
            </div>
            <div className="flex gap-3">
              <span className="text-xl shrink-0">👑</span>
              <div><strong className="text-gray-800">Admin rol</strong><br />Admins kunnen gebruikers beheren en hebben toegang tot alle functies.</div>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
