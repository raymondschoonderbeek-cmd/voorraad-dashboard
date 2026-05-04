'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { IconClock } from '@/components/DashboardIcons'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type FdTicket = {
  id: number
  subject: string
  status: number
  statusLabel: string
  priority: number
  created_at: string
  updated_at: string
  url: string | null
}

type FreshdeskData = {
  geconfigureerd: boolean
  open: FdTicket[]
  historie: FdTicket[]
  gezocht_op?: string[]
  geen_email?: boolean
  fout?: string
}

const PRIORITEIT_LABELS: Record<number, { label: string; kleur: string; bg: string }> = {
  1: { label: 'Laag',    kleur: '#15803d', bg: '#dcfce7' },
  2: { label: 'Normaal', kleur: 'rgba(45,69,124,0.6)', bg: 'rgba(45,69,124,0.08)' },
  3: { label: 'Hoog',    kleur: '#d97706', bg: '#fef9c3' },
  4: { label: 'Urgent',  kleur: '#b91c1c', bg: '#fee2e2' },
}

const STATUS_STIJL: Record<number, { kleur: string; bg: string }> = {
  2: { kleur: '#1d4ed8', bg: '#dbeafe' },   // Open
  3: { kleur: '#d97706', bg: '#fef9c3' },   // In behandeling
  4: { kleur: '#15803d', bg: '#dcfce7' },   // Opgelost
  5: { kleur: 'rgba(45,69,124,0.5)', bg: 'rgba(45,69,124,0.08)' }, // Gesloten
}

function datumKort(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function TicketRij({ t }: { t: FdTicket }) {
  const prio = PRIORITEIT_LABELS[t.priority] ?? PRIORITEIT_LABELS[2]
  const statusStijl = STATUS_STIJL[t.status] ?? { kleur: 'rgba(45,69,124,0.5)', bg: 'rgba(45,69,124,0.08)' }

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--drg-line)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(45,69,124,0.35)' }}>#{t.id}</span>
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: statusStijl.bg, color: statusStijl.kleur }}>{t.statusLabel}</span>
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: prio.bg, color: prio.kleur }}>{prio.label}</span>
        </div>
        {t.url ? (
          <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink-2)', textDecoration: 'none', display: 'block', marginBottom: 4 }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
            {t.subject}
          </a>
        ) : (
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink)', margin: '0 0 4px' }}>{t.subject}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--drg-text-3)' }}>
          <IconClock size={11} />
          <span>Aangemaakt: {datumKort(t.created_at)}</span>
          {t.updated_at !== t.created_at && <span>· Bijgewerkt: {datumKort(t.updated_at)}</span>}
        </div>
      </div>
      {t.url && (
        <a href={t.url} target="_blank" rel="noopener noreferrer" aria-label="Open in Freshdesk"
          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(45,69,124,0.15)', fontSize: 12, fontWeight: 600, color: 'var(--drg-ink-2)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--drg-card)' }}>
          Open →
        </a>
      )}
    </div>
  )
}

function LegeStaat({ tekst }: { tekst: string }) {
  return <p style={{ padding: '20px 16px', fontSize: 13, color: 'var(--drg-text-3)', margin: 0 }}>{tekst}</p>
}

export function TabFreshdesk({ winkelId }: { winkelId: number }) {
  const [subTab, setSubTab] = useState<'open' | 'historie'>('open')
  const { data, isLoading } = useSWR<FreshdeskData>(`/api/winkels/${winkelId}/freshdesk`, fetcher, { revalidateOnFocus: false })

  if (isLoading) return <p style={{ color: 'var(--drg-text-3)', fontSize: 13, padding: 4 }}>Tickets ophalen…</p>

  if (!data?.geconfigureerd) {
    return (
      <div style={{ padding: 16, borderRadius: 10, background: 'var(--drg-card)', border: '1px solid var(--drg-line)' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--drg-text-3)' }}>Freshdesk is niet geconfigureerd op deze server.</p>
      </div>
    )
  }

  if (data.geen_email) {
    return (
      <div style={{ padding: 16, borderRadius: 10, background: 'var(--drg-card)', border: '1px solid var(--drg-line)' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--drg-text-3)' }}>Geen e-mailadres bekend voor deze winkel. Vul het e-mailadres in via het tabblad Contact.</p>
      </div>
    )
  }

  if (data.fout) {
    return (
      <div style={{ padding: 16, borderRadius: 10, background: '#fee2e2', border: '1px solid #fecaca' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>Fout bij ophalen: {data.fout}</p>
      </div>
    )
  }

  const aantalOpen = data.open.length
  const aantalHistorie = data.historie.length

  const subTabStijl = (actief: boolean) => ({
    padding: '6px 14px', border: 'none', borderBottom: actief ? '2px solid var(--drg-ink-2)' : '2px solid transparent',
    background: 'transparent', cursor: 'pointer', fontSize: 13,
    fontWeight: actief ? 700 : 500, color: actief ? 'var(--drg-ink-2)' : 'var(--drg-text-2)',
    whiteSpace: 'nowrap' as const,
  })

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--drg-line)', background: 'var(--drg-card)' }}>
      {/* Sub-tab balk */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--drg-line)', padding: '0 4px' }}>
        <button style={subTabStijl(subTab === 'open')} onClick={() => setSubTab('open')}>
          Openstaand
          {aantalOpen > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>{aantalOpen}</span>
          )}
        </button>
        <button style={subTabStijl(subTab === 'historie')} onClick={() => setSubTab('historie')}>
          Historie
          {aantalHistorie > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(45,69,124,0.08)', color: 'rgba(45,69,124,0.5)' }}>{aantalHistorie}</span>
          )}
        </button>
        {data.gezocht_op && (
          <span style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: 11, color: 'var(--drg-text-3)', alignSelf: 'center' }}>
            {data.gezocht_op.join(', ')}
          </span>
        )}
      </div>

      {/* Ticket lijst */}
      {subTab === 'open' && (
        aantalOpen === 0
          ? <LegeStaat tekst="Geen openstaande tickets." />
          : <div>{data.open.map(t => <TicketRij key={t.id} t={t} />)}</div>
      )}
      {subTab === 'historie' && (
        aantalHistorie === 0
          ? <LegeStaat tekst="Geen gesloten of opgeloste tickets." />
          : <div>{data.historie.map(t => <TicketRij key={t.id} t={t} />)}</div>
      )}
    </div>
  )
}
