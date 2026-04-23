'use client'

import { useState } from 'react'
import useSWR from 'swr'
import * as XLSX from 'xlsx'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const F = "'Outfit', sans-serif"

type ObserverInstellingen = { webhook_secret: string | null; actief: boolean }

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      style={{ background: copied ? 'rgba(22,163,74,0.1)' : 'rgba(45,69,124,0.08)', color: copied ? 'var(--drg-success)' : 'var(--drg-ink-2)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: F }}
    >
      {copied ? '✓ Gekopieerd' : 'Kopieer'}
    </button>
  )
}

function ObserverInstellingenCard() {
  const { data: inst, mutate } = useSWR<ObserverInstellingen>('/api/admin/gazelle-observer', fetcher)
  const [geheimTonen, setGeheimTonen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/freshdesk-gazelle`
    : '/api/webhooks/freshdesk-gazelle'

  async function genereerGeheim() {
    setBezig(true)
    await fetch('/api/admin/gazelle-observer', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genereer_secret: true }),
    })
    await mutate()
    setGeheimTonen(true)
    setBezig(false)
  }

  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--drg-text-3)', fontFamily: F, display: 'block', marginBottom: 6 }
  const codeStyle: React.CSSProperties = { flex: 1, borderRadius: 8, padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', background: 'rgba(45,69,124,0.05)', color: 'var(--drg-ink-2)', wordBreak: 'break-all' }

  return (
    <div style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, padding: '20px 20px 16px', boxShadow: 'var(--drg-card-shadow)', marginBottom: 24 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--drg-ink-2)', margin: '0 0 16px', fontFamily: F }}>Freshdesk Observer instellen</h2>

      <div style={{ marginBottom: 14 }}>
        <span style={labelStyle}>Webhook URL</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={codeStyle}>{webhookUrl}</code>
          <CopyButton value={webhookUrl} />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={labelStyle}>Webhook secret</span>
        {inst?.webhook_secret ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={codeStyle}>
              {geheimTonen ? inst.webhook_secret : '••••••••••••••••••••••••••••••••'}
            </code>
            <button type="button" onClick={() => setGeheimTonen(v => !v)} style={{ background: 'rgba(45,69,124,0.08)', color: 'var(--drg-ink-2)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
              {geheimTonen ? 'Verberg' : 'Toon'}
            </button>
            {geheimTonen && <CopyButton value={inst.webhook_secret} />}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--drg-text-3)', margin: 0, fontFamily: F }}>Nog geen secret.</p>
        )}
        <button type="button" onClick={() => void genereerGeheim()} disabled={bezig} style={{ marginTop: 8, background: 'transparent', border: '1px solid rgba(45,69,124,0.2)', color: 'var(--drg-ink-2)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: F, opacity: bezig ? 0.5 : 1 }}>
          Nieuw secret genereren
        </button>
      </div>

      <div style={{ borderRadius: 8, padding: '10px 12px', background: 'rgba(45,69,124,0.04)', fontSize: 12, color: 'rgba(45,69,124,0.7)', fontFamily: F, lineHeight: 1.6 }}>
        <strong>Configureer in Freshdesk Observer:</strong><br />
        1. Actie: <strong>Trigger webhook</strong> → POST naar bovenstaande URL<br />
        2. Voeg custom header toe: <code style={{ fontFamily: 'monospace' }}>X-Webhook-Secret: [secret]</code><br />
        3. Body (JSON): <code style={{ fontFamily: 'monospace' }}>{'{"ticket_id": "{{ticket.id}}", "ticket_description": "{{ticket.description}}"}'}</code>
      </div>
    </div>
  )
}

type Product = {
  lev_nr: string
  omschrijving: string
  gewenste_leverweek: string
  aantal: string
  ve: string
  totaal_stuks: string
}

type GazelleOrder = {
  id: string
  freshdesk_ticket_id: string | null
  ontvangen_op: string
  besteldatum: string | null
  bestelnummer: string | null
  naam: string | null
  bedrijfsnaam: string | null
  emailadres: string | null
  referentie: string | null
  opmerkingen: string | null
  adres: string | null
  producten: Product[]
  raw_description: string | null
  status: string
}

const STATUS_OPTIES = ['nieuw', 'in behandeling', 'afgerond', 'geannuleerd']

const STATUS_STIJL: Record<string, { background: string; color: string }> = {
  'nieuw':           { background: 'rgba(45,69,124,0.1)',   color: 'var(--drg-ink-2)' },
  'in behandeling':  { background: 'rgba(217,119,6,0.1)',   color: '#d97706' },
  'afgerond':        { background: 'rgba(22,163,74,0.1)',    color: 'var(--drg-success)' },
  'geannuleerd':     { background: 'rgba(107,114,128,0.1)', color: '#6b7280' },
}

function StatusSelect({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const stijl = STATUS_STIJL[status] ?? STATUS_STIJL['nieuw']
  return (
    <select
      value={status}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      style={{
        ...stijl, fontSize: 11, fontWeight: 600, padding: '3px 8px',
        borderRadius: 6, border: 'none', cursor: 'pointer', outline: 'none',
        fontFamily: F,
      }}
    >
      {STATUS_OPTIES.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function exporteerNaarExcel(orders: GazelleOrder[]) {
  const rijen: Record<string, string | number>[] = []
  for (const order of orders) {
    const basis = {
      'Ontvangen op': new Date(order.ontvangen_op).toLocaleDateString('nl-NL'),
      'Bestelnummer': order.bestelnummer ?? '',
      'Besteldatum': order.besteldatum ?? '',
      'Naam': order.naam ?? '',
      'Bedrijfsnaam': order.bedrijfsnaam ?? '',
      'E-mailadres': order.emailadres ?? '',
      'Adres': order.adres ?? '',
      'Referentie': order.referentie ?? '',
      'Opmerkingen': order.opmerkingen ?? '',
      'Status': order.status,
    }
    if (order.producten?.length > 0) {
      for (const p of order.producten) {
        rijen.push({
          ...basis,
          'Lev.nr.': p.lev_nr,
          'Omschrijving': p.omschrijving,
          'Gewenste leverweek': p.gewenste_leverweek,
          'Aantal': p.aantal,
          'VE': p.ve,
          'Totaal stuks': p.totaal_stuks,
        })
      }
    } else {
      rijen.push({ ...basis, 'Lev.nr.': '', 'Omschrijving': '', 'Gewenste leverweek': '', 'Aantal': '', 'VE': '', 'Totaal stuks': '' })
    }
  }
  const ws = XLSX.utils.json_to_sheet(rijen)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Gazelle orders')
  XLSX.writeFile(wb, `gazelle-orders-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function DetailRij({ label, waarde }: { label: string; waarde: string | null | undefined }) {
  if (!waarde) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--drg-text-3)', fontFamily: F }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--drg-ink-2)', fontFamily: F, marginTop: 2 }}>{waarde}</div>
    </div>
  )
}

export default function GazellePakketOrders() {
  const { data, isLoading, mutate } = useSWR<GazelleOrder[]>('/api/gazelle-orders', fetcher)
  const [uitgebreid, setUitgebreid] = useState<string | null>(null)
  const [reparseBezig, setReparseBezig] = useState<string | null>(null)
  const [reparseFout, setReparseFout] = useState<string | null>(null)

  const orders: GazelleOrder[] = Array.isArray(data) ? data : []
  const fout = data && !Array.isArray(data)

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/gazelle-orders?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await mutate()
  }

  async function herparser(id: string) {
    setReparseBezig(id)
    setReparseFout(null)
    const res = await fetch(`/api/gazelle-orders?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reparse: true }),
    })
    const json = await res.json() as { ok?: boolean; error?: string; producten?: number }
    setReparseBezig(null)
    if (!res.ok) {
      setReparseFout(json.error ?? 'Onbekende fout')
    } else {
      await mutate()
    }
  }

  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 1100, margin: '0 auto', fontFamily: F }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--drg-text-3)', margin: '0 0 6px', fontFamily: F }}>
          Gazelle
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--drg-ink-2)', margin: 0, letterSpacing: '-0.02em', fontFamily: F, flex: 1 }}>
            Pakket orders
          </h1>
          {orders.length > 0 && (
            <button
              type="button"
              onClick={() => exporteerNaarExcel(orders)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(45,69,124,0.07)', border: '1px solid rgba(45,69,124,0.15)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--drg-ink-2)', cursor: 'pointer', fontFamily: F, flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Exporteer Excel
            </button>
          )}
        </div>
        <p style={{ marginTop: 6, fontSize: 13, color: 'var(--drg-text-3)', margin: '6px 0 0', fontFamily: F }}>
          Binnenkomende Gazelle pakket bestellingen via Freshdesk.
        </p>
      </div>

      <ObserverInstellingenCard />

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--drg-text-3)', fontSize: 13, fontFamily: F }}>Laden…</div>
      )}

      {fout && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--drg-text-3)', fontSize: 13, fontFamily: F }}>
          Geen toegang of fout bij laden.
        </div>
      )}

      {!isLoading && !fout && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, color: 'var(--drg-text-3)', fontSize: 13, fontFamily: F }}>
          Nog geen orders ontvangen via de Freshdesk webhook.
        </div>
      )}

      {orders.length > 0 && (
        <div style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--drg-card-shadow)' }}>

          {/* Tabelheader */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 1fr 1fr 130px', padding: '10px 16px', borderBottom: '1px solid var(--drg-line)', background: 'rgba(45,69,124,0.03)', gap: 12 }}>
            {['Ontvangen', 'Bestelnr.', 'Naam', 'Product', 'Status'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--drg-text-3)', fontFamily: F }}>{h}</span>
            ))}
          </div>

          {orders.map((order, i) => {
            const isOpen = uitgebreid === order.id
            const isLast = i === orders.length - 1
            const hoofdProduct = order.producten?.[0]
            return (
              <div key={order.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => setUitgebreid(isOpen ? null : order.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setUitgebreid(isOpen ? null : order.id) }}
                  style={{
                    display: 'grid', gridTemplateColumns: '130px 110px 1fr 1fr 130px',
                    padding: '12px 16px', cursor: 'pointer', gap: 12,
                    borderBottom: isLast && !isOpen ? 'none' : '1px solid var(--drg-line)',
                    background: isOpen ? 'rgba(45,69,124,0.025)' : 'transparent',
                    transition: 'background 0.15s', alignItems: 'center',
                    outline: 'none',
                  }}
                  onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'rgba(45,69,124,0.02)' }}
                  onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = isOpen ? 'rgba(45,69,124,0.025)' : 'transparent' }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.outline = '2px solid rgba(45,69,124,0.35)'; (e.currentTarget as HTMLElement).style.outlineOffset = '-2px' }}
                  onBlur={e => { (e.currentTarget as HTMLElement).style.outline = 'none' }}
                >
                  <span style={{ fontSize: 12, color: 'var(--drg-text-3)', fontFamily: F }}>
                    {new Date(order.ontvangen_op).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink-2)', fontFamily: F }}>{order.bestelnummer ?? '—'}</span>
                  <span style={{ fontSize: 13, color: 'var(--drg-ink-2)', fontFamily: F, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.naam ?? '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--drg-text-3)', fontFamily: F, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hoofdProduct?.omschrijving ?? '—'}
                  </span>
                  <StatusSelect status={order.status} onChange={s => updateStatus(order.id, s)} />
                </div>

                {isOpen && (
                  <div style={{ padding: '20px 20px 24px', borderBottom: isLast ? 'none' : '1px solid var(--drg-line)', background: 'rgba(45,69,124,0.02)', display: 'flex', gap: 40, flexWrap: 'wrap' }}>

                    {/* Klantgegevens */}
                    <div style={{ minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--drg-text-3)', margin: 0, fontFamily: F }}>Klantgegevens</p>
                        <button
                          type="button"
                          disabled={reparseBezig === order.id}
                          onClick={e => { e.stopPropagation(); void herparser(order.id) }}
                          style={{ fontSize: 10, fontWeight: 600, color: 'var(--drg-ink-2)', background: 'rgba(45,69,124,0.07)', border: '1px solid rgba(45,69,124,0.15)', borderRadius: 5, padding: '2px 8px', cursor: reparseBezig === order.id ? 'default' : 'pointer', fontFamily: F, opacity: reparseBezig === order.id ? 0.5 : 1 }}
                        >
                          {reparseBezig === order.id ? 'Bezig…' : 'Opnieuw parsen'}
                        </button>
                      </div>
                      {reparseFout && uitgebreid === order.id && (
                        <div style={{ fontSize: 11, color: 'var(--drg-danger)', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 6, padding: '6px 10px', marginBottom: 10, fontFamily: F }}>
                          {reparseFout}
                        </div>
                      )}
                      {order.raw_description && (
                        <details style={{ marginBottom: 10 }}>
                          <summary style={{ fontSize: 10, fontWeight: 600, color: 'var(--drg-text-3)', cursor: 'pointer', fontFamily: F, userSelect: 'none' }}>
                            Raw description (debug)
                          </summary>
                          <pre style={{ fontSize: 10, color: 'var(--drg-text-3)', background: 'rgba(45,69,124,0.04)', border: '1px solid var(--drg-line)', borderRadius: 6, padding: 8, marginTop: 4, overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                            {order.raw_description.slice(0, 1000)}
                          </pre>
                        </details>
                      )}
                      <DetailRij label="Naam" waarde={order.naam} />
                      <DetailRij label="Bedrijfsnaam" waarde={order.bedrijfsnaam} />
                      <DetailRij label="E-mailadres" waarde={order.emailadres} />
                      <DetailRij label="Besteldatum" waarde={order.besteldatum} />
                      <DetailRij label="Bestelnummer" waarde={order.bestelnummer} />
                      <DetailRij label="Adres" waarde={order.adres} />
                      <DetailRij label="Referentie" waarde={order.referentie} />
                      <DetailRij label="Opmerkingen" waarde={order.opmerkingen} />
                      {order.freshdesk_ticket_id && (
                        <DetailRij label="Freshdesk ticket" waarde={`#${order.freshdesk_ticket_id}`} />
                      )}
                    </div>

                    {/* Producten */}
                    {order.producten?.length > 0 && (
                      <div style={{ flex: 1, minWidth: 320 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--drg-text-3)', margin: '0 0 12px', fontFamily: F }}>Bestelde producten</p>
                        <div style={{ borderRadius: 8, border: '1px solid var(--drg-line)', overflow: 'hidden' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 55px 45px 70px', padding: '7px 12px', background: 'rgba(45,69,124,0.04)', gap: 8 }}>
                            {['Lev.nr.', 'Omschrijving', 'Leverweek', 'Aantal', 'VE', 'Totaal'].map(h => (
                              <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--drg-text-3)', fontFamily: F }}>{h}</span>
                            ))}
                          </div>
                          {order.producten.map((p, pi) => (
                            <div key={pi} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 55px 45px 70px', padding: '9px 12px', borderTop: '1px solid var(--drg-line)', gap: 8, alignItems: 'start' }}>
                              <span style={{ fontSize: 12, color: 'var(--drg-ink-2)', fontFamily: F }}>{p.lev_nr || '—'}</span>
                              <span style={{ fontSize: 12, color: 'var(--drg-ink-2)', fontFamily: F, lineHeight: 1.4 }}>{p.omschrijving || '—'}</span>
                              <span style={{ fontSize: 12, color: 'var(--drg-text-3)', fontFamily: F }}>{p.gewenste_leverweek || '—'}</span>
                              <span style={{ fontSize: 12, color: 'var(--drg-text-3)', fontFamily: F, textAlign: 'center' }}>{p.aantal || '—'}</span>
                              <span style={{ fontSize: 12, color: 'var(--drg-text-3)', fontFamily: F, textAlign: 'center' }}>{p.ve || '—'}</span>
                              <span style={{ fontSize: 12, color: 'var(--drg-text-3)', fontFamily: F, textAlign: 'center' }}>{p.totaal_stuks || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
