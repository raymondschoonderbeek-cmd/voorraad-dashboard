'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { DYNAMO_BLUE } from '@/lib/theme'

const F = "'Outfit', sans-serif"

type Fiets = {
  id: string
  merk: string
  omschrijving_fiets: string
  ean_code: string
  bestelnummer_leverancier: string
  kleur: string
  framemaat: string
  foto_url: string
  active: boolean
}

const empty: Omit<Fiets, 'id'> = {
  merk: '',
  omschrijving_fiets: '',
  ean_code: '',
  bestelnummer_leverancier: '',
  kleur: '',
  framemaat: '',
  foto_url: '',
  active: true,
}

export function CampagneFietsenBeheerTab() {
  const [rows, setRows] = useState<Fiets[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/campagne-fietsen?all=1')
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data.error ?? 'Laden mislukt')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden mislukt')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ean_code.trim()) {
      setError('EAN is verplicht')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const res = await fetch(`/api/campagne-fietsen/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      } else {
        const res = await fetch('/api/campagne-fietsen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Aanmaken mislukt')
      }
      setForm(empty)
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Campagnefiets verwijderen?')) return
    setError('')
    const res = await fetch(`/api/campagne-fietsen/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Verwijderen mislukt')
      return
    }
    await load()
  }

  function startEdit(f: Fiets) {
    setEditingId(f.id)
    setForm({
      merk: f.merk,
      omschrijving_fiets: f.omschrijving_fiets,
      ean_code: f.ean_code,
      bestelnummer_leverancier: f.bestelnummer_leverancier,
      kleur: f.kleur,
      framemaat: f.framemaat,
      foto_url: f.foto_url,
      active: f.active,
    })
  }

  const inp = 'w-full rounded-xl px-3 py-2 text-sm border border-gray-200 focus:border-dynamo-blue focus:ring-1 focus:ring-dynamo-blue outline-none'
  const label = 'block text-xs font-semibold text-gray-500 mb-1'

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100" style={{ borderTop: `3px solid ${DYNAMO_BLUE}` }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                Campagnefietsen
              </h2>
              <p className="text-xs mt-1 text-gray-500" style={{ fontFamily: F }}>
                Beheer barcodes en gegevens. Voorraad zie je op{' '}
                <Link href="/dashboard/campagne-fietsen" className="font-semibold underline text-dynamo-blue">
                  Voorraad Campagnefietsen
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3 border-b border-gray-100 bg-gray-50/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className={label}>Merk</label>
              <input className={inp} value={form.merk} onChange={e => setForm(f => ({ ...f, merk: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Omschrijving fiets</label>
              <input className={inp} value={form.omschrijving_fiets} onChange={e => setForm(f => ({ ...f, omschrijving_fiets: e.target.value }))} />
            </div>
            <div>
              <label className={label}>EAN / barcode *</label>
              <input className={inp} value={form.ean_code} onChange={e => setForm(f => ({ ...f, ean_code: e.target.value }))} required />
            </div>
            <div>
              <label className={label}>Bestelnr leverancier</label>
              <input
                className={inp}
                value={form.bestelnummer_leverancier}
                onChange={e => setForm(f => ({ ...f, bestelnummer_leverancier: e.target.value }))}
              />
            </div>
            <div>
              <label className={label}>Kleur</label>
              <input className={inp} value={form.kleur} onChange={e => setForm(f => ({ ...f, kleur: e.target.value }))} />
            </div>
            <div>
              <label className={label}>Framemaat</label>
              <input className={inp} value={form.framemaat} onChange={e => setForm(f => ({ ...f, framemaat: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Afbeelding URL</label>
              <input className={inp} type="url" value={form.foto_url} onChange={e => setForm(f => ({ ...f, foto_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="cf-active"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="cf-active" className="text-sm text-gray-700">
                Actief in voorraadmodule
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: DYNAMO_BLUE, fontFamily: F }}
            >
              {saving ? 'Bezig...' : editingId ? 'Wijzigingen opslaan' : 'Toevoegen'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm(empty)
                  setError('')
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold border border-gray-200"
              >
                Annuleren
              </button>
            )}
          </div>
        </form>

        <div className="p-4 overflow-x-auto">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Nog geen campagnefietsen.</p>
          ) : (
            <table className="w-full text-xs text-left text-gray-900">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-2 pr-2 font-semibold text-gray-700">Merk</th>
                  <th className="pb-2 pr-2 font-semibold text-gray-700">Omschrijving</th>
                  <th className="pb-2 pr-2 font-semibold text-gray-700">EAN</th>
                  <th className="pb-2 pr-2 font-semibold text-gray-700 hidden md:table-cell">Bestelnr</th>
                  <th className="pb-2 pr-2 font-semibold text-gray-700 hidden lg:table-cell">Kleur</th>
                  <th className="pb-2 pr-2 font-semibold text-gray-700">Maat</th>
                  <th className="pb-2 font-semibold text-gray-700">Actief</th>
                  <th className="pb-2 w-28" />
                </tr>
              </thead>
              <tbody>
                {rows.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="py-2 pr-2 font-medium" style={{ color: DYNAMO_BLUE }}>
                      {f.merk}
                    </td>
                    <td className="py-2 pr-2 max-w-[200px] truncate text-gray-900">{f.omschrijving_fiets}</td>
                    <td className="py-2 pr-2 font-mono text-gray-900">{f.ean_code}</td>
                    <td className="py-2 pr-2 hidden md:table-cell font-mono text-gray-800">{f.bestelnummer_leverancier || '—'}</td>
                    <td className="py-2 pr-2 hidden lg:table-cell text-gray-800">{f.kleur || '—'}</td>
                    <td className="py-2 pr-2 text-gray-900">{f.framemaat || '—'}</td>
                    <td className="py-2 text-gray-900 tabular-nums">{f.active ? '✓' : '—'}</td>
                    <td className="py-2 text-right space-x-1 whitespace-nowrap">
                      <button type="button" onClick={() => startEdit(f)} className="text-dynamo-blue font-semibold hover:underline">
                        Bewerk
                      </button>
                      <button type="button" onClick={() => remove(f.id)} className="text-red-600 font-semibold hover:underline">
                        Verwijder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
