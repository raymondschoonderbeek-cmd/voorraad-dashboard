'use client'
import type { Winkel } from '@/lib/types'
import { StatusPill } from './StatusPill'
export function QuickFacts({ w }: { w: Winkel }) {
  const facts = [
    { label: 'Status', value: <StatusPill actief={w.actief} geblokkeerd={w.geblokkeerd} /> },
    { label: 'Kassa', value: w.kassasysteem || w.api_type || '—' },
    { label: 'Formule', value: w.formule || '—' },
    { label: 'VVO', value: w.vvo_m2 ? `${w.vvo_m2} m²` : '—' },
    { label: 'Lid sinds', value: w.aangesloten_sinds || '—' },
    { label: 'Regiomgr.', value: w.regio_manager || '—' },
  ]
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:8, marginTop:12 }}>
      {facts.map(f => (
        <div key={f.label} style={{ padding:'8px 10px', borderRadius:8, background:'rgba(45,69,124,0.04)', border:'1px solid rgba(45,69,124,0.08)' }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)', marginBottom:3 }}>{f.label}</div>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--drg-ink-2)' }}>{f.value}</div>
        </div>
      ))}
    </div>
  )
}
