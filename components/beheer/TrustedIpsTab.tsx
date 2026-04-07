'use client'

import { useState, useEffect, useCallback } from 'react'
import { DYNAMO_BLUE } from '@/lib/theme'

const F = "'Outfit', sans-serif"
const inputStyle = { background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
const inputClass = 'w-full rounded-xl px-3 py-2 text-sm placeholder:text-gray-400'

export function TrustedIpsTab() {
  const [trustedIps, setTrustedIps] = useState<{ id: number; ip_or_cidr: string; created_at: string }[]>([])
  const [nieuwIp, setNieuwIp] = useState('')
  const [ipLoading, setIpLoading] = useState(false)
  const [ipError, setIpError] = useState('')

  const haalTrustedIpsOp = useCallback(async () => {
    const res = await fetch('/api/trusted-ips')
    if (res.ok) {
      const data = await res.json()
      setTrustedIps(Array.isArray(data) ? data : [])
    } else {
      setTrustedIps([])
    }
  }, [])

  useEffect(() => { haalTrustedIpsOp() }, [haalTrustedIpsOp])

  async function voegTrustedIpToe(e: React.FormEvent) {
    e.preventDefault()
    const ip = nieuwIp.trim()
    if (!ip) return
    setIpLoading(true)
    setIpError('')
    try {
      const res = await fetch('/api/trusted-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_or_cidr: ip }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Fout: ${res.status}`)
      setNieuwIp('')
      haalTrustedIpsOp()
    } catch (err: unknown) {
      setIpError(err instanceof Error ? err.message : 'Toevoegen mislukt')
    }
    setIpLoading(false)
  }

  async function verwijderTrustedIp(id: number) {
    if (!confirm('Dit IP-adres verwijderen?')) return
    const res = await fetch(`/api/trusted-ips?id=${id}`, { method: 'DELETE' })
    if (res.ok) haalTrustedIpsOp()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
        <div className="p-4" style={{ borderBottom: '1px solid rgba(45,69,124,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
          <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Vertrouwde IP-adressen</div>
          <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Vanaf deze IP&apos;s is geen MFA nodig bij inloggen. Ondersteunt exacte IP&apos;s (bijv. 192.168.1.100) en CIDR (bijv. 192.168.1.0/24).</div>
        </div>
        <div className="p-4 space-y-4">
          <form onSubmit={voegTrustedIpToe} className="flex gap-2">
            <input
              value={nieuwIp}
              onChange={e => setNieuwIp(e.target.value)}
              placeholder="192.168.1.100 of 192.168.1.0/24"
              className={inputClass}
              style={inputStyle}
            />
            <button type="submit" disabled={ipLoading || !nieuwIp.trim()} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
              {ipLoading ? 'Bezig...' : 'Toevoegen'}
            </button>
          </form>
          {ipError && <div className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{ipError}</div>}
          <div className="divide-y" style={{ borderColor: 'rgba(45,69,124,0.06)' }}>
            {trustedIps.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Nog geen vertrouwde IP&apos;s. Voeg kantoor-IP&apos;s toe om MFA over te slaan.</div>
            ) : (
              trustedIps.map(ip => (
                <div key={ip.id} className="flex items-center justify-between py-3">
                  <code className="text-sm font-mono" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{ip.ip_or_cidr}</code>
                  <button onClick={() => verwijderTrustedIp(ip.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)', fontFamily: F }}>Verwijderen</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
