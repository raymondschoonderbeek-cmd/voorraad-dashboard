'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DYNAMO_BLUE, FONT_FAMILY } from '@/lib/theme'

const F = FONT_FAMILY

type Mededeling = {
  id: string
  tekst: string
  actief: boolean
  sort_order: number
  created_at: string
}

export function TvMededelingenTab() {
  const supabase = createClient()
  const [lijst, setLijst] = useState<Mededeling[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nieuweTekst, setNieuweTekst] = useState('')
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [bewerkTekst, setBewerkTekst] = useState('')

  const laad = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tv_mededelingen')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    setLijst(data ?? [])
    setLoading(false)
  }

  useEffect(() => { void laad() }, [])

  const voegToe = async () => {
    if (!nieuweTekst.trim()) return
    setSaving(true); setError(null)
    const { error: err } = await supabase
      .from('tv_mededelingen')
      .insert({ tekst: nieuweTekst.trim(), actief: true, sort_order: lijst.length })
    if (err) setError(err.message)
    else { setNieuweTekst(''); void laad() }
    setSaving(false)
  }

  const toggleActief = async (m: Mededeling) => {
    await supabase.from('tv_mededelingen').update({ actief: !m.actief, updated_at: new Date().toISOString() }).eq('id', m.id)
    void laad()
  }

  const verwijder = async (id: string) => {
    if (!confirm('Mededeling verwijderen?')) return
    await supabase.from('tv_mededelingen').delete().eq('id', id)
    void laad()
  }

  const slaBewerkt = async (id: string) => {
    if (!bewerkTekst.trim()) return
    setSaving(true)
    await supabase.from('tv_mededelingen').update({ tekst: bewerkTekst.trim(), updated_at: new Date().toISOString() }).eq('id', id)
    setBewerkId(null)
    setSaving(false)
    void laad()
  }

  const verplaats = async (idx: number, richting: -1 | 1) => {
    const doelIdx = idx + richting
    if (doelIdx < 0 || doelIdx >= lijst.length) return
    const updates = [
      { id: lijst[idx].id, sort_order: doelIdx },
      { id: lijst[doelIdx].id, sort_order: idx },
    ]
    await Promise.all(updates.map(u =>
      supabase.from('tv_mededelingen').update({ sort_order: u.sort_order }).eq('id', u.id)
    ))
    void laad()
  }

  const inp = 'w-full rounded-xl px-3 py-2 text-sm border border-gray-200 outline-none focus:border-[#2D457C] focus:ring-1 focus:ring-[#2D457C] text-gray-900 bg-white placeholder:text-gray-400'

  return (
    <div className="space-y-6">
      {/* Preview link */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>TV-scherm bekijken</p>
          <p className="text-xs text-gray-500 mt-0.5">Openbaar — geen login vereist. Geschikt voor Chrome in kiosk-modus.</p>
        </div>
        <a
          href="/tv"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
          style={{ background: DYNAMO_BLUE, fontFamily: F }}
        >
          Openen →
        </a>
      </div>

      {/* Nieuw formulier */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-base font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Nieuwe mededeling toevoegen</h2>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <input
            className={inp}
            value={nieuweTekst}
            onChange={e => setNieuweTekst(e.target.value)}
            placeholder="Bijv. Welkom bij Dynamo Retail Group! De kantine is open van 12:00 tot 13:30."
            onKeyDown={e => { if (e.key === 'Enter') void voegToe() }}
          />
          <button
            onClick={() => void voegToe()}
            disabled={saving || !nieuweTekst.trim()}
            className="rounded-xl px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
            style={{ background: DYNAMO_BLUE, fontFamily: F }}
          >
            {saving ? 'Opslaan…' : 'Toevoegen'}
          </button>
        </div>
      </div>

      {/* Lijst */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-base font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Mededelingen op het scherm</h2>
        <p className="text-xs text-gray-400">Actieve mededelingen worden onderaan het TV-scherm getoond als scrollende ticker.</p>

        {loading ? (
          <p className="text-sm text-gray-400">Laden…</p>
        ) : lijst.length === 0 ? (
          <p className="text-sm text-gray-400">Nog geen mededelingen. Voeg er een toe hierboven.</p>
        ) : (
          <div className="space-y-2">
            {lijst.map((m, idx) => (
              <div key={m.id} className={`rounded-xl border p-3 transition ${m.actief ? 'border-gray-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                {bewerkId === m.id ? (
                  <div className="flex gap-2">
                    <input
                      className={inp}
                      value={bewerkTekst}
                      onChange={e => setBewerkTekst(e.target.value)}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') void slaBewerkt(m.id); if (e.key === 'Escape') setBewerkId(null) }}
                    />
                    <button
                      onClick={() => void slaBewerkt(m.id)}
                      disabled={saving}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                      style={{ background: DYNAMO_BLUE }}
                    >Opslaan</button>
                    <button
                      onClick={() => setBewerkId(null)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-500"
                    >Annuleer</button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {/* Volgorde knoppen */}
                    <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                      <button
                        onClick={() => void verplaats(idx, -1)}
                        disabled={idx === 0}
                        className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none"
                      >▲</button>
                      <button
                        onClick={() => void verplaats(idx, 1)}
                        disabled={idx === lijst.length - 1}
                        className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none"
                      >▼</button>
                    </div>

                    <p className="flex-1 text-sm text-gray-800 leading-snug">{m.tekst}</p>

                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => void toggleActief(m)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${m.actief ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                      >
                        {m.actief ? 'Actief' : 'Inactief'}
                      </button>
                      <button
                        onClick={() => { setBewerkId(m.id); setBewerkTekst(m.tekst) }}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold border transition hover:opacity-80"
                        style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white', fontFamily: F }}
                      >
                        Wijzig
                      </button>
                      <button
                        onClick={() => void verwijder(m.id)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition"
                      >
                        Verwijder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
