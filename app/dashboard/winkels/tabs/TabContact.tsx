'use client'
import { useState } from 'react'
import useSWR from 'swr'
import type { Winkel } from '@/lib/types'
import { IconPhone, IconMail, IconGlobe, IconPlus } from '@/components/DashboardIcons'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Contact = { id: number; naam: string; telefoon: string | null; email: string | null; opmerking: string | null; created_at: string }

interface Props { w: Winkel; onUpdate: (updated: Winkel) => void; isAdmin: boolean }

function ReadonlyRij({ icon, label, value, href }: { icon?: React.ReactNode; label: string; value: string | null; href?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 0', borderBottom:'1px solid var(--drg-line)' }}>
      {icon && <span style={{ color:'var(--drg-text-3)', flexShrink:0 }}>{icon}</span>}
      <span style={{ fontSize:12, color:'var(--drg-text-3)', minWidth:120, flexShrink:0 }}>{label}</span>
      {value
        ? href
          ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize:13, color:'var(--drg-ink-2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</a>
          : <span style={{ fontSize:13, color:'var(--drg-ink)', flex:1 }}>{value}</span>
        : <span style={{ fontSize:13, color:'var(--drg-text-3)', flex:1 }}>—</span>
      }
    </div>
  )
}

export function TabContact({ w, onUpdate, isAdmin }: Props) {
  const { data: contacten = [], mutate } = useSWR<Contact[]>(`/api/winkels/${w.id}/contacten`, fetcher)

  const [toonForm, setToonForm] = useState(false)
  const [naam, setNaam] = useState('')
  const [telefoon, setTelefoon] = useState('')
  const [email, setEmail] = useState('')
  const [opmerking, setOpmerking] = useState('')
  const [saving, setSaving] = useState(false)
  const [verwijderenId, setVerwijderenId] = useState<number | null>(null)

  async function voegToe() {
    if (!naam.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/winkels/${w.id}/contacten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam, telefoon, email, opmerking }),
      })
      if (res.ok) {
        setNaam(''); setTelefoon(''); setEmail(''); setOpmerking(''); setToonForm(false)
        await mutate()
      }
    } finally { setSaving(false) }
  }

  async function verwijder(id: number) {
    setVerwijderenId(id)
    try {
      await fetch(`/api/winkels/${w.id}/contacten/${id}`, { method: 'DELETE' })
      await mutate()
    } finally { setVerwijderenId(null) }
  }

  const inputStijl = { width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid rgba(45,69,124,0.2)', fontSize:13, background:'white', color:'var(--drg-ink)', boxSizing:'border-box' as const }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Primair contact — read-only, uit SAP */}
      <div style={{ padding:16, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <h3 style={{ margin:0, fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>Primair contact</h3>
          <span style={{ fontSize:10, color:'var(--drg-text-3)', background:'rgba(45,69,124,0.06)', padding:'2px 7px', borderRadius:999, fontWeight:600 }}>Via SAP-sync</span>
        </div>
        <ReadonlyRij label="Contactpersoon" value={w.contactpersoon} />
        <ReadonlyRij icon={<IconPhone size={14} />} label="Telefoon" value={w.telefoon} href={w.telefoon ? `tel:${w.telefoon}` : undefined} />
        <ReadonlyRij icon={<IconMail size={14} />} label="E-mail" value={w.email} href={w.email ? `mailto:${w.email}` : undefined} />
        <ReadonlyRij icon={<IconGlobe size={14} />} label="Website" value={w.website} href={w.website ? (w.website.startsWith('http') ? w.website : `https://${w.website}`) : undefined} />
      </div>

      {/* Administratie — read-only, uit SAP */}
      <div style={{ padding:16, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <h3 style={{ margin:0, fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>Administratie</h3>
          <span style={{ fontSize:10, color:'var(--drg-text-3)', background:'rgba(45,69,124,0.06)', padding:'2px 7px', borderRadius:999, fontWeight:600 }}>Via SAP-sync</span>
        </div>
        <ReadonlyRij icon={<IconMail size={14} />} label="E-mail admin" value={w.email_administratie} href={w.email_administratie ? `mailto:${w.email_administratie}` : undefined} />
      </div>

      {/* Aanvullende contacten */}
      <div style={{ padding:16, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <h3 style={{ margin:0, fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>Aanvullende contacten</h3>
          {!toonForm && (
            <button onClick={() => setToonForm(true)} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:6, border:'1px solid rgba(45,69,124,0.2)', background:'transparent', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--drg-ink-2)' }}>
              <IconPlus size={13} /> Toevoegen
            </button>
          )}
        </div>

        {/* Toevoegformulier */}
        {toonForm && (
          <div style={{ marginBottom:12, padding:12, borderRadius:8, background:'rgba(45,69,124,0.04)', border:'1px solid rgba(45,69,124,0.1)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--drg-text-3)', fontWeight:600, display:'block', marginBottom:3 }}>Naam *</label>
                <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Naam contactpersoon" style={inputStijl} />
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--drg-text-3)', fontWeight:600, display:'block', marginBottom:3 }}>Telefoon</label>
                <input value={telefoon} onChange={e => setTelefoon(e.target.value)} placeholder="+31 …" style={inputStijl} />
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--drg-text-3)', fontWeight:600, display:'block', marginBottom:3 }}>E-mail</label>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="naam@voorbeeld.nl" type="email" style={inputStijl} />
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--drg-text-3)', fontWeight:600, display:'block', marginBottom:3 }}>Opmerking</label>
                <input value={opmerking} onChange={e => setOpmerking(e.target.value)} placeholder="Bijv. Inkoop, Manager…" style={inputStijl} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => { setToonForm(false); setNaam(''); setTelefoon(''); setEmail(''); setOpmerking('') }} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid rgba(45,69,124,0.15)', background:'transparent', cursor:'pointer', fontSize:12, color:'var(--drg-text-2)' }}>Annuleer</button>
              <button onClick={voegToe} disabled={saving || !naam.trim()} style={{ padding:'5px 14px', borderRadius:6, border:'none', background:'var(--drg-ink-2)', color:'white', cursor:'pointer', fontSize:12, fontWeight:600, opacity: (!naam.trim() || saving) ? 0.5 : 1 }}>
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </div>
        )}

        {/* Lijst */}
        {contacten.length === 0 && !toonForm && (
          <p style={{ margin:0, fontSize:13, color:'var(--drg-text-3)' }}>Nog geen aanvullende contacten toegevoegd.</p>
        )}
        {contacten.map(c => (
          <div key={c.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0', borderBottom:'1px solid var(--drg-line)' }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(45,69,124,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:13, fontWeight:700, color:'var(--drg-ink-2)' }}>
              {c.naam.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:600, color:'var(--drg-ink)' }}>{c.naam}</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 12px', fontSize:12, color:'var(--drg-text-2)' }}>
                {c.telefoon && <a href={`tel:${c.telefoon}`} style={{ color:'var(--drg-ink-2)', textDecoration:'none', display:'flex', alignItems:'center', gap:3 }}><IconPhone size={12} />{c.telefoon}</a>}
                {c.email && <a href={`mailto:${c.email}`} style={{ color:'var(--drg-ink-2)', textDecoration:'none', display:'flex', alignItems:'center', gap:3 }}><IconMail size={12} />{c.email}</a>}
                {c.opmerking && <span style={{ color:'var(--drg-text-3)' }}>{c.opmerking}</span>}
              </div>
            </div>
            <button onClick={() => void verwijder(c.id)} disabled={verwijderenId === c.id} aria-label="Verwijder contact"
              style={{ padding:'3px 8px', borderRadius:6, border:'1px solid rgba(220,38,38,0.2)', background:'transparent', cursor:'pointer', fontSize:11, color:'#b91c1c', flexShrink:0, opacity: verwijderenId === c.id ? 0.5 : 1 }}>
              {verwijderenId === c.id ? '…' : 'Verwijder'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
