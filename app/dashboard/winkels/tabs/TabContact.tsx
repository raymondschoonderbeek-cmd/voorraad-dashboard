'use client'
import { useState } from 'react'
import type { Winkel } from '@/lib/types'
import { IconPhone, IconMail, IconGlobe, IconEdit } from '@/components/DashboardIcons'

interface Props { w: Winkel; onUpdate: (updated: Winkel) => void; isAdmin: boolean }

export function TabContact({ w, onUpdate, isAdmin }: Props) {
  const [editField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(field: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/winkels/${w.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: editValue }),
      })
      if (res.ok) {
        const updated = await res.json() as Winkel
        onUpdate(updated)
      }
    } finally {
      setSaving(false)
      setEditField(null)
    }
  }

  function startEdit(field: string, current: string | null) {
    setEditField(field)
    setEditValue(current ?? '')
  }

  function EditableField({ field, value, label, href, icon }: { field: string; value: string | null; label: string; href?: string; icon?: React.ReactNode }) {
    if (editField === field) {
      return (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 0', borderBottom:'1px solid var(--drg-line)' }}>
          <span style={{ fontSize:12, color:'var(--drg-text-3)', minWidth:120 }}>{label}</span>
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void save(field); if (e.key === 'Escape') setEditField(null) }}
            style={{ flex:1, padding:'4px 8px', borderRadius:6, border:'1px solid rgba(45,69,124,0.2)', fontSize:13, background:'white', color:'var(--drg-ink)' }}
          />
          <button onClick={() => void save(field)} disabled={saving} style={{ padding:'4px 10px', borderRadius:6, background:'var(--drg-ink-2)', color:'white', border:'none', cursor:'pointer', fontSize:12, fontWeight:600 }}>
            {saving ? '…' : 'Opslaan'}
          </button>
          <button onClick={() => setEditField(null)} style={{ padding:'4px 8px', borderRadius:6, background:'transparent', border:'1px solid rgba(45,69,124,0.15)', cursor:'pointer', fontSize:12, color:'var(--drg-text-2)' }}>Annuleer</button>
        </div>
      )
    }
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 0', borderBottom:'1px solid var(--drg-line)' }}>
        {icon && <span style={{ color:'var(--drg-text-3)', flexShrink:0 }}>{icon}</span>}
        <span style={{ fontSize:12, color:'var(--drg-text-3)', minWidth:120, flexShrink:0 }}>{label}</span>
        {value ? (
          href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize:13, color:'var(--drg-ink-2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</a>
               : <span style={{ fontSize:13, color:'var(--drg-ink)', flex:1 }}>{value}</span>
        ) : <span style={{ fontSize:13, color:'var(--drg-text-3)', flex:1 }}>—</span>}
        {isAdmin && (
          <button onClick={() => startEdit(field, value)} aria-label={`Bewerk ${label}`} style={{ padding:4, background:'transparent', border:'none', cursor:'pointer', color:'var(--drg-text-3)', borderRadius:4, display:'flex', alignItems:'center', opacity:0.5 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
            <IconEdit size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px,1fr))', gap:12 }}>
      <div style={{ padding:16, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)' }}>
        <h3 style={{ margin:'0 0 4px', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>Primair contact</h3>
        <EditableField field="contactpersoon" value={w.contactpersoon} label="Contactpersoon" />
        <EditableField field="telefoon" value={w.telefoon} label="Telefoon" href={w.telefoon ? `tel:${w.telefoon}` : undefined} icon={<IconPhone size={14} />} />
        <EditableField field="email" value={w.email} label="E-mail" href={w.email ? `mailto:${w.email}` : undefined} icon={<IconMail size={14} />} />
        <EditableField field="website" value={w.website} label="Website" href={w.website ? (w.website.startsWith('http') ? w.website : `https://${w.website}`) : undefined} icon={<IconGlobe size={14} />} />
      </div>
      <div style={{ padding:16, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)' }}>
        <h3 style={{ margin:'0 0 4px', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>Administratie</h3>
        <EditableField field="email_administratie" value={w.email_administratie} label="E-mail admin" href={w.email_administratie ? `mailto:${w.email_administratie}` : undefined} icon={<IconMail size={14} />} />
      </div>
    </div>
  )
}
