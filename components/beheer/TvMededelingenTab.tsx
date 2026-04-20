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
  geldig_van: string | null
  geldig_tot: string | null
  created_at: string
}

function statusLabel(m: Mededeling): { label: string; kleur: string; bg: string; border: string } {
  if (!m.actief) return { label: 'Inactief', kleur: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' }
  const vandaag = new Date().toISOString().slice(0, 10)
  if (m.geldig_van && m.geldig_van > vandaag) return { label: 'Gepland', kleur: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' }
  if (m.geldig_tot && m.geldig_tot < vandaag) return { label: 'Verlopen', kleur: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' }
  return { label: 'Actief', kleur: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' }
}

function datumWeergave(d: string | null) {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function TvMededelingenTab() {
  const supabase = createClient()
  const [lijst, setLijst] = useState<Mededeling[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Nieuw formulier
  const [nieuweTekst, setNieuweTekst] = useState('')
  const [nieuweVan, setNieuweVan] = useState('')
  const [nieuweTot, setNieuweTot] = useState('')

  // Bewerken
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [bewerkTekst, setBewerkTekst] = useState('')
  const [bewerkVan, setBewerkVan] = useState('')
  const [bewerkTot, setBewerkTot] = useState('')

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
      .insert({
        tekst: nieuweTekst.trim(),
        actief: true,
        sort_order: lijst.length,
        geldig_van: nieuweVan || null,
        geldig_tot: nieuweTot || null,
      })
    if (err) setError(err.message)
    else { setNieuweTekst(''); setNieuweVan(''); setNieuweTot(''); void laad() }
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

  const startBewerken = (m: Mededeling) => {
    setBewerkId(m.id)
    setBewerkTekst(m.tekst)
    setBewerkVan(m.geldig_van ?? '')
    setBewerkTot(m.geldig_tot ?? '')
  }

  const slaBewerkt = async (id: string) => {
    if (!bewerkTekst.trim()) return
    setSaving(true)
    await supabase.from('tv_mededelingen').update({
      tekst: bewerkTekst.trim(),
      geldig_van: bewerkVan || null,
      geldig_tot: bewerkTot || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setBewerkId(null)
    setSaving(false)
    void laad()
  }

  const verplaats = async (idx: number, richting: -1 | 1) => {
    const doelIdx = idx + richting
    if (doelIdx < 0 || doelIdx >= lijst.length) return
    await Promise.all([
      supabase.from('tv_mededelingen').update({ sort_order: doelIdx }).eq('id', lijst[idx].id),
      supabase.from('tv_mededelingen').update({ sort_order: idx }).eq('id', lijst[doelIdx].id),
    ])
    void laad()
  }

  const inp = 'w-full rounded-xl px-3 py-2 text-sm border border-gray-200 outline-none focus:border-[#2D457C] focus:ring-1 focus:ring-[#2D457C] text-gray-900 bg-white placeholder:text-gray-400'
  const inpDate = `${inp} cursor-pointer`

  return (
    <div className="space-y-6">
      {/* Preview link */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>TV-scherm bekijken</p>
          <p className="text-xs text-gray-500 mt-0.5">Login vereist. Geschikt voor Chrome in kiosk-modus.</p>
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
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Tekst</label>
          <input
            className={inp}
            value={nieuweTekst}
            onChange={e => setNieuweTekst(e.target.value)}
            placeholder="Bijv. De kantine is open van 12:00 tot 13:30."
            onKeyDown={e => { if (e.key === 'Enter') void voegToe() }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Begindatum <span className="font-normal text-gray-400">(optioneel)</span></label>
            <input type="date" className={inpDate} value={nieuweVan} onChange={e => setNieuweVan(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Einddatum <span className="font-normal text-gray-400">(optioneel)</span></label>
            <input type="date" className={inpDate} value={nieuweTot} onChange={e => setNieuweTot(e.target.value)} />
          </div>
        </div>
        <button
          onClick={() => void voegToe()}
          disabled={saving || !nieuweTekst.trim()}
          className="rounded-xl px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: DYNAMO_BLUE, fontFamily: F }}
        >
          {saving ? 'Opslaan…' : 'Toevoegen'}
        </button>
      </div>

      {/* Lijst */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-base font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Mededelingen op het scherm</h2>
        <p className="text-xs text-gray-400">Actieve mededelingen worden onderaan het TV-scherm getoond als scrollende ticker, binnen de ingestelde periode.</p>

        {loading ? (
          <p className="text-sm text-gray-400">Laden…</p>
        ) : lijst.length === 0 ? (
          <p className="text-sm text-gray-400">Nog geen mededelingen. Voeg er een toe hierboven.</p>
        ) : (
          <div className="space-y-2">
            {lijst.map((m, idx) => {
              const st = statusLabel(m)
              return (
                <div key={m.id} className="rounded-xl border border-gray-100 overflow-hidden">
                  {bewerkId === m.id ? (
                    <div className="p-3 space-y-3 bg-gray-50">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Tekst</label>
                        <input
                          className={inp}
                          value={bewerkTekst}
                          onChange={e => setBewerkTekst(e.target.value)}
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Escape') setBewerkId(null) }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Begindatum</label>
                          <input type="date" className={inpDate} value={bewerkVan} onChange={e => setBewerkVan(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Einddatum</label>
                          <input type="date" className={inpDate} value={bewerkTot} onChange={e => setBewerkTot(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void slaBewerkt(m.id)}
                          disabled={saving || !bewerkTekst.trim()}
                          className="rounded-lg px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                          style={{ background: DYNAMO_BLUE }}
                        >Opslaan</button>
                        <button
                          onClick={() => setBewerkId(null)}
                          className="rounded-lg px-4 py-1.5 text-xs font-semibold border border-gray-200 text-gray-500"
                        >Annuleer</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-3">
                      {/* Volgorde */}
                      <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                        <button onClick={() => void verplaats(idx, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none">▲</button>
                        <button onClick={() => void verplaats(idx, 1)} disabled={idx === lijst.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none">▼</button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-snug">{m.tekst}</p>
                        {(m.geldig_van || m.geldig_tot) && (
                          <p className="text-xs text-gray-400 mt-1">
                            {m.geldig_van && <span>Vanaf {datumWeergave(m.geldig_van)}</span>}
                            {m.geldig_van && m.geldig_tot && <span> · </span>}
                            {m.geldig_tot && <span>Tot en met {datumWeergave(m.geldig_tot)}</span>}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0 items-center">
                        <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold border ${st.bg} ${st.kleur} ${st.border}`}>
                          {st.label}
                        </span>
                        <button
                          onClick={() => void toggleActief(m)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-100 transition"
                        >
                          {m.actief ? 'Zet uit' : 'Zet aan'}
                        </button>
                        <button
                          onClick={() => startBewerken(m)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold border transition hover:opacity-80"
                          style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white', fontFamily: F }}
                        >Wijzig</button>
                        <button
                          onClick={() => void verwijder(m.id)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition"
                        >Verwijder</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
