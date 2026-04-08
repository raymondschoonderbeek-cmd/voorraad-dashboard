'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import { useToast } from '@/components/Toast'

const F = FONT_FAMILY
const fetcher = (url: string) => fetch(url).then(r => r.json())

type CatalogusType = 'product' | 'licentie'

interface CatalogusItem {
  id: string
  naam: string
  type: CatalogusType
  categorie: string
  leverancier: string
  versie: string | null
  aantallen: number | null
  notities: string | null
  created_at: string
  updated_at: string
}

interface GebruikerKoppeling {
  koppeling_id: string
  user_id: string
  email: string
  toegewezen_op: string
}

interface PortalUser {
  user_id: string
  email: string
}

const CATEGORIE_OPTIES = [
  'Productiviteit', 'Beveiliging', 'Documentbeheer', 'Laptop', 'Desktop',
  'Monitor', 'Accessoire', 'Printer', 'Netwerk', 'Server', 'Telefoon', 'Overig',
]

const CATEGORIE_KLEUREN: Record<string, { bg: string; fg: string }> = {
  Productiviteit: { bg: '#dbeafe', fg: '#1d4ed8' },
  Beveiliging:   { bg: '#fce7f3', fg: '#9d174d' },
  Documentbeheer:{ bg: '#fef9c3', fg: '#854d0e' },
  Laptop:        { bg: '#dcfce7', fg: '#15803d' },
  Desktop:       { bg: '#d1fae5', fg: '#065f46' },
  Monitor:       { bg: '#e0f2fe', fg: '#0369a1' },
  Accessoire:    { bg: '#ede9fe', fg: '#6d28d9' },
  Printer:       { bg: '#ffedd5', fg: '#c2410c' },
  Netwerk:       { bg: '#cffafe', fg: '#0e7490' },
  Server:        { bg: '#fee2e2', fg: '#b91c1c' },
  Telefoon:      { bg: '#fef3c7', fg: '#b45309' },
  Overig:        { bg: 'rgba(45,69,124,0.08)', fg: DYNAMO_BLUE },
}

const LEEG: Omit<CatalogusItem, 'id' | 'created_at' | 'updated_at'> = {
  naam: '', type: 'licentie', categorie: 'Productiviteit', leverancier: '', versie: null, aantallen: null, notities: null,
}

function prettyEmail(email: string) {
  const local = email.split('@')[0] ?? email
  return local.split(/[._-]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function CategorieBadge({ cat }: { cat: string }) {
  const c = CATEGORIE_KLEUREN[cat] ?? CATEGORIE_KLEUREN['Overig']
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>
      {cat}
    </span>
  )
}

function TypeBadge({ type }: { type: CatalogusType }) {
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{
      background: type === 'licentie' ? '#dbeafe' : '#dcfce7',
      color: type === 'licentie' ? '#1d4ed8' : '#15803d',
    }}>
      {type === 'licentie' ? 'Licentie' : 'Product'}
    </span>
  )
}

const inputStyle = {
  background: 'white',
  border: '1px solid rgba(45,69,124,0.2)',
  borderRadius: '10px',
  padding: '8px 12px',
  fontSize: '14px',
  color: '#1e293b',
  fontFamily: F,
  width: '100%',
  outline: 'none',
} as const

const labelStyle = {
  fontSize: '12px', fontWeight: 600, color: 'rgba(45,69,124,0.6)',
  fontFamily: F, display: 'block', marginBottom: '4px',
} as const

// ── Item formulier modal ──────────────────────────────────────────────────────

function FormModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: Omit<CatalogusItem, 'id' | 'created_at' | 'updated_at'>
  onClose: () => void
  onSave: (values: Omit<CatalogusItem, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  saving: boolean
}) {
  const [form, setForm] = useState(initial)
  function set(field: string, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={onClose} aria-hidden />
      <div style={{ position: 'relative', background: 'white', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', fontFamily: F }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: DYNAMO_BLUE, margin: '0 0 20px' }}>
          {initial.naam ? 'Item bewerken' : 'Nieuw item toevoegen'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Naam *</label>
            <input style={inputStyle} value={form.naam} onChange={e => set('naam', e.target.value)} placeholder="bijv. Microsoft 365 Business Premium" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Type *</label>
              <select style={inputStyle} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="licentie">Licentie</option>
                <option value="product">Product</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Categorie *</label>
              <select style={inputStyle} value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                {CATEGORIE_OPTIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Leverancier *</label>
            <input style={inputStyle} value={form.leverancier} onChange={e => set('leverancier', e.target.value)} placeholder="bijv. Microsoft, Dell, Adobe" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Versie</label>
              <input style={inputStyle} value={form.versie ?? ''} onChange={e => set('versie', e.target.value || null)} placeholder="bijv. 2024" />
            </div>
            <div>
              <label style={labelStyle}>Aantal licenties / stuks</label>
              <input style={inputStyle} type="number" min="0" value={form.aantallen ?? ''} onChange={e => set('aantallen', e.target.value === '' ? null : parseInt(e.target.value, 10))} placeholder="bijv. 48" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Notities</label>
            <textarea style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }} value={form.notities ?? ''} onChange={e => set('notities', e.target.value || null)} placeholder="Optionele opmerkingen…" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ borderRadius: '10px', padding: '8px 16px', fontSize: '14px', border: '1px solid rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE, fontFamily: F, cursor: 'pointer' }}>
            Annuleren
          </button>
          <button type="button" disabled={saving || !form.naam.trim() || !form.leverancier.trim()} onClick={() => void onSave(form)} style={{ borderRadius: '10px', padding: '8px 20px', fontSize: '14px', fontWeight: 700, background: DYNAMO_BLUE, color: 'white', border: 'none', fontFamily: F, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Gebruikers-koppeling modal ────────────────────────────────────────────────

function GebruikersModal({
  item,
  onClose,
}: {
  item: CatalogusItem
  onClose: () => void
}) {
  const toast = useToast()
  const { data: gekoppeldData, mutate } = useSWR<{ gebruikers: GebruikerKoppeling[] }>(
    `/api/it-cmdb/catalogus/${item.id}/gebruikers`, fetcher
  )
  const { data: portalData } = useSWR<{ users: PortalUser[] }>('/api/it-cmdb/portal-users', fetcher)

  const gekoppeld = gekoppeldData?.gebruikers ?? []
  const gekoppeldeIds = new Set(gekoppeld.map(g => g.user_id))
  const beschikbaar = (portalData?.users ?? []).filter(u => !gekoppeldeIds.has(u.user_id))

  const [selectedUserId, setSelectedUserId] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function koppel() {
    if (!selectedUserId) return
    setAdding(true)
    try {
      const res = await fetch(`/api/it-cmdb/catalogus/${item.id}/gebruikers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUserId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Koppelen mislukt')
      await mutate()
      setSelectedUserId('')
      toast('Gebruiker gekoppeld.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Koppelen mislukt', 'error')
    } finally {
      setAdding(false)
    }
  }

  async function ontkoppel(g: GebruikerKoppeling) {
    setRemovingId(g.user_id)
    try {
      const res = await fetch(`/api/it-cmdb/catalogus/${item.id}/gebruikers?user_id=${g.user_id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Ontkoppelen mislukt')
      }
      await mutate()
      toast('Gebruiker ontkoppeld.', 'info')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ontkoppelen mislukt', 'error')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={onClose} aria-hidden />
      <div style={{ position: 'relative', background: 'white', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', fontFamily: F }}>

        {/* Header */}
        <div style={{ marginBottom: '4px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: DYNAMO_BLUE, margin: '0 0 4px' }}>Gebruikers koppelen</h2>
          <p style={{ margin: 0, fontSize: '13px', color: dashboardUi.textMuted }}>{item.naam}</p>
        </div>

        {/* Toevoegen */}
        <div style={{ marginTop: '20px', padding: '14px', borderRadius: '12px', background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)' }}>
          <label style={labelStyle}>Gebruiker toevoegen</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              style={{ ...inputStyle, flex: 1 }}
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              disabled={beschikbaar.length === 0}
            >
              <option value="">{beschikbaar.length === 0 ? 'Alle gebruikers al gekoppeld' : '— Kies een gebruiker —'}</option>
              {beschikbaar.map(u => (
                <option key={u.user_id} value={u.user_id}>{u.email}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedUserId || adding}
              onClick={() => void koppel()}
              style={{ borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, background: DYNAMO_BLUE, color: 'white', border: 'none', fontFamily: F, cursor: (!selectedUserId || adding) ? 'not-allowed' : 'pointer', opacity: (!selectedUserId || adding) ? 0.5 : 1, whiteSpace: 'nowrap' }}
            >
              {adding ? '…' : 'Koppelen'}
            </button>
          </div>
        </div>

        {/* Gekoppelde gebruikers */}
        <div style={{ marginTop: '16px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 600, color: 'rgba(45,69,124,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Gekoppeld ({gekoppeld.length})
          </p>
          {!gekoppeldData ? (
            <p style={{ fontSize: '13px', color: dashboardUi.textMuted }}>Laden…</p>
          ) : gekoppeld.length === 0 ? (
            <p style={{ fontSize: '13px', color: dashboardUi.textMuted }}>Nog geen gebruikers gekoppeld.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {gekoppeld.map(g => (
                <div key={g.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(45,69,124,0.1)', background: 'white' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: DYNAMO_BLUE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.email}>
                      {prettyEmail(g.email)}
                    </div>
                    <div style={{ fontSize: '11px', color: dashboardUi.textMuted }}>{g.email}</div>
                  </div>
                  <button
                    type="button"
                    disabled={removingId === g.user_id}
                    onClick={() => void ontkoppel(g)}
                    style={{ borderRadius: '8px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c', background: 'transparent', fontFamily: F, cursor: removingId === g.user_id ? 'not-allowed' : 'pointer', opacity: removingId === g.user_id ? 0.5 : 1, flexShrink: 0 }}
                  >
                    {removingId === g.user_id ? '…' : 'Ontkoppelen'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ borderRadius: '10px', padding: '8px 20px', fontSize: '14px', border: '1px solid rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE, fontFamily: F, cursor: 'pointer' }}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function CatalogusPage() {
  const toast = useToast()
  const { data, error, isLoading, mutate } = useSWR<{ items: CatalogusItem[] }>('/api/it-cmdb/catalogus', fetcher)
  const items = data?.items ?? []

  const [filter, setFilter] = useState<'alle' | CatalogusType>('alle')
  const [zoek, setZoek] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; item: CatalogusItem }>( null)
  const [gebruikersItem, setGebruikersItem] = useState<CatalogusItem | null>(null)
  const [saving, setSaving] = useState(false)

  const gefilterd = items.filter(item => {
    if (filter !== 'alle' && item.type !== filter) return false
    if (zoek.trim()) {
      const q = zoek.toLowerCase()
      return (
        item.naam.toLowerCase().includes(q) ||
        item.leverancier.toLowerCase().includes(q) ||
        item.categorie.toLowerCase().includes(q) ||
        (item.notities ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  async function handleSave(values: Omit<CatalogusItem, 'id' | 'created_at' | 'updated_at'>) {
    setSaving(true)
    try {
      if (modal?.mode === 'edit') {
        const res = await fetch(`/api/it-cmdb/catalogus/${modal.item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Opslaan mislukt')
        await mutate()
        toast('Item bijgewerkt.', 'success')
      } else {
        const res = await fetch('/api/it-cmdb/catalogus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Toevoegen mislukt')
        await mutate()
        toast('Item toegevoegd.', 'success')
      }
      setModal(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Er ging iets mis.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item: CatalogusItem) {
    if (!confirm(`"${item.naam}" verwijderen?`)) return
    try {
      const res = await fetch(`/api/it-cmdb/catalogus/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Verwijderen mislukt')
      }
      await mutate()
      toast(`"${item.naam}" verwijderd.`, 'info')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Verwijderen mislukt.', 'error')
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-center gap-2 py-2 min-h-[56px]">
          <Link href="/dashboard/it-cmdb" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90">
            ← IT-hardware
          </Link>
          <span className="text-white text-sm font-semibold">Product &amp; licentie catalogus</span>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-5 max-w-[1200px] mx-auto w-full space-y-5">

        {/* Kop */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="m-0 text-xl sm:text-2xl font-bold" style={{ color: DYNAMO_BLUE }}>
              Product &amp; licentie catalogus
            </h1>
            <p className="m-0 mt-1 text-sm" style={{ color: dashboardUi.textMuted }}>
              Overzicht van software-licenties en IT-producten. Koppel items aan portalgebruikers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-white shrink-0 transition hover:opacity-90"
            style={{ background: DYNAMO_BLUE, fontFamily: F }}
          >
            + Toevoegen
          </button>
        </div>

        {/* Statistieken */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Totaal items', value: items.length },
            { label: 'Licenties', value: items.filter(i => i.type === 'licentie').length },
            { label: 'Producten', value: items.filter(i => i.type === 'product').length },
          ].map(s => (
            <div key={s.label} className="rounded-2xl px-4 py-3" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
              <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'rgba(45,69,124,0.4)', letterSpacing: '0.08em' }}>{s.label}</div>
              <div className="text-2xl font-bold" style={{ color: DYNAMO_BLUE, letterSpacing: '-0.03em' }}>
                {isLoading ? '…' : s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Filter + zoek */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex gap-2">
            {(['alle', 'licentie', 'product'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                style={{
                  background: filter === t ? DYNAMO_BLUE : 'white',
                  color: filter === t ? 'white' : DYNAMO_BLUE,
                  border: `1px solid ${filter === t ? DYNAMO_BLUE : 'rgba(45,69,124,0.15)'}`,
                  fontFamily: F,
                }}
              >
                {t === 'alle' ? 'Alle' : t === 'licentie' ? 'Licenties' : 'Producten'}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Zoek op naam, leverancier of categorie…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="flex-1 rounded-xl px-3 py-2 text-sm"
            style={{ background: 'white', border: '1px solid rgba(45,69,124,0.15)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
          />
        </div>

        {/* Tabel */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
          {isLoading ? (
            <div className="p-8 text-center text-sm" style={{ color: dashboardUi.textMuted }}>Laden…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-600">Kon catalogus niet laden. Controleer je toegangsrechten.</div>
          ) : gefilterd.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
              {items.length === 0 ? (
                <span>Nog geen items. <button type="button" onClick={() => setModal({ mode: 'create' })} className="underline" style={{ color: DYNAMO_BLUE }}>Voeg het eerste item toe →</button></span>
              ) : 'Geen items gevonden voor dit filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(45,69,124,0.08)', background: 'rgba(45,69,124,0.02)' }}>
                    {['Naam', 'Type', 'Categorie', 'Leverancier', 'Versie', 'Aantal', 'Notities', 'Gebruikers', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase whitespace-nowrap" style={{ color: DYNAMO_BLUE, letterSpacing: '0.06em', fontFamily: F }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gefilterd.map((item, i) => (
                    <tr key={item.id} style={{ borderBottom: i < gefilterd.length - 1 ? '1px solid rgba(45,69,124,0.06)' : 'none' }}>
                      <td className="px-4 py-3 font-semibold max-w-[180px] truncate" style={{ color: DYNAMO_BLUE }} title={item.naam}>{item.naam}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><TypeBadge type={item.type} /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><CategorieBadge cat={item.categorie} /></td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: '#334155' }}>{item.leverancier}</td>
                      <td className="px-4 py-3" style={{ color: '#64748b' }}>{item.versie ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: item.aantallen != null ? DYNAMO_BLUE : '#94a3b8' }}>
                        {item.aantallen != null ? `${item.aantallen}×` : '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[160px] truncate" style={{ color: '#94a3b8' }} title={item.notities ?? ''}>{item.notities || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setGebruikersItem(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80"
                          style={{ border: `1px solid rgba(45,69,124,0.15)`, color: DYNAMO_BLUE, background: 'rgba(45,69,124,0.04)', fontFamily: F }}
                          title="Gebruikers koppelen / beheren"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          Gebruikers
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setModal({ mode: 'edit', item })} className="rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80" style={{ border: `1px solid rgba(45,69,124,0.15)`, color: DYNAMO_BLUE, background: 'transparent', fontFamily: F }}>
                            Bewerk
                          </button>
                          <button type="button" onClick={() => void handleDelete(item)} className="rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80" style={{ border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c', background: 'transparent', fontFamily: F }}>
                            Verwijder
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {modal && (
        <FormModal
          initial={modal.mode === 'edit' ? { naam: modal.item.naam, type: modal.item.type, categorie: modal.item.categorie, leverancier: modal.item.leverancier, versie: modal.item.versie, aantallen: modal.item.aantallen, notities: modal.item.notities } : LEEG}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {gebruikersItem && (
        <GebruikersModal
          item={gebruikersItem}
          onClose={() => setGebruikersItem(null)}
        />
      )}
    </div>
  )
}
