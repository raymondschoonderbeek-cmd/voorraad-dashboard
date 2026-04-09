'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const DYNAMO_BLUE = '#2D457C'
const F = "'Outfit', sans-serif"

interface AanvraagInfo {
  id: string
  catalogus_naam: string
  aanvrager_naam: string
  aanvrager_email: string
  motivatie: string | null
  status: string
  verlopen: boolean
  beslist: boolean
}

function statusKleur(status: string) {
  if (status === 'goedgekeurd') return { bg: '#dcfce7', fg: '#15803d', label: '✓ Goedgekeurd' }
  if (status === 'afgekeurd')   return { bg: '#fee2e2', fg: '#b91c1c', label: '✗ Afgekeurd' }
  if (status === 'wacht_op_manager') return { bg: '#fef9c3', fg: '#854d0e', label: 'Wacht op jou' }
  return { bg: '#f1f5f9', fg: '#475569', label: status }
}

function BeslissingForm({ token, aanvraag }: { token: string; aanvraag: AanvraagInfo }) {
  const [beslissing, setBeslissing] = useState<'goedgekeurd' | 'afgekeurd' | null>(null)
  const [notitie, setNotitie] = useState('')
  const [loading, setLoading] = useState(false)
  const [resultaat, setResultaat] = useState<{ ok: boolean; beslissing?: string } | null>(null)
  const [fout, setFout] = useState('')

  async function verstuur() {
    if (!beslissing) return
    setLoading(true)
    setFout('')
    try {
      const res = await fetch('/api/it-cmdb/aanvragen/beslissen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, beslissing, notitie: notitie.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Beslissing vastleggen mislukt')
      setResultaat({ ok: true, beslissing: json.beslissing })
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Er ging iets mis')
    } finally {
      setLoading(false)
    }
  }

  if (resultaat?.ok) {
    const isOk = resultaat.beslissing === 'goedgekeurd'
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{isOk ? '✓' : '✗'}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: isOk ? '#15803d' : '#b91c1c', marginBottom: 8 }}>
          Aanvraag {isOk ? 'goedgekeurd' : 'afgekeurd'}
        </div>
        <p style={{ color: 'rgba(45,69,124,0.55)', fontSize: 15 }}>
          {isOk
            ? 'Support ontvangt een bericht en zal de licentie activeren.'
            : 'De medewerker ontvangt een bericht over de afkeuring.'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={labelStyle}>Medewerker</div>
        <div style={{ fontWeight: 600, color: DYNAMO_BLUE }}>{aanvraag.aanvrager_naam}</div>
        <div style={{ fontSize: 13, color: 'rgba(45,69,124,0.5)' }}>{aanvraag.aanvrager_email}</div>
      </div>
      <div>
        <div style={labelStyle}>Product / Licentie</div>
        <div style={{ fontWeight: 700, fontSize: 17, color: DYNAMO_BLUE }}>{aanvraag.catalogus_naam}</div>
      </div>
      {aanvraag.motivatie && (
        <div>
          <div style={labelStyle}>Motivatie</div>
          <div style={{ background: 'rgba(45,69,124,0.04)', borderLeft: `3px solid ${DYNAMO_BLUE}`, borderRadius: '0 8px 8px 0', padding: '10px 14px', fontSize: 14, color: '#334155' }}>
            {aanvraag.motivatie}
          </div>
        </div>
      )}

      <div>
        <div style={labelStyle}>Jouw beslissing</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['goedgekeurd', 'afgekeurd'] as const).map(b => (
            <button
              key={b}
              type="button"
              onClick={() => setBeslissing(b)}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: 12,
                border: `2px solid ${beslissing === b ? (b === 'goedgekeurd' ? '#16a34a' : '#dc2626') : 'rgba(45,69,124,0.15)'}`,
                background: beslissing === b ? (b === 'goedgekeurd' ? '#f0fdf4' : '#fef2f2') : 'white',
                color: b === 'goedgekeurd' ? '#15803d' : '#b91c1c',
                fontWeight: 700,
                fontSize: 15,
                fontFamily: F,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {b === 'goedgekeurd' ? '✓ Goedkeuren' : '✗ Afkeuren'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={labelStyle}>Notitie (optioneel)</div>
        <textarea
          value={notitie}
          onChange={e => setNotitie(e.target.value)}
          placeholder="Eventuele toelichting voor de medewerker..."
          rows={3}
          style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(45,69,124,0.2)', padding: '10px 12px', fontSize: 14, fontFamily: F, color: '#1e293b', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {fout && <div style={{ color: '#dc2626', fontSize: 14, background: '#fef2f2', padding: '10px 14px', borderRadius: 10 }}>{fout}</div>}

      <button
        type="button"
        disabled={!beslissing || loading}
        onClick={() => void verstuur()}
        style={{
          padding: '14px 0',
          borderRadius: 12,
          border: 'none',
          background: beslissing === 'goedgekeurd' ? '#16a34a' : beslissing === 'afgekeurd' ? '#dc2626' : 'rgba(45,69,124,0.2)',
          color: beslissing ? 'white' : 'rgba(45,69,124,0.4)',
          fontWeight: 700,
          fontSize: 16,
          fontFamily: F,
          cursor: beslissing && !loading ? 'pointer' : 'not-allowed',
          opacity: loading ? 0.7 : 1,
          transition: 'all .15s',
        }}
      >
        {loading ? 'Bezig...' : beslissing ? `Beslissing vastleggen (${beslissing === 'goedgekeurd' ? 'goedkeuren' : 'afkeuren'})` : 'Kies een beslissing'}
      </button>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'rgba(45,69,124,0.5)', marginBottom: 4,
}

function BeslissenInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const prefillBeslissing = searchParams.get('beslissing')

  const [aanvraag, setAanvraag] = useState<AanvraagInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setLoadError('Geen token opgegeven.'); setLoading(false); return }
    fetch(`/api/it-cmdb/aanvragen/beslissen?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setAanvraag(data.aanvraag)
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Laden mislukt'))
      .finally(() => setLoading(false))
  }, [token])

  const card: React.CSSProperties = {
    maxWidth: 500, margin: '48px auto', background: 'white',
    borderRadius: 20, boxShadow: '0 8px 40px rgba(45,69,124,0.12)',
    overflow: 'hidden', fontFamily: F,
  }

  if (loading) return (
    <div style={{ ...card, padding: '48px 32px', textAlign: 'center' }}>
      <div style={{ color: 'rgba(45,69,124,0.4)', fontSize: 15 }}>Laden…</div>
    </div>
  )

  if (loadError) return (
    <div style={card}>
      <div style={{ background: DYNAMO_BLUE, padding: '24px 32px' }}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: 20 }}>DRG Portal</div>
      </div>
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 8 }}>Link ongeldig</div>
        <div style={{ color: 'rgba(45,69,124,0.55)', fontSize: 14 }}>{loadError}</div>
      </div>
    </div>
  )

  if (!aanvraag) return null

  if (aanvraag.verlopen) return (
    <div style={card}>
      <div style={{ background: DYNAMO_BLUE, padding: '24px 32px' }}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: 20 }}>Softwareaanvraag</div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>DRG Portal</div>
      </div>
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
        <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 8 }}>Link verlopen</div>
        <div style={{ color: 'rgba(45,69,124,0.55)', fontSize: 14 }}>
          Deze link is niet meer geldig. De medewerker kan een nieuwe aanvraag indienen.
        </div>
      </div>
    </div>
  )

  if (aanvraag.beslist) {
    const s = statusKleur(aanvraag.status)
    return (
      <div style={card}>
        <div style={{ background: DYNAMO_BLUE, padding: '24px 32px' }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 20 }}>Softwareaanvraag</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>DRG Portal</div>
        </div>
        <div style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: s.bg, color: s.fg, borderRadius: 99, padding: '6px 18px', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{s.label}</div>
          <div style={{ color: 'rgba(45,69,124,0.55)', fontSize: 14 }}>
            Er is al een beslissing genomen voor de aanvraag van <strong>{aanvraag.aanvrager_naam}</strong> voor <strong>{aanvraag.catalogus_naam}</strong>.
          </div>
        </div>
      </div>
    )
  }

  // Prefill beslissing vanuit URL (?beslissing=goedgekeurd / ?beslissing=afgekeurd)
  void prefillBeslissing

  return (
    <div style={card}>
      <div style={{ background: DYNAMO_BLUE, padding: '24px 32px' }}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: 20 }}>Softwareaanvraag beoordelen</div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>DRG Portal</div>
      </div>
      <div style={{ padding: '32px' }}>
        <BeslissingForm token={token} aanvraag={aanvraag} />
      </div>
    </div>
  )
}

export default function BeslissenPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f3f8', padding: '24px 16px', fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');`}</style>
      <Suspense>
        <BeslissenInner />
      </Suspense>
    </div>
  )
}
