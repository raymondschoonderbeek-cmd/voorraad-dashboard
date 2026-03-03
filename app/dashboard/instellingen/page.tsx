'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type AliasRow = {
  id: string
  alias_key: string
  canonical_key: string
  canonical_label: string | null
  created_at: string
}

function normKey(input: any) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

export default function InstellingenPage() {
  const [rows, setRows] = useState<AliasRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string>('')

  const [alias, setAlias] = useState('')
  const [canonical, setCanonical] = useState('')
  const [canonicalLabel, setCanonicalLabel] = useState('')

  const [q, setQ] = useState('')

  // MFA state
  const [mfaFactors, setMfaFactors] = useState<{ id: string; friendly_name?: string }[]>([])
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQr, setMfaQr] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaVerifyCode, setMfaVerifyCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaSuccess, setMfaSuccess] = useState('')
  const supabase = createClient()

  async function loadMfaFactors() {
    const { data } = await supabase.auth.mfa.listFactors()
    const totp = data?.totp ?? []
    setMfaFactors(totp)
  }

  useEffect(() => {
    loadMfaFactors()
  }, [])

  async function startMfaEnroll() {
    setMfaError('')
    setMfaSuccess('')
    setMfaEnrolling(true)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      })
      if (error) throw error
      setMfaQr(data.totp.qr_code)
      setMfaFactorId(data.id)
    } catch (e: unknown) {
      setMfaError(e instanceof Error ? e.message : 'Starten mislukt')
    }
    setMfaEnrolling(false)
  }

  async function confirmMfaEnroll() {
    if (!mfaFactorId || mfaVerifyCode.length !== 6) return
    setMfaError('')
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
      if (chErr) throw chErr
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge!.id,
        code: mfaVerifyCode,
      })
      if (verifyErr) throw verifyErr
      setMfaSuccess('MFA ingeschakeld.')
      setMfaQr('')
      setMfaFactorId('')
      setMfaVerifyCode('')
      loadMfaFactors()
    } catch (e: unknown) {
      setMfaError(e instanceof Error ? e.message : 'Verificatie mislukt')
    }
  }

  async function unenrollMfa(factorId: string) {
    if (!confirm('MFA uitschakelen? Je moet dan opnieuw een code invoeren bij inloggen vanaf een niet-vertrouwd IP.')) return
    setMfaError('')
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      setMfaSuccess('MFA uitgeschakeld.')
      loadMfaFactors()
    } catch (e: unknown) {
      setMfaError(e instanceof Error ? e.message : 'Uitschakelen mislukt')
    }
  }

  function cancelMfaEnroll() {
    setMfaQr('')
    setMfaFactorId('')
    setMfaVerifyCode('')
    setMfaError('')
  }

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/brand-aliases')
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.message || `Fout: ${res.status}`)
      }
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setErr(e?.message || 'Fout bij laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function addOrUpdate(e: React.FormEvent) {
    e.preventDefault()
    setErr('')

    const payload = {
      alias,
      canonical,
      canonicalLabel,
    }

    const res = await fetch('/api/brand-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j?.message || `Fout: ${res.status}`)
      return
    }

    setAlias('')
    setCanonical('')
    setCanonicalLabel('')
    await load()
  }

  async function remove(id: string) {
    if (!confirm('Alias verwijderen?')) return
    const res = await fetch(`/api/brand-aliases?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j?.message || `Fout: ${res.status}`)
      return
    }
    await load()
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(r =>
      [r.alias_key, r.canonical_key, r.canonical_label ?? ''].some(x =>
        String(x).toLowerCase().includes(needle)
      )
    )
  }, [rows, q])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">⚙ Instellingen</h1>
            <p className="text-sm text-gray-500">
              Beheer merk-aliases zodat <span className="font-medium">DUTCH ID</span> en{' '}
              <span className="font-medium">dutch id</span> als één merk worden getoond.
            </p>
          </div>

          <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            ← Terug naar dashboard
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-semibold">Hoe werkt het?</div>
          <ul className="list-disc ml-5 mt-1 space-y-1">
            <li>
              <span className="font-medium">Alias</span> = variant die je wil samenvoegen (bijv. “Van Raam”)
            </li>
            <li>
              <span className="font-medium">Canonical</span> = hoofd-key (bijv. “vanraam”)
            </li>
            <li>
              Keys worden automatisch genormaliseerd: <span className="font-mono">lowercase + zonder spaties</span>
            </li>
          </ul>
        </div>
      </div>

      {/* MFA sectie */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="text-sm font-bold">🔐 Twee-factor authenticatie (MFA)</div>
        <p className="text-sm text-gray-600">
          Voeg een extra beveiligingslaag toe. Vanaf kantoor (vertrouwd IP) is geen MFA nodig. Vanaf thuis of elders wel.
        </p>
        {mfaError && <div className="rounded-lg p-2 text-sm text-red-600 bg-red-50">{mfaError}</div>}
        {mfaSuccess && <div className="rounded-lg p-2 text-sm text-green-700 bg-green-50">{mfaSuccess}</div>}
        {mfaFactors.length > 0 && !mfaQr && (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">MFA is ingeschakeld.</p>
            {mfaFactors.map(f => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <span className="text-sm">{f.friendly_name ?? 'Authenticator'}</span>
                <button
                  type="button"
                  onClick={() => unenrollMfa(f.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Uitschakelen
                </button>
              </div>
            ))}
          </div>
        )}
        {mfaQr ? (
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-medium">Scan de QR-code met je authenticator-app (Google Authenticator, Authy, 1Password):</p>
            <div className="flex justify-center">
              <img src={mfaQr} alt="QR code" className="w-48 h-48" />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-cijferige code"
                value={mfaVerifyCode}
                onChange={e => setMfaVerifyCode(e.target.value.replace(/\D/g, ''))}
                className="flex-1 rounded-lg px-3 py-2 text-sm border border-gray-300"
              />
              <button
                type="button"
                onClick={confirmMfaEnroll}
                disabled={mfaVerifyCode.length !== 6}
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-blue-600 text-white disabled:opacity-50"
              >
                Bevestigen
              </button>
              <button type="button" onClick={cancelMfaEnroll} className="rounded-lg px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50">
                Annuleren
              </button>
            </div>
          </div>
        ) : mfaFactors.length === 0 && (
          <button
            type="button"
            onClick={startMfaEnroll}
            disabled={mfaEnrolling}
            className="rounded-xl px-4 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mfaEnrolling ? 'Bezig...' : 'MFA inschakelen'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
        {/* Form */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="text-sm font-semibold">Alias toevoegen / bijwerken</div>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}

          <form onSubmit={addOrUpdate} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">Alias (input)</label>
              <input
                value={alias}
                onChange={e => setAlias(e.target.value)}
                placeholder="Bijv. Van Raam"
                className="mt-1 w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <div className="text-xs text-gray-500 mt-1">
                Key: <span className="font-mono">{alias ? normKey(alias) : '—'}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Canonical (hoofd)</label>
              <input
                value={canonical}
                onChange={e => setCanonical(e.target.value)}
                placeholder="Bijv. vanraam"
                className="mt-1 w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <div className="text-xs text-gray-500 mt-1">
                Key: <span className="font-mono">{canonical ? normKey(canonical) : '—'}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Canonical label (optioneel)</label>
              <input
                value={canonicalLabel}
                onChange={e => setCanonicalLabel(e.target.value)}
                placeholder="Bijv. Van Raam"
                className="mt-1 w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 text-white py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Bezig…' : 'Opslaan'}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              Merk-aliases ({filtered.length})
            </div>

            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Zoek…"
                className="rounded-xl px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={load}
                className="rounded-xl px-3 py-2 text-sm font-semibold bg-white border border-gray-300 hover:bg-gray-50"
              >
                Verversen
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm [border-collapse:separate] [border-spacing:0]">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr className="text-xs uppercase tracking-wide text-gray-700">
                  <th className="px-4 py-3 text-left font-semibold">Alias key</th>
                  <th className="px-4 py-3 text-left font-semibold">Canonical</th>
                  <th className="px-4 py-3 text-left font-semibold">Label</th>
                  <th className="px-4 py-3 text-right font-semibold">Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-32 bg-gray-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-28 bg-gray-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 rounded" /></td>
                      <td className="px-4 py-3 text-right"><div className="h-8 w-20 bg-gray-200 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                      Geen aliases gevonden.
                    </td>
                  </tr>
                ) : (
                  filtered.map(r => (
                    <tr key={r.id} className="bg-white hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-800">{r.alias_key}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-800">{r.canonical_key}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{r.canonical_label ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => remove(r.id)}
                          className="rounded-lg px-3 py-2 text-xs font-semibold border border-gray-300 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                        >
                          Verwijderen
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
            Tip: gebruik canonical label om de “mooie” weergavenaam te bepalen.
          </div>
        </div>
      </div>
    </div>
  )
}