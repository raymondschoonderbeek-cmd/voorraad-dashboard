'use client'

import { useState, useMemo } from 'react'
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
  naam: string
}

type AanvraagStatus = 'ingediend' | 'wacht_op_manager' | 'goedgekeurd' | 'afgekeurd'

interface Aanvraag {
  id: string
  catalogus_id: string
  catalogus_naam: string
  aanvrager_naam: string
  aanvrager_email: string
  manager_naam: string | null
  manager_email: string | null
  motivatie: string | null
  status: AanvraagStatus
  manager_beslissing_op: string | null
  manager_notitie: string | null
  created_at: string
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
  const beschikbaar = useMemo(() => {
    const ids = new Set(gekoppeld.map(g => g.user_id))
    return (portalData?.users ?? [])
      .filter(u => !ids.has(u.user_id) && u.email)
      .sort((a, b) => (a.naam || a.email).localeCompare(b.naam || b.email, 'nl'))
  }, [portalData, gekoppeld])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoek, setZoek] = useState('')
  const [adding, setAdding] = useState(false)
  const isProduct = item.type === 'product'

  const zoekResultaten = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    if (!q) return beschikbaar
    return beschikbaar.filter(u =>
      (u.naam || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [beschikbaar, zoek])

  function toggleUser(userId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })
  }

  function toggleAll() {
    if (zoekResultaten.every(u => selectedIds.has(u.user_id))) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        zoekResultaten.forEach(u => next.delete(u.user_id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        zoekResultaten.forEach(u => next.add(u.user_id))
        return next
      })
    }
  }

  async function koppel() {
    if (selectedIds.size === 0) return
    setAdding(true)
    try {
      const ids = [...selectedIds]
      const results = await Promise.allSettled(
        ids.map(uid =>
          fetch(`/api/it-cmdb/catalogus/${item.id}/gebruikers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: uid }),
          }).then(r => r.ok ? r.json() : r.json().then((j: { error?: string }) => Promise.reject(new Error(j.error ?? 'Koppelen mislukt'))))
        )
      )
      const fouten = results.filter(r => r.status === 'rejected').length
      await mutate()
      setSelectedIds(new Set())
      setZoek('')
      if (fouten === 0) {
        toast(`${ids.length} gebruiker${ids.length !== 1 ? 's' : ''} gekoppeld.`, 'success')
      } else {
        toast(`${ids.length - fouten} gekoppeld, ${fouten} mislukt.`, 'error')
      }
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
          {!portalData ? (
            <p style={{ margin: 0, fontSize: '13px', color: dashboardUi.textMuted }}>Laden…</p>
          ) : beschikbaar.length === 0 ? (
            <p style={{ margin: 0, fontSize: '13px', color: dashboardUi.textMuted }}>Alle gebruikers zijn al gekoppeld.</p>
          ) : (
            <>
              {/* Search + selecteer alles */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <input
                  type="search"
                  value={zoek}
                  onChange={e => setZoek(e.target.value)}
                  placeholder="Zoek op naam of e-mail…"
                  style={{ ...inputStyle, margin: 0, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={toggleAll}
                  style={{ fontSize: '12px', fontWeight: 600, color: DYNAMO_BLUE, background: 'none', border: '1px solid rgba(45,69,124,0.2)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: F }}
                >
                  {zoekResultaten.every(u => selectedIds.has(u.user_id)) ? 'Geen' : 'Alles'}
                </button>
              </div>
              {/* Scrollable pick list */}
              <div style={{ border: '1px solid rgba(45,69,124,0.12)', borderRadius: '10px', overflowY: 'auto', maxHeight: '240px', background: 'white' }}>
                {zoekResultaten.length === 0 ? (
                  <p style={{ margin: 0, padding: '10px 14px', fontSize: '13px', color: 'rgba(45,69,124,0.5)' }}>Geen gebruikers gevonden</p>
                ) : zoekResultaten.map(u => {
                  const selected = selectedIds.has(u.user_id)
                  return (
                    <button
                      key={u.user_id}
                      type="button"
                      onClick={() => toggleUser(u.user_id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '9px 14px', background: selected ? 'rgba(45,69,124,0.07)' : 'none', border: 'none', borderBottom: '1px solid rgba(45,69,124,0.06)', cursor: 'pointer', fontFamily: F }}
                    >
                      {/* Checkbox */}
                      <span style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${selected ? DYNAMO_BLUE : 'rgba(45,69,124,0.25)'}`, background: selected ? DYNAMO_BLUE : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selected && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      <span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', display: 'block' }}>{u.naam || prettyEmail(u.email)}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(45,69,124,0.5)' }}>{u.email}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'rgba(45,69,124,0.5)' }}>
                  {selectedIds.size > 0 ? `${selectedIds.size} geselecteerd` : `${zoekResultaten.length} van ${beschikbaar.length} beschikbaar`}
                </span>
                <button
                  type="button"
                  disabled={selectedIds.size === 0 || adding}
                  onClick={() => void koppel()}
                  style={{ borderRadius: '10px', padding: '8px 20px', fontSize: '13px', fontWeight: 700, background: DYNAMO_BLUE, color: 'white', border: 'none', fontFamily: F, cursor: (selectedIds.size === 0 || adding) ? 'not-allowed' : 'pointer', opacity: (selectedIds.size === 0 || adding) ? 0.5 : 1 }}
                >
                  {adding ? 'Koppelen…' : selectedIds.size > 1 ? `${selectedIds.size} koppelen` : 'Koppelen'}
                </button>
              </div>
              {isProduct && (
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'rgba(45,69,124,0.5)' }}>
                  Na het koppelen kun je per gebruiker serienummer en datum in gebruik invoeren.
                </p>
              )}
            </>
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

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<AanvraagStatus, { label: string; bg: string; fg: string }> = {
  ingediend:         { label: 'Ingediend',        bg: '#f1f5f9', fg: '#475569' },
  wacht_op_manager:  { label: 'Wacht op manager', bg: '#fef9c3', fg: '#854d0e' },
  goedgekeurd:       { label: 'Goedgekeurd',      bg: '#dcfce7', fg: '#15803d' },
  afgekeurd:         { label: 'Afgekeurd',        bg: '#fee2e2', fg: '#b91c1c' },
}

function StatusBadge({ status }: { status: AanvraagStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.ingediend
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap"
      style={{ background: m.bg, color: m.fg }}>
      {m.label}
    </span>
  )
}

// ── Aanvraag formulier modal ──────────────────────────────────────────────────

interface GebruikerKeuze {
  user_id: string
  naam: string
  email: string
  manager_naam: string | null
}

function AanvraagModal({
  item,
  onClose,
  onSuccess,
}: {
  item: CatalogusItem
  onClose: () => void
  onSuccess: () => void
}) {
  const toast = useToast()
  const [motivatie, setMotivatie] = useState('')
  const [loading, setLoading] = useState(false)
  const [zoek, setZoek] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: gebruikersData } = useSWR<{ users: GebruikerKeuze[] }>(
    '/api/it-cmdb/portal-users', fetcher, { revalidateOnFocus: false }
  )

  const alleGebruikers: GebruikerKeuze[] = useMemo(() => {
    return (gebruikersData?.users ?? [])
      .filter(u => u.email)
      .sort((a, b) => (a.naam || a.email).localeCompare(b.naam || b.email, 'nl'))
  }, [gebruikersData])

  const gefilterdeGebruikers = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    if (!q) return alleGebruikers
    return alleGebruikers.filter(g =>
      (g.naam || '').toLowerCase().includes(q) || g.email.toLowerCase().includes(q)
    )
  }, [alleGebruikers, zoek])

  function toggleUser(userId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })
  }

  function toggleAll() {
    if (gefilterdeGebruikers.every(u => selectedIds.has(u.user_id))) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        gefilterdeGebruikers.forEach(u => next.delete(u.user_id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        gefilterdeGebruikers.forEach(u => next.add(u.user_id))
        return next
      })
    }
  }

  async function indienen() {
    setLoading(true)
    try {
      const mot = motivatie.trim() || undefined
      if (selectedIds.size === 0) {
        // voor jezelf
        const res = await fetch('/api/it-cmdb/aanvragen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ catalogus_id: item.id, motivatie: mot }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Indienen mislukt')
        toast('Aanvraag ingediend. De manager ontvangt een e-mail.', 'success')
      } else {
        const ids = [...selectedIds]
        const results = await Promise.allSettled(
          ids.map(uid =>
            fetch('/api/it-cmdb/aanvragen', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ catalogus_id: item.id, motivatie: mot, namens_user_id: uid }),
            }).then(r => r.ok ? r.json() : r.json().then((j: { error?: string }) => Promise.reject(new Error(j.error ?? 'Indienen mislukt'))))
          )
        )
        const fouten = results.filter(r => r.status === 'rejected').length
        if (fouten === 0) {
          toast(`${ids.length} aanvragen ingediend.`, 'success')
        } else {
          toast(`${ids.length - fouten} ingediend, ${fouten} mislukt.`, 'error')
        }
      }
      onSuccess()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Indienen mislukt', 'error')
    } finally {
      setLoading(false)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'rgba(45,69,124,0.6)', display: 'block', marginBottom: 6 }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} onClick={onClose} aria-hidden />
      <div style={{ position: 'relative', background: 'white', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: 28, fontFamily: F }}>

        {/* Sticky header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: DYNAMO_BLUE, margin: '0 0 2px' }}>Licentie aanvragen</h2>
            <p style={{ fontSize: 13, color: 'rgba(45,69,124,0.5)', margin: 0 }}>
              Dien een aanvraag in voor jezelf of een medewerker.
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'rgba(45,69,124,0.35)', lineHeight: 1, padding: '2px 4px' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Product */}
          <div style={{ background: 'rgba(45,69,124,0.04)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(45,69,124,0.45)', marginBottom: 2 }}>Product</div>
            <div style={{ fontWeight: 700, color: DYNAMO_BLUE, fontSize: 16 }}>{item.naam}</div>
            <div style={{ fontSize: 12, color: 'rgba(45,69,124,0.5)', marginTop: 2 }}>{item.leverancier} · {item.categorie}</div>
          </div>

          {/* Medewerker kiezen */}
          <div>
            <label style={lbl}>Voor medewerker <span style={{ fontWeight: 400, opacity: 0.6 }}>(optioneel — leeg = voor jezelf)</span></label>
            {!gebruikersData ? (
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(45,69,124,0.5)' }}>Laden…</p>
            ) : alleGebruikers.length === 0 ? null : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    type="search"
                    value={zoek}
                    onChange={e => setZoek(e.target.value)}
                    placeholder="Zoek op naam of e-mail…"
                    style={{ flex: 1, borderRadius: 10, border: '1px solid rgba(45,69,124,0.2)', padding: '9px 12px', fontSize: 13, fontFamily: F, color: '#1e293b', outline: 'none', boxSizing: 'border-box' as const }}
                  />
                  <button
                    type="button"
                    onClick={toggleAll}
                    style={{ fontSize: 12, fontWeight: 600, color: DYNAMO_BLUE, background: 'none', border: '1px solid rgba(45,69,124,0.2)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: F }}
                  >
                    {gefilterdeGebruikers.every(u => selectedIds.has(u.user_id)) ? 'Geen' : 'Alles'}
                  </button>
                </div>
                <div style={{ border: '1px solid rgba(45,69,124,0.12)', borderRadius: 10, overflowY: 'auto', maxHeight: 200, background: 'white' }}>
                  {gefilterdeGebruikers.length === 0 ? (
                    <p style={{ margin: 0, padding: '10px 14px', fontSize: 13, color: 'rgba(45,69,124,0.5)' }}>Geen gebruikers gevonden</p>
                  ) : gefilterdeGebruikers.map(g => {
                    const selected = selectedIds.has(g.user_id)
                    return (
                      <button
                        key={g.user_id}
                        type="button"
                        onClick={() => toggleUser(g.user_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 14px', background: selected ? 'rgba(45,69,124,0.07)' : 'none', border: 'none', borderBottom: '1px solid rgba(45,69,124,0.06)', cursor: 'pointer', fontFamily: F }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selected ? DYNAMO_BLUE : 'rgba(45,69,124,0.25)'}`, background: selected ? DYNAMO_BLUE : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selected && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        <span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', display: 'block' }}>{g.naam || prettyEmail(g.email)}</span>
                          <span style={{ fontSize: 11, color: 'rgba(45,69,124,0.5)' }}>{g.email}</span>
                          {g.manager_naam && <span style={{ fontSize: 11, color: 'rgba(45,69,124,0.4)', display: 'block' }}>Manager: {g.manager_naam}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p style={{ fontSize: 11, color: 'rgba(45,69,124,0.4)', margin: '4px 0 0' }}>
                  {selectedIds.size > 0 ? `${selectedIds.size} medewerker${selectedIds.size !== 1 ? 's' : ''} geselecteerd` : 'Niets geselecteerd — aanvraag wordt voor jezelf ingediend'}
                </p>
              </>
            )}
          </div>

          {/* Motivatie */}
          <div>
            <label style={lbl}>Motivatie <span style={{ fontWeight: 400, opacity: 0.6 }}>(optioneel)</span></label>
            <textarea
              value={motivatie}
              onChange={e => setMotivatie(e.target.value)}
              rows={3}
              placeholder={selectedIds.size > 0 ? 'Waarom hebben deze medewerkers deze licentie nodig?' : 'Waarom heb je deze licentie nodig?'}
              style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(45,69,124,0.2)', padding: '10px 12px', fontSize: 14, fontFamily: F, color: '#1e293b', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={loading}
            style={{ borderRadius: 10, padding: '9px 18px', fontSize: 14, border: '1px solid rgba(45,69,124,0.2)', background: 'white', color: DYNAMO_BLUE, fontFamily: F, cursor: 'pointer' }}>
            Annuleren
          </button>
          <button type="button" onClick={() => void indienen()} disabled={loading}
            style={{ borderRadius: 10, padding: '9px 22px', fontSize: 14, fontWeight: 700, background: DYNAMO_BLUE, color: 'white', border: 'none', fontFamily: F, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Bezig…' : selectedIds.size > 1 ? `${selectedIds.size} aanvragen indienen` : selectedIds.size === 1 ? 'Indienen voor medewerker' : 'Aanvraag indienen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Aanvragen tab ─────────────────────────────────────────────────────────────

function AanvragenTab({ items }: { items: CatalogusItem[] }) {
  const toast = useToast()
  const { data, isLoading, mutate } = useSWR<{ aanvragen: Aanvraag[] }>('/api/it-cmdb/aanvragen', fetcher)
  const aanvragen = data?.aanvragen ?? []

  const [statusFilter, setStatusFilter] = useState<AanvraagStatus | 'alle'>('alle')
  const [zoek, setZoek] = useState('')
  const [aanvraagItem, setAanvraagItem] = useState<CatalogusItem | null>(null)

  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items])

  const gefilterd = useMemo(() => {
    return aanvragen.filter(a => {
      if (statusFilter !== 'alle' && a.status !== statusFilter) return false
      if (zoek.trim()) {
        const q = zoek.toLowerCase()
        return (
          a.catalogus_naam.toLowerCase().includes(q) ||
          a.aanvrager_naam.toLowerCase().includes(q) ||
          a.aanvrager_email.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [aanvragen, statusFilter, zoek])

  const counts = useMemo(() => {
    const c: Record<string, number> = { alle: aanvragen.length }
    for (const a of aanvragen) c[a.status] = (c[a.status] ?? 0) + 1
    return c
  }, [aanvragen])

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(['alle', 'ingediend', 'wacht_op_manager', 'goedgekeurd', 'afgekeurd'] as const).map(s => {
            const meta = s === 'alle' ? null : STATUS_META[s]
            const active = statusFilter === s
            return (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5"
                style={{
                  background: active ? (meta?.bg ?? DYNAMO_BLUE) : 'white',
                  color: active ? (meta?.fg ?? 'white') : 'rgba(45,69,124,0.55)',
                  border: `1px solid ${active ? (meta?.bg ?? DYNAMO_BLUE) : 'rgba(45,69,124,0.12)'}`,
                  fontFamily: F,
                }}>
                {s === 'alle' ? 'Alle' : STATUS_META[s].label}
                {counts[s] != null && (
                  <span className="rounded-full px-1.5 text-xs font-bold"
                    style={{ background: active ? 'rgba(0,0,0,0.12)' : 'rgba(45,69,124,0.08)', color: 'inherit' }}>
                    {counts[s]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <input type="search" placeholder="Zoek medewerker of product…" value={zoek} onChange={e => setZoek(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm w-60"
          style={{ background: 'white', border: '1px solid rgba(45,69,124,0.15)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }} />
      </div>

      {/* Tabel */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
        {isLoading ? (
          <div className="p-10 text-center text-sm" style={{ color: dashboardUi.textMuted }}>Laden…</div>
        ) : gefilterd.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
            {aanvragen.length === 0 ? 'Nog geen aanvragen.' : 'Geen aanvragen voor dit filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(45,69,124,0.08)', background: 'rgba(45,69,124,0.02)' }}>
                  {['Medewerker', 'Product', 'Manager', 'Status', 'Ingediend', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase whitespace-nowrap"
                      style={{ color: DYNAMO_BLUE, letterSpacing: '0.06em', fontFamily: F }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gefilterd.map((a, i) => (
                  <tr key={a.id} style={{ borderBottom: i < gefilterd.length - 1 ? '1px solid rgba(45,69,124,0.06)' : 'none' }}>
                    <td className="px-4 py-3">
                      <div className="font-semibold" style={{ color: DYNAMO_BLUE }}>{a.aanvrager_naam}</div>
                      <div className="text-xs" style={{ color: 'rgba(45,69,124,0.45)' }}>{a.aanvrager_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: '#334155' }}>{a.catalogus_naam}</div>
                      {a.motivatie && (
                        <div className="text-xs mt-0.5 max-w-[200px] truncate" style={{ color: '#94a3b8' }} title={a.motivatie}>
                          {a.motivatie}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.manager_naam ? (
                        <div>
                          <div className="text-sm" style={{ color: '#334155' }}>{a.manager_naam}</div>
                          {a.manager_notitie && (
                            <div className="text-xs mt-0.5 max-w-[180px] truncate" style={{ color: '#94a3b8' }} title={a.manager_notitie}>
                              &ldquo;{a.manager_notitie}&rdquo;
                            </div>
                          )}
                        </div>
                      ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={a.status} />
                      {a.manager_beslissing_op && (
                        <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.4)' }}>
                          {new Date(a.manager_beslissing_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'rgba(45,69,124,0.45)' }}>
                      {new Date(a.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {/* Knop om snel nieuwe aanvraag te doen voor dit product */}
                      {a.status === 'goedgekeurd' && itemMap.has(a.catalogus_id) && (
                        <span className="text-xs rounded-lg px-2 py-1 font-semibold"
                          style={{ background: '#dcfce7', color: '#15803d' }}>
                          Klaar voor koppelen
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aanvraag knop per product */}
      <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
        <div className="text-sm font-bold mb-3" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Nieuwe aanvraag indienen</div>
        <div className="flex flex-wrap gap-2">
          {items.filter(i => i.type === 'licentie').map(item => (
            <button key={item.id} type="button" onClick={() => setAanvraagItem(item)}
              className="rounded-xl px-3 py-2 text-xs font-semibold transition hover:opacity-80"
              style={{ background: 'rgba(45,69,124,0.05)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.12)', fontFamily: F }}>
              + {item.naam}
            </button>
          ))}
        </div>
        {items.filter(i => i.type === 'licentie').length === 0 && (
          <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Nog geen licenties in de catalogus.</p>
        )}
      </div>

      {aanvraagItem && (
        <AanvraagModal
          item={aanvraagItem}
          onClose={() => setAanvraagItem(null)}
          onSuccess={() => void mutate()}
        />
      )}
    </div>
  )
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function CatalogusPage() {
  const toast = useToast()
  const { data, error, isLoading, mutate } = useSWR<{ items: CatalogusItem[] }>('/api/it-cmdb/catalogus', fetcher)
  const items = data?.items ?? []

  const [actieveTab, setActieveTab] = useState<'catalogus' | 'aanvragen'>('catalogus')
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
        {/* Top bar */}
        <div className="px-4 sm:px-6 flex items-center gap-3 py-2 border-b border-white/10 min-h-[44px]">
          <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90 shrink-0">
            ← Portal
          </Link>
          <span className="text-white/50 text-xs select-none">IT CMDB</span>
        </div>
        {/* Tab navigation */}
        <div className="px-4 sm:px-6 flex gap-0 overflow-x-auto scrollbar-none">
          <Link
            href="/dashboard/it-cmdb"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 border-transparent text-white/55 hover:text-white/85 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            Interne Hardware
          </Link>
          <Link
            href="/dashboard/it-cmdb/catalogus"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 border-white text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Catalogus
          </Link>
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
              {syncLoading ? (
                <span className="inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
              )}
              {syncLoading ? 'Synchroniseren…' : 'Sync Microsoft'}
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

        {/* Tab balk */}
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)', display: 'inline-flex' }}>
          {([
            { key: 'catalogus', label: '📦 Catalogus' },
            { key: 'aanvragen', label: '📋 Aanvragen' },
          ] as const).map(t => (
            <button key={t.key} type="button" onClick={() => setActieveTab(t.key)}
              className="rounded-xl px-5 py-2 text-sm font-semibold transition"
              style={{
                background: actieveTab === t.key ? DYNAMO_BLUE : 'transparent',
                color: actieveTab === t.key ? 'white' : 'rgba(45,69,124,0.5)',
                fontFamily: F,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {actieveTab === 'aanvragen' && <AanvragenTab items={items} />}

        {actieveTab === 'catalogus' && <>

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

        </>}
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
