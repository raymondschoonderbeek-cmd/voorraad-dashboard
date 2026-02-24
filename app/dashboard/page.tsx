'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
  actief: boolean
}

type Product = {
  [key: string]: any
}

export default function Dashboard() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)
  const [producten, setProducten] = useState<Product[]>([])
  const [kolommen, setKolommen] = useState<string[]>([])
  const [zoekterm, setZoekterm] = useState('')
  const [loading, setLoading] = useState(false)
  const [winkelLoading, setWinkelLoading] = useState(false)
  const [toonWinkelForm, setToonWinkelForm] = useState(false)
  const [nieuweNaam, setNieuweNaam] = useState('')
  const [nieuwDealer, setNieuwDealer] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const haalWinkelsOp = useCallback(async () => {
    const res = await fetch('/api/winkels')
    const data = await res.json()
    setWinkels(data)
  }, [])

  const haalVoorraadOp = useCallback(async (dealer: string, q: string) => {
    setLoading(true)
    const res = await fetch(`/api/voorraad?dealer=${dealer}&q=${encodeURIComponent(q)}`)
    const data = await res.json()
    const items = Array.isArray(data) ? data : data.products ?? []
    setProducten(items)
    if (items.length > 0) {
      setKolommen(Object.keys(items[0]).slice(0, 8))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    haalWinkelsOp()
  }, [haalWinkelsOp])

  useEffect(() => {
    if (!geselecteerdeWinkel) return
    const timer = setTimeout(() => haalVoorraadOp(geselecteerdeWinkel.dealer_nummer, zoekterm), 400)
    return () => clearTimeout(timer)
  }, [zoekterm, geselecteerdeWinkel, haalVoorraadOp])

  async function selecteerWinkel(winkel: Winkel) {
    setGeselecteerdeWinkel(winkel)
    setZoekterm('')
    setProducten([])
    await haalVoorraadOp(winkel.dealer_nummer, '')
  }

  async function voegWinkelToe(e: React.FormEvent) {
    e.preventDefault()
    setWinkelLoading(true)
    await fetch('/api/winkels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam: nieuweNaam, dealer_nummer: nieuwDealer })
    })
    setNieuweNaam('')
    setNieuwDealer('')
    setToonWinkelForm(false)
    setWinkelLoading(false)
    await haalWinkelsOp()
  }

  async function verwijderWinkel(id: number) {
    if (!confirm('Winkel verwijderen?')) return
    await fetch(`/api/winkels?id=${id}`, { method: 'DELETE' })
    if (geselecteerdeWinkel?.id === id) {
      setGeselecteerdeWinkel(null)
      setProducten([])
    }
    await haalWinkelsOp()
  }

  async function uitloggen() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">📦 Voorraad Dashboard</h1>
        <button onClick={uitloggen} className="text-sm text-gray-500 hover:text-red-500">
          Uitloggen
        </button>
      </header>

      <div className="flex flex-1">
        {/* Sidebar winkels */}
        <aside className="w-64 bg-white shadow-sm p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-gray-700">Winkels</h2>
            <button
              onClick={() => setToonWinkelForm(!toonWinkelForm)}
              className="text-blue-600 text-xl font-bold hover:text-blue-800"
            >+</button>
          </div>

          {/* Winkel toevoegen form */}
          {toonWinkelForm && (
            <form onSubmit={voegWinkelToe} className="space-y-2 bg-gray-50 p-3 rounded-lg">
              <input
                placeholder="Naam winkel"
                value={nieuweNaam}
                onChange={e => setNieuweNaam(e.target.value)}
                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                placeholder="Dealer nummer"
                value={nieuwDealer}
                onChange={e => setNieuwDealer(e.target.value)}
                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="submit"
                disabled={winkelLoading}
                className="w-full bg-blue-600 text-white rounded p-2 text-sm font-semibold hover:bg-blue-700"
              >
                {winkelLoading ? 'Bezig...' : 'Toevoegen'}
              </button>
            </form>
          )}

          {/* Winkellijst */}
          {winkels.map(winkel => (
            <div
              key={winkel.id}
              className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition ${
                geselecteerdeWinkel?.id === winkel.id
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span onClick={() => selecteerWinkel(winkel)} className="flex-1 text-sm font-medium">
                🏪 {winkel.naam}
              </span>
              <button
                onClick={() => verwijderWinkel(winkel.id)}
                className={`text-xs ml-2 ${geselecteerdeWinkel?.id === winkel.id ? 'text-white' : 'text-red-400'} hover:text-red-600`}
              >✕</button>
            </div>
          ))}

          {winkels.length === 0 && (
            <p className="text-sm text-gray-400">Nog geen winkels. Klik op + om toe te voegen.</p>
          )}
        </aside>

        {/* Hoofdinhoud */}
        <main className="flex-1 p-6 space-y-4">
          {!geselecteerdeWinkel ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p>← Selecteer een winkel om de voorraad te bekijken</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-gray-700">{geselecteerdeWinkel.naam}</h2>
                <span className="text-sm text-gray-400">#{geselecteerdeWinkel.dealer_nummer}</span>
              </div>

              <input
                type="text"
                placeholder="Zoek op naam, SKU, merk..."
                value={zoekterm}
                onChange={e => setZoekterm(e.target.value)}
                className="w-full border rounded-xl p-4 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {loading ? (
                <p className="text-center text-gray-400 py-12">Voorraad laden...</p>
              ) : (
                <div className="bg-white rounded-xl shadow overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                      <tr>
                        {kolommen.map(k => (
                          <th key={k} className="px-4 py-3 text-left">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {producten.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          {kolommen.map(k => (
                            <td key={k} className="px-4 py-3">{String(p[k] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {producten.length === 0 && (
                    <p className="text-center py-8 text-gray-400">Geen producten gevonden</p>
                  )}
                  {producten.length > 0 && (
                    <p className="text-xs text-gray-400 p-4">{producten.length} producten gevonden</p>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}