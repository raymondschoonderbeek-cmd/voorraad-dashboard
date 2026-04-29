'use client'

import { useState } from 'react'
import useSWR from 'swr'
import * as XLSX from 'xlsx'
import type { WorkflowStap } from '@/app/api/admin/gazelle-observer/route'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const F = "'Outfit', sans-serif"

type PakketInstelling = { aantal: number }
type ObserverInstellingen = {
  webhook_secret: string | null
  actief: boolean
  pakket_instellingen: Record<string, PakketInstelling>
}

const PAKKETTEN = ['A', 'B', 'C', 'D', 'E', 'F'] as const

function PakketInstellingenCard() {
  const { data: inst, mutate } = useSWR<ObserverInstellingen>('/api/admin/gazelle-observer', fetcher)
  const [ingeklapt, setIngeklapt] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [opgeslagen, setOpgeslagen] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  // Sla lokale invoerwaarden op per pakket (string zodat de input altijd editable is)
  const [lokaal, setLokaal] = useState<Record<string, string>>({})

  const serverAantallen = inst?.pakket_instellingen ?? {}

  function getWaarde(pakket: string): string {
    if (pakket in lokaal) return lokaal[pakket]
    const server = serverAantallen[pakket]?.aantal
    return server !== undefined ? String(server) : ''
  }

  async function slaOp() {
    setBezig(true)
    setOpgeslagen(false)
    setFout(null)
    const pakket_instellingen = Object.fromEntries(
      PAKKETTEN.map(p => [p, { aantal: parseInt(lokaal[p] ?? String(serverAantallen[p]?.aantal ?? 0)) || 0 }])
    )
    const res = await fetch('/api/admin/gazelle-observer', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pakket_instellingen }),
    })
    const json = await res.json() as { ok?: boolean; error?: string }
    await mutate()
    setBezig(false)
    if (!res.ok) {
      setFout(json.error ?? 'Opslaan mislukt')
    } else {
      setLokaal({}) // reset: inputs tonen nu server-waarden
      setOpgeslagen(true)
      setTimeout(() => setOpgeslagen(false), 2500)
    }
  }

  return (
    <div style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, boxShadow: 'var(--drg-card-shadow)', marginBottom: 24, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setIngeklapt(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--drg-ink-2)', margin: 0, fontFamily: F }}>Beschikbaarheid</h2>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--drg-text-3)', flexShrink: 0, transform: ingeklapt ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} aria-hidden>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {!ingeklapt && (
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {PAKKETTEN.map(p => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink-2)', fontFamily: F, width: 70, flexShrink: 0 }}>Pakket {p}</span>
                <input
                  type="number"
                  min={0}
                  value={getWaarde(p)}
                  onChange={e => setLokaal(prev => ({ ...prev, [p]: e.target.value }))}
                  placeholder="0"
                  style={{ width: 90, fontSize: 13, fontFamily: F, fontWeight: 600, color: 'var(--drg-ink-2)', background: 'rgba(45,69,124,0.05)', border: '1px solid rgba(45,69,124,0.2)', borderRadius: 6, padding: '5px 10px', outline: 'none', textAlign: 'right' }}
                />
                <span style={{ fontSize: 12, color: 'var(--drg-text-3)', fontFamily: F }}>stuks beschikbaar</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void slaOp()}
            disabled={bezig}
            style={{ fontSize: 12, fontWeight: 600, color: opgeslagen ? 'var(--drg-success)' : 'var(--drg-ink-2)', background: opgeslagen ? 'rgba(22,163,74,0.08)' : 'rgba(45,69,124,0.08)', border: `1px solid ${opgeslagen ? 'rgba(22,163,74,0.2)' : 'rgba(45,69,124,0.2)'}`, borderRadius: 8, padding: '7px 16px', cursor: bezig ? 'default' : 'pointer', fontFamily: F, opacity: bezig ? 0.6 : 1, transition: 'all 0.2s' }}
          >
            {opgeslagen ? '✓ Opgeslagen' : bezig ? 'Opslaan…' : 'Opslaan'}
          </button>
          {fout && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--drg-danger)', fontFamily: F }}>{fout}</div>}
        </div>
      )}
    </div>
  )
}

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
  const [ingeklapt, setIngeklapt] = useState(true)
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
    <div style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, boxShadow: 'var(--drg-card-shadow)', marginBottom: 24, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setIngeklapt(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--drg-ink-2)', margin: 0, fontFamily: F }}>Freshdesk Observer instellen</h2>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--drg-text-3)', flexShrink: 0, transform: ingeklapt ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} aria-hidden>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {!ingeklapt && <div style={{ padding: '0 20px 16px' }}>

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
      </div>}
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
}


function extractLidnummer(naam: string): string {
  return naam.match(/^(\d+)\s/)?.[1] ?? ''
}

function extractNaamZonderLidnummer(naam: string): string {
  return naam.replace(/^\d+\s+/, '').trim()
}

function extractWoonplaats(adres: string): string {
  // Postcode-formaat: 4 cijfers + 2 letters + plaatsnaam (bijv. "3824 ML AMERSFOORT")
  const match = adres.match(/\d{4}\s+[A-Z]{2}\s+([A-Za-z\sÀ-ɏ\-]+)/i)
  if (match?.[1]) return match[1].trim()
  // Fallback: na de laatste komma
  const idx = adres.lastIndexOf(',')
  return idx >= 0 ? adres.slice(idx + 1).trim() : ''
}

function extractPakket(levNr: string): string {
  return levNr.match(/Pakket\s+([A-F])/i)?.[1]?.toUpperCase() ?? levNr
}

function exporteerNaarExcel(orders: GazelleOrder[]) {
  const rijen: Record<string, string>[] = []
  for (const order of orders) {
    const naam = order.naam ?? ''
    const producten = order.producten ?? []
    const pakketProducten = producten.filter(p => /^pakket\s+[A-F]/i.test(p.lev_nr))
    if (pakketProducten.length === 0) {
      rijen.push({
        'Lidnummer': extractLidnummer(naam),
        'Naam': extractNaamZonderLidnummer(naam),
        'Woonplaats': extractWoonplaats(order.adres ?? ''),
        'Pakket': '',
        'Bestelnummer DRG': order.bestelnummer ?? '',
        'Besteldatum': order.besteldatum ?? '',
        'Aantal': '',
      })
    } else {
      for (const product of pakketProducten) {
        rijen.push({
          'Lidnummer': extractLidnummer(naam),
          'Naam': extractNaamZonderLidnummer(naam),
          'Woonplaats': extractWoonplaats(order.adres ?? ''),
          'Pakket': extractPakket(product.lev_nr),
          'Bestelnummer DRG': order.bestelnummer ?? '',
          'Besteldatum': order.besteldatum ?? '',
          'Aantal': product.totaal_stuks || product.aantal || '',
        })
      }
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

type SessionInfo = { isAdmin?: boolean; moduleRollen?: Record<string, string> }

export default function GazellePakketOrders() {
  const { data, isLoading, mutate } = useSWR<GazelleOrder[]>('/api/gazelle-orders', fetcher)
  // Beschikbaarheid is toegankelijk voor alle gazelle-orders gebruikers (niet admin-only)
  const { data: beschikbaarheidData } = useSWR<Record<string, { aantal: number }>>('/api/gazelle-orders/beschikbaarheid', fetcher)
  const { data: session } = useSWR<SessionInfo>('/api/auth/session-info', fetcher)
  const [uitgebreid, setUitgebreid] = useState<string | null>(null)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowEdit, setWorkflowEdit] = useState(false)
  const [workflowLokaal, setWorkflowLokaal] = useState<WorkflowStap[]>([])
  const [workflowOpslaan, setWorkflowOpslaan] = useState(false)
  const { data: workflowData, mutate: mutateWorkflow } = useSWR<{ workflow: WorkflowStap[] }>('/api/gazelle-orders/workflow', fetcher)
  const [reparseBezig, setReparseBezig] = useState<string | null>(null)
  const [reparseFout, setReparseFout] = useState<string | null>(null)
  const [zoek, setZoek] = useState('')
  const [pagina, setPagina] = useState(1)
  const PER_PAGINA = 25

  const orders: GazelleOrder[] = Array.isArray(data) ? data : []
  const fout = data && !Array.isArray(data)

  const gefilterd = zoek.trim()
    ? orders.filter(o => {
        const q = zoek.toLowerCase()
        return (
          o.naam?.toLowerCase().includes(q) ||
          o.bestelnummer?.toLowerCase().includes(q) ||
          o.emailadres?.toLowerCase().includes(q) ||
          o.adres?.toLowerCase().includes(q) ||
          extractPakket(o.producten?.[0]?.lev_nr ?? '').toLowerCase().includes(q) ||
          extractLidnummer(o.naam ?? '').includes(q)
        )
      })
    : orders

  const aantalPaginas = Math.max(1, Math.ceil(gefilterd.length / PER_PAGINA))
  const huidigePagina = Math.min(pagina, aantalPaginas)
  const paginaOrders = gefilterd.slice((huidigePagina - 1) * PER_PAGINA, huidigePagina * PER_PAGINA)

  // Admin-kaarten alleen tonen voor globale admins of gazelle-orders beheerders
  const isAdmin = session?.isAdmin ?? false
  const moduleRol = session?.moduleRollen?.['gazelle-orders']
  const isGazelleAdmin = isAdmin || moduleRol === 'admin'
  const isBewerker = isGazelleAdmin || moduleRol === 'bewerker'

  async function herparser(id: string) {
    setReparseBezig(id)
    setReparseFout(null)
    const res = await fetch(`/api/gazelle-orders?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reparse: true }),
    })
    const json = await res.json() as { ok?: boolean; error?: string }
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
          <a
            href="https://docs.google.com/spreadsheets/d/1EarqsTA86m0uvFUqDPlrES1b4L3fnVQmnGqZ6L1Lid8/edit?gid=0#gid=0"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(45,69,124,0.07)', border: '1px solid rgba(45,69,124,0.15)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--drg-ink-2)', textDecoration: 'none', fontFamily: F, flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Google Sheet
          </a>
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

      {/* Workflow uitleg */}
      <div style={{ marginBottom: 20, border: '1px solid var(--drg-card-border)', borderRadius: 10, overflow: 'hidden', background: 'var(--drg-card-bg)', boxShadow: 'var(--drg-card-shadow)' }}>
        <button
          type="button"
          onClick={() => setWorkflowOpen(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink-2)', fontFamily: F, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: 'var(--drg-text-3)' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Hoe werkt het?
          </span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--drg-text-3)', transform: workflowOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} aria-hidden><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {workflowOpen && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--drg-line)' }}>
            {/* Edit-modus voor admins */}
            {isGazelleAdmin && (
              <div style={{ marginTop: 12, marginBottom: 4, display: 'flex', justifyContent: 'flex-end' }}>
                {workflowEdit ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setWorkflowEdit(false)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--drg-text-3)', background: 'none', border: '1px solid var(--drg-line)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: F }}>Annuleren</button>
                    <button type="button" disabled={workflowOpslaan} onClick={async () => {
                      setWorkflowOpslaan(true)
                      await fetch('/api/admin/gazelle-observer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow_tekst: workflowLokaal }) })
                      await mutateWorkflow()
                      setWorkflowOpslaan(false)
                      setWorkflowEdit(false)
                    }} style={{ fontSize: 11, fontWeight: 600, color: 'var(--drg-success)', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: F, opacity: workflowOpslaan ? 0.5 : 1 }}>
                      {workflowOpslaan ? 'Opslaan…' : '✓ Opslaan'}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setWorkflowLokaal(workflowData?.workflow ?? []); setWorkflowEdit(true) }} style={{ fontSize: 11, fontWeight: 600, color: 'var(--drg-ink-2)', background: 'rgba(45,69,124,0.07)', border: '1px solid rgba(45,69,124,0.15)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: F }}>
                    Bewerken
                  </button>
                )}
              </div>
            )}

            {workflowEdit ? (
              /* Bewerkmodus: stap-naam + tekst per stap */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                {workflowLokaal.map((s, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input
                      value={s.stap}
                      onChange={e => setWorkflowLokaal(prev => prev.map((x, j) => j === i ? { ...x, stap: e.target.value } : x))}
                      placeholder="Stap naam"
                      style={{ fontSize: 12, fontWeight: 700, fontFamily: F, color: 'var(--drg-ink-2)', background: 'rgba(45,69,124,0.05)', border: '1px solid rgba(45,69,124,0.2)', borderRadius: 6, padding: '5px 10px', outline: 'none' }}
                    />
                    <textarea
                      value={s.tekst}
                      onChange={e => setWorkflowLokaal(prev => prev.map((x, j) => j === i ? { ...x, tekst: e.target.value } : x))}
                      rows={3}
                      style={{ fontSize: 12, fontFamily: F, color: 'var(--drg-ink-2)', background: 'rgba(45,69,124,0.05)', border: '1px solid rgba(45,69,124,0.2)', borderRadius: 6, padding: '5px 10px', outline: 'none', resize: 'vertical' }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              /* Leesmodus */
              <ol style={{ margin: '12px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(workflowData?.workflow ?? []).map((s, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--drg-ink-2)', fontFamily: F, lineHeight: 1.5 }}>
                    <strong>{s.stap}:</strong>{' '}
                    <span style={{ color: 'var(--drg-text-3)' }}>{s.tekst}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Stat-kaarten — altijd zichtbaar voor iedereen met toegang */}
      {(() => {
        const beschikbaar = beschikbaarheidData ?? {}
        const telPakket = (letter: string) =>
          orders.reduce((acc, o) =>
            acc + (o.producten ?? [])
              .filter(p => extractPakket(p.lev_nr) === letter)
              .reduce((som, p) => som + (parseInt(p.totaal_stuks || p.aantal || '0') || 0), 0)
          , 0)

        const stats = [
          { label: 'Totaal orders', orders: orders.length, beschikbaar: null },
          ...PAKKETTEN.map(p => ({
            label: `Pakket ${p}`,
            orders: telPakket(p),
            beschikbaar: beschikbaar[p]?.aantal ?? null,
          })),
        ]

        if (stats.length === 0) return null
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 24 }}>
            {stats.map(s => {
              const resterend = s.beschikbaar !== null ? s.beschikbaar - s.orders : null
              return (
                <div key={s.label} style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, padding: '12px 14px', boxShadow: 'var(--drg-card-shadow)' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--drg-ink-2)', fontFamily: F, lineHeight: 1 }}>{s.orders}</div>
                  <div style={{ fontSize: 11, color: 'var(--drg-text-3)', fontFamily: F, marginTop: 3 }}>{s.label}</div>
                  {s.beschikbaar !== null && (
                    <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px solid var(--drg-line)', paddingTop: 7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: F }}>
                        <span style={{ color: 'var(--drg-text-3)' }}>Beschikbaar</span>
                        <span style={{ fontWeight: 600, color: 'var(--drg-ink-2)' }}>{s.beschikbaar}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: F }}>
                        <span style={{ color: 'var(--drg-text-3)' }}>Resterend</span>
                        <span style={{ fontWeight: 700, color: resterend !== null && resterend <= 0 ? 'var(--drg-danger)' : 'var(--drg-success)' }}>
                          {resterend}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {isGazelleAdmin && <ObserverInstellingenCard />}
      {isGazelleAdmin && <PakketInstellingenCard />}

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
        <>
          {/* Zoekbalk */}
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--drg-text-3)', pointerEvents: 'none' }} aria-hidden><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="search"
                value={zoek}
                onChange={e => { setZoek(e.target.value); setPagina(1) }}
                placeholder="Zoek op naam, bestelnr., pakket, woonplaats…"
                style={{ width: '100%', paddingLeft: 32, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, fontFamily: F, color: 'var(--drg-ink-2)', background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 8, outline: 'none' }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--drg-text-3)', fontFamily: F, whiteSpace: 'nowrap' }}>
              {gefilterd.length} {gefilterd.length === 1 ? 'order' : 'orders'}
              {zoek.trim() ? ` gevonden` : ''}
            </span>
          </div>

        <div style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--drg-card-shadow)' }}>

          {/* Tabelheader */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 1fr 1fr', padding: '10px 16px', borderBottom: '1px solid var(--drg-line)', background: 'rgba(45,69,124,0.03)', gap: 12 }}>
            {['Ontvangen', 'Bestelnr.', 'Naam', 'Product'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--drg-text-3)', fontFamily: F }}>{h}</span>
            ))}
          </div>

          {paginaOrders.length === 0 && (
            <p style={{ margin: 0, padding: '20px 16px', fontSize: 13, color: 'var(--drg-text-3)', fontFamily: F }}>Geen orders gevonden.</p>
          )}

          {paginaOrders.map((order, i) => {
            const isOpen = uitgebreid === order.id
            const isLast = i === paginaOrders.length - 1
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
                    display: 'grid', gridTemplateColumns: '130px 110px 1fr 1fr',
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
                    {order.producten?.length > 1
                      ? order.producten.map(p => extractPakket(p.lev_nr)).filter(Boolean).join(', ')
                      : (hoofdProduct?.omschrijving ?? '—')}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ padding: '20px 20px 24px', borderBottom: isLast ? 'none' : '1px solid var(--drg-line)', background: 'rgba(45,69,124,0.02)', display: 'flex', gap: 40, flexWrap: 'wrap' }}>

                    {/* Klantgegevens */}
                    <div style={{ minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--drg-text-3)', margin: 0, fontFamily: F }}>Klantgegevens</p>
                        {isBewerker && (
                          <button
                            type="button"
                            disabled={reparseBezig === order.id}
                            onClick={e => { e.stopPropagation(); void herparser(order.id) }}
                            style={{ fontSize: 10, fontWeight: 600, color: 'var(--drg-ink-2)', background: 'rgba(45,69,124,0.07)', border: '1px solid rgba(45,69,124,0.15)', borderRadius: 5, padding: '2px 8px', cursor: reparseBezig === order.id ? 'default' : 'pointer', fontFamily: F, opacity: reparseBezig === order.id ? 0.5 : 1 }}
                          >
                            {reparseBezig === order.id ? 'Bezig…' : 'Opnieuw parsen'}
                          </button>
                        )}
                      </div>
                      {reparseFout && uitgebreid === order.id && (
                        <div style={{ fontSize: 11, color: 'var(--drg-danger)', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 6, padding: '6px 10px', marginBottom: 6, fontFamily: F }}>
                          {reparseFout}
                        </div>
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

          {/* Paginering */}
          {aantalPaginas > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontFamily: F }}>
              <span style={{ fontSize: 12, color: 'var(--drg-text-3)' }}>
                Pagina {huidigePagina} van {aantalPaginas} · {gefilterd.length} orders
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  disabled={huidigePagina === 1}
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--drg-ink-2)', background: 'rgba(45,69,124,0.07)', border: '1px solid rgba(45,69,124,0.15)', borderRadius: 7, padding: '5px 12px', cursor: huidigePagina === 1 ? 'default' : 'pointer', opacity: huidigePagina === 1 ? 0.4 : 1, fontFamily: F }}
                >
                  ← Vorige
                </button>
                <button
                  type="button"
                  disabled={huidigePagina === aantalPaginas}
                  onClick={() => setPagina(p => Math.min(aantalPaginas, p + 1))}
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--drg-ink-2)', background: 'rgba(45,69,124,0.07)', border: '1px solid rgba(45,69,124,0.15)', borderRadius: 7, padding: '5px 12px', cursor: huidigePagina === aantalPaginas ? 'default' : 'pointer', opacity: huidigePagina === aantalPaginas ? 0.4 : 1, fontFamily: F }}
                >
                  Volgende →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
