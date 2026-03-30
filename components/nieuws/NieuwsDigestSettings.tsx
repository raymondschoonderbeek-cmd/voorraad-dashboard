'use client'

import { useCallback, useEffect, useState } from 'react'
import { DYNAMO_BLUE } from '@/lib/theme'

const F = "'Outfit', sans-serif"

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Maandag' },
  { value: 2, label: 'Dinsdag' },
  { value: 3, label: 'Woensdag' },
  { value: 4, label: 'Donderdag' },
  { value: 5, label: 'Vrijdag' },
  { value: 6, label: 'Zaterdag' },
  { value: 7, label: 'Zondag' },
]

export function NieuwsDigestSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [digestEnabled, setDigestEnabled] = useState(true)
  const [digestWeekday, setDigestWeekday] = useState(5)
  const [digestTimeLocal, setDigestTimeLocal] = useState('09:00')
  const [lastSent, setLastSent] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/news/digest-settings')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Laden mislukt')
      setDigestEnabled(data.digest_enabled !== false)
      if (typeof data.digest_weekday === 'number') setDigestWeekday(data.digest_weekday)
      if (typeof data.digest_time_local === 'string') setDigestTimeLocal(data.digest_time_local)
      setLastSent(typeof data.last_digest_sent_at === 'string' ? data.last_digest_sent_at : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden mislukt')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/news/digest-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          digest_enabled: digestEnabled,
          digest_weekday: digestWeekday,
          digest_time_local: digestTimeLocal.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Opslaan mislukt')
      setDigestEnabled(data.digest_enabled !== false)
      if (typeof data.digest_weekday === 'number') setDigestWeekday(data.digest_weekday)
      if (typeof data.digest_time_local === 'string') setDigestTimeLocal(data.digest_time_local)
      setLastSent(typeof data.last_digest_sent_at === 'string' ? data.last_digest_sent_at : null)
      setSuccess('Opgeslagen.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    }
    setSaving(false)
  }

  const inputStyle = { background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
  const inputClass = 'w-full rounded-xl px-3 py-2 text-sm'

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}
    >
      <div>
        <h2 className="text-sm font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
          Wekelijkse samenvatting per e-mail
        </h2>
        <p className="text-xs m-0 mt-1" style={{ color: 'rgba(45,69,124,0.55)', fontFamily: F }}>
          Medewerkers kunnen hun eigen voorkeur aanpassen onder Instellingen. Hier stel je in of de wekelijkse e-mail
          automatisch wordt verstuurd, op welke dag (Nederlandse tijd, Amsterdam) en rond welk tijdstip. Laat een externe
          planning (bijv. elke 5 minuten) <code className="text-[11px] bg-gray-100 px-1 rounded">GET /api/news/digest-cron</code>{' '}
          aanroepen met{' '}
          <code className="text-[11px] bg-gray-100 px-1 rounded">Authorization: Bearer CRON_SECRET</code> — hetzelfde principe
          als bij de lunch-herinnering.
        </p>
      </div>

      {error && (
        <div className="rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#b91c1c', fontFamily: F }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl p-3 text-sm" style={{ background: '#f0fdf4', color: '#15803d', fontFamily: F }}>
          {success}
        </div>
      )}

      {loading ? (
        <p className="text-sm m-0" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
          Laden…
        </p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-medium" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
              Wekelijkse samenvatting per e-mail versturen
            </span>
            <button
              type="button"
              role="switch"
              aria-label={digestEnabled ? 'Wekelijkse e-mail uit' : 'Wekelijkse e-mail aan'}
              aria-checked={digestEnabled}
              disabled={saving}
              onClick={() => setDigestEnabled(v => !v)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                digestEnabled ? '' : 'bg-gray-200'
              }`}
              style={digestEnabled ? { background: DYNAMO_BLUE } : {}}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                  digestEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
                Dag van verzending (Amsterdam)
              </label>
              <select
                className={inputClass}
                style={inputStyle}
                value={digestWeekday}
                onChange={e => setDigestWeekday(Number(e.target.value))}
              >
                {WEEKDAYS.map(w => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
                Tijdstip (24-uursnotatie, bijv. 09:00)
              </label>
              <input
                type="text"
                className={inputClass}
                style={inputStyle}
                value={digestTimeLocal}
                onChange={e => setDigestTimeLocal(e.target.value)}
                placeholder="09:00"
                pattern="^\d{1,2}:\d{2}$"
                required
              />
            </div>
          </div>

          {lastSent && (
            <p className="text-xs m-0" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
              Laatste verzending: {new Date(lastSent).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })} (Amsterdam)
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: DYNAMO_BLUE, fontFamily: F }}
          >
            {saving ? 'Opslaan…' : 'Instellingen opslaan'}
          </button>
        </form>
      )}
    </div>
  )
}
