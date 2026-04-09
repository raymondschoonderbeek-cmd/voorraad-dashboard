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
  aantallen: number | null        // totaal beschikbaar / gekocht
  in_gebruik: number              // aantal gekoppelde gebruikers
  kosten_per_eenheid: number | null  // kosten per licentie/product per maand
  notities: string | null
  created_at: string
  updated_at: string
}

interface GebruikerKoppeling {
  koppeling_id: string
  user_id: string
  email: string
  toegewezen_op: string
  serienummer: string | null
  datum_ingebruik: string | null  // YYYY-MM-DD
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

type CatalogusForm = Omit<CatalogusItem, 'id' | 'created_at' | 'updated_at' | 'in_gebruik'>

const LEEG: CatalogusForm = {
  naam: '', type: 'licentie', categorie: 'Productiviteit', leverancier: '', versie: null, aantallen: null, kosten_per_eenheid: null, notities: null,
}

function formatEuro(bedrag: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bedrag)
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
  initial: CatalogusForm
  onClose: () => void
  onSave: (values: CatalogusForm) => Promise<void>
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
              <label style={labelStyle}>Totaal beschikbaar (gekocht)</label>
              <input style={inputStyle} type="number" min="0" value={form.aantallen ?? ''} onChange={e => set('aantallen', e.target.value === '' ? null : parseInt(e.target.value, 10))} placeholder="bijv. 48" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Kosten per licentie / product (€/maand)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(45,69,124,0.4)', fontSize: '14px', pointerEvents: 'none' }}>€</span>
              <input
                style={{ ...inputStyle, paddingLeft: '28px' }}
                type="number"
                min="0"
                step="0.01"
                value={form.kosten_per_eenheid ?? ''}
                onChange={e => set('kosten_per_eenheid', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="0,00"
              />
            </div>
            {form.kosten_per_eenheid != null && form.aantallen != null && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: 'rgba(45,69,124,0.55)', fontFamily: F }}>
                Totaal: {formatEuro(form.kosten_per_eenheid * form.aantallen)} / maand
              </div>
            )}
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

// ── Gekoppelde gebruiker rij (met inline bewerken) ───────────────────────────

function GebruikerRij({
  g,
  catalogusId,
  isProduct,
  onMutate,
  ontkoppelDisabled,
}: {
  g: GebruikerKoppeling
  catalogusId: string
  isProduct: boolean
  onMutate: () => Promise<void>
  ontkoppelDisabled: boolean
}) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [serienummer, setSerienummer] = useState(g.serienummer ?? '')
  const [datum, setDatum] = useState(g.datum_ingebruik ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function opslaan() {
    setSaving(true)
    try {
      const res = await fetch(`/api/it-cmdb/catalogus/${catalogusId}/gebruikers?user_id=${g.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serienummer: serienummer.trim() || null,
          datum_ingebruik: datum || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Opslaan mislukt')
      await onMutate()
      setEditing(false)
      toast('Gegevens opgeslagen.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Opslaan mislukt', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function ontkoppel() {
    setRemoving(true)
    try {
      const res = await fetch(`/api/it-cmdb/catalogus/${catalogusId}/gebruikers?user_id=${g.user_id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Ontkoppelen mislukt')
      }
      await onMutate()
      toast('Gebruiker ontkoppeld.', 'info')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ontkoppelen mislukt', 'error')
      setRemoving(false)
    }
  }

  const smallInput: React.CSSProperties = {
    ...inputStyle,
    padding: '5px 8px',
    fontSize: '12px',
    borderRadius: '8px',
  }

  return (
    <div style={{ borderRadius: '10px', border: '1px solid rgba(45,69,124,0.1)', background: 'white', overflow: 'hidden' }}>
      {/* Gebruiker header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: DYNAMO_BLUE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.email}>
            {prettyEmail(g.email)}
          </div>
          <div style={{ fontSize: '11px', color: dashboardUi.textMuted }}>{g.email}</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {isProduct && (
            <button
              type="button"
              onClick={() => { setEditing(e => !e); setSerienummer(g.serienummer ?? ''); setDatum(g.datum_ingebruik ?? '') }}
              style={{ borderRadius: '8px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, border: `1px solid rgba(45,69,124,0.2)`, color: DYNAMO_BLUE, background: editing ? 'rgba(45,69,124,0.08)' : 'transparent', fontFamily: F, cursor: 'pointer' }}
            >
              {editing ? 'Sluiten' : 'Bewerk'}
            </button>
          )}
          <button
            type="button"
            disabled={ontkoppelDisabled || removing}
            onClick={() => void ontkoppel()}
            style={{ borderRadius: '8px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c', background: 'transparent', fontFamily: F, cursor: (ontkoppelDisabled || removing) ? 'not-allowed' : 'pointer', opacity: (ontkoppelDisabled || removing) ? 0.5 : 1 }}
          >
            {removing ? '…' : 'Ontkoppelen'}
          </button>
        </div>
      </div>

      {/* Huidige waarden (altijd zichtbaar als gevuld) */}
      {!editing && (g.serienummer || g.datum_ingebruik) && (
        <div style={{ padding: '6px 12px 10px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {g.serienummer && (
            <span style={{ fontSize: '11px', color: '#475569' }}>
              <span style={{ color: 'rgba(45,69,124,0.4)', fontWeight: 600 }}>Serie: </span>
              <span className="font-mono">{g.serienummer}</span>
            </span>
          )}
          {g.datum_ingebruik && (
            <span style={{ fontSize: '11px', color: '#475569' }}>
              <span style={{ color: 'rgba(45,69,124,0.4)', fontWeight: 600 }}>In gebruik: </span>
              {new Date(g.datum_ingebruik).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          )}
        </div>
      )}

      {/* Bewerkformulier */}
      {editing && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid rgba(45,69,124,0.08)', background: 'rgba(45,69,124,0.02)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ ...labelStyle, marginBottom: '3px' }}>Serienummer</label>
              <input
                style={smallInput}
                value={serienummer}
                onChange={e => setSerienummer(e.target.value)}
                placeholder="bijv. SN-ABC12345"
              />
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: '3px' }}>Datum in gebruik</label>
              <input
                style={smallInput}
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setEditing(false)} style={{ borderRadius: '8px', padding: '5px 12px', fontSize: '12px', border: '1px solid rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE, fontFamily: F, cursor: 'pointer' }}>
              Annuleren
            </button>
            <button type="button" disabled={saving} onClick={() => void opslaan()} style={{ borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 700, background: DYNAMO_BLUE, color: 'white', border: 'none', fontFamily: F, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}
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
  const isProduct = item.type === 'product'

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

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={onClose} aria-hidden />
      <div style={{ position: 'relative', background: 'white', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', fontFamily: F }}>

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
          {isProduct && (
            <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'rgba(45,69,124,0.5)' }}>
              Na het koppelen kun je per gebruiker serienummer en datum in gebruik invoeren.
            </p>
          )}
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
                <GebruikerRij
                  key={g.user_id}
                  g={g}
                  catalogusId={item.id}
                  isProduct={isProduct}
                  onMutate={() => mutate().then(() => undefined)}
                  ontkoppelDisabled={false}
                />
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

  // Microsoft licentie-sync
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResultaat, setSyncResultaat] = useState<{
    skus_verwerkt: number
    catalogus_aangemaakt: number
    catalogus_bijgewerkt: number
    koppelingen_toegevoegd: number
    koppelingen_verwijderd: number
    fouten: string[]
  } | null>(null)
  const [syncError, setSyncError] = useState('')

  async function syncMicrosoft() {
    setSyncLoading(true)
    setSyncResultaat(null)
    setSyncError('')
    try {
      const res = await fetch('/api/it-cmdb/catalogus/sync-microsoft', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sync mislukt')
      setSyncResultaat(json)
      await mutate()
      toast('Microsoft licenties gesynchroniseerd.', 'success')
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync mislukt')
    } finally {
      setSyncLoading(false)
    }
  }

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

  async function handleSave(values: CatalogusForm) {
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
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void syncMicrosoft()}
              disabled={syncLoading}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'white', color: DYNAMO_BLUE, border: `1px solid rgba(45,69,124,0.2)`, fontFamily: F }}
              title="Synchroniseer Microsoft 365 licenties en koppel ze aan portalgebruikers"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={syncLoading ? 'animate-spin' : ''}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
              </svg>
              {syncLoading ? 'Bezig...' : 'Sync Microsoft'}
            </button>
            <button
              type="button"
              onClick={() => setModal({ mode: 'create' })}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              style={{ background: DYNAMO_BLUE, fontFamily: F }}
            >
              + Toevoegen
            </button>
          </div>
        </div>

        {/* Statistieken */}
        {(() => {
          const totaalMaand = items.reduce((sum, i) => {
            if (i.kosten_per_eenheid == null) return sum
            return sum + i.kosten_per_eenheid * (i.aantallen ?? i.in_gebruik)
          }, 0)
          const heeftKosten = items.some(i => i.kosten_per_eenheid != null)
          const stats = [
            { label: 'Totaal items', value: String(items.length), sub: null },
            { label: 'Licenties', value: String(items.filter(i => i.type === 'licentie').length), sub: null },
            { label: 'Producten', value: String(items.filter(i => i.type === 'product').length), sub: null },
            ...(heeftKosten ? [{
              label: 'Maandkosten (totaal)',
              value: formatEuro(totaalMaand),
              sub: `${formatEuro(totaalMaand * 12)} / jaar`,
            }] : []),
          ]
          return (
            <div className={`grid gap-3 ${heeftKosten ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {stats.map(s => (
                <div key={s.label} className="rounded-2xl px-4 py-3" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
                  <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'rgba(45,69,124,0.4)', letterSpacing: '0.08em' }}>{s.label}</div>
                  <div className="text-xl font-bold leading-tight" style={{ color: DYNAMO_BLUE, letterSpacing: '-0.02em' }}>
                    {isLoading ? '…' : s.value}
                  </div>
                  {s.sub && !isLoading && (
                    <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.4)' }}>{s.sub}</div>
                  )}
                </div>
              ))}
            </div>
          )
        })()}

        {/* Sync resultaat / fout */}
        {syncError && (
          <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontFamily: F }}>
            {syncError}
          </div>
        )}
        {syncResultaat && (
          <div className="rounded-2xl px-4 py-3 text-sm space-y-1" style={{ background: '#f0fdf4', border: '1px solid rgba(22,163,74,0.2)', fontFamily: F }}>
            <div className="font-semibold" style={{ color: '#15803d' }}>
              Microsoft sync geslaagd — {syncResultaat.skus_verwerkt} SKU&apos;s verwerkt
            </div>
            <div style={{ color: '#166534' }}>
              Catalogus: {syncResultaat.catalogus_aangemaakt} aangemaakt, {syncResultaat.catalogus_bijgewerkt} bijgewerkt &nbsp;·&nbsp;
              Koppelingen: +{syncResultaat.koppelingen_toegevoegd} / −{syncResultaat.koppelingen_verwijderd}
            </div>
            {syncResultaat.fouten.length > 0 && (
              <div style={{ color: '#dc2626' }}>
                Fouten: {syncResultaat.fouten.join(', ')}
              </div>
            )}
          </div>
        )}

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
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(45,69,124,0.08)', background: 'rgba(45,69,124,0.02)' }}>
                    {['Product', 'Gebruik', 'Kosten / mnd', 'Maandtotaal', ''].map(h => (
                      <th key={h} className={`text-left px-4 py-3 text-xs font-bold uppercase whitespace-nowrap ${h === 'Maandtotaal' || h === 'Kosten / mnd' ? 'text-right' : ''}`} style={{ color: DYNAMO_BLUE, letterSpacing: '0.06em', fontFamily: F }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gefilterd.map((item, i) => (
                    <tr key={item.id} className="group transition hover:bg-gray-50/60" style={{ borderBottom: i < gefilterd.length - 1 ? '1px solid rgba(45,69,124,0.06)' : 'none' }}>

                      {/* ── Product ── */}
                      <td className="px-4 py-3" style={{ minWidth: 260 }}>
                        <div className="font-semibold text-sm leading-snug" style={{ color: DYNAMO_BLUE }}>{item.naam}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <TypeBadge type={item.type} />
                          <CategorieBadge cat={item.categorie} />
                          <span className="text-xs" style={{ color: 'rgba(45,69,124,0.45)' }}>{item.leverancier}{item.versie ? ` · ${item.versie}` : ''}</span>
                        </div>
                        {item.notities && (
                          <div className="text-xs mt-1 truncate max-w-xs" style={{ color: '#94a3b8' }} title={item.notities}>{item.notities}</div>
                        )}
                      </td>

                      {/* ── Gebruik ── */}
                      <td className="px-4 py-3" style={{ minWidth: 110 }}>
                        {(() => {
                          const n = item.in_gebruik
                          const max = item.aantallen
                          const overschreden = max != null && n > max
                          const bijna = max != null && n >= max * 0.9 && n <= max
                          const kleur = overschreden ? '#b91c1c' : bijna ? '#d97706' : n > 0 ? '#15803d' : '#94a3b8'
                          const pct = max != null && max > 0 ? Math.min(n / max, 1) : null
                          return (
                            <div>
                              <div className="flex items-baseline gap-1">
                                <span className="font-bold text-base" style={{ color: kleur }}>{n}</span>
                                {max != null && <span className="text-xs" style={{ color: 'rgba(45,69,124,0.4)' }}>/ {max}</span>}
                                {overschreden && <span className="text-xs text-red-600" title="Meer in gebruik dan beschikbaar">⚠</span>}
                              </div>
                              {pct != null && (
                                <div className="mt-1 rounded-full overflow-hidden" style={{ height: 4, width: 72, background: 'rgba(45,69,124,0.08)' }}>
                                  <div style={{ height: '100%', width: `${pct * 100}%`, background: kleur, borderRadius: 9999, transition: 'width 0.3s' }} />
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </td>

                      {/* ── Kosten per stuk ── */}
                      <td className="px-4 py-3 text-right whitespace-nowrap" style={{ minWidth: 110 }}>
                        {item.kosten_per_eenheid != null ? (
                          <span className="font-medium" style={{ color: '#334155' }}>{formatEuro(item.kosten_per_eenheid)}</span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>

                      {/* ── Maandtotaal ── */}
                      <td className="px-4 py-3 text-right whitespace-nowrap" style={{ minWidth: 130 }}>
                        {item.kosten_per_eenheid != null ? (() => {
                          const basis = item.aantallen ?? item.in_gebruik
                          const totaal = item.kosten_per_eenheid * basis
                          return (
                            <div title={`${basis} × ${formatEuro(item.kosten_per_eenheid)}`}>
                              <div className="font-bold" style={{ color: DYNAMO_BLUE }}>{formatEuro(totaal)}</div>
                              <div className="text-xs" style={{ color: 'rgba(45,69,124,0.4)' }}>{formatEuro(totaal * 12)} / jr</div>
                            </div>
                          )
                        })() : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>

                      {/* ── Acties ── */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setGebruikersItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition hover:opacity-80"
                            style={{ border: `1px solid rgba(45,69,124,0.15)`, color: DYNAMO_BLUE, background: 'rgba(45,69,124,0.04)', fontFamily: F }}
                            title="Gebruikers koppelen / beheren"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            {item.in_gebruik > 0 ? item.in_gebruik : ''}
                          </button>
                          <button type="button" onClick={() => setModal({ mode: 'edit', item })} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition hover:opacity-80" style={{ border: `1px solid rgba(45,69,124,0.15)`, color: DYNAMO_BLUE, background: 'transparent', fontFamily: F }} title="Bewerken">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
                          </button>
                          <button type="button" onClick={() => void handleDelete(item)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition hover:opacity-80" style={{ border: '1px solid rgba(220,38,38,0.15)', color: '#b91c1c', background: 'transparent', fontFamily: F }} title="Verwijderen">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
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
          initial={modal.mode === 'edit' ? { naam: modal.item.naam, type: modal.item.type, categorie: modal.item.categorie, leverancier: modal.item.leverancier, versie: modal.item.versie, aantallen: modal.item.aantallen, kosten_per_eenheid: modal.item.kosten_per_eenheid, notities: modal.item.notities } : LEEG}
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
