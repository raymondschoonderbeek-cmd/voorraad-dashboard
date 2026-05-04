'use client'
import type { Winkel } from '@/lib/types'

export function TabSystemen({ w }: { w: Winkel }) {
  const systemen: { naam: string; zichtbaar: boolean; detail: string; pill: { label: string; kleur: string; bg: string } }[] = [
    {
      naam: 'Kassasysteem',
      zichtbaar: true,
      detail: [w.kassasysteem, w.kassa_nummer ? `Kassa #${w.kassa_nummer}` : null].filter(Boolean).join(' · ') || '—',
      pill: w.actief ? { label: 'Actief', kleur: '#15803d', bg: '#dcfce7' } : { label: 'Inactief', kleur: 'rgba(45,69,124,0.5)', bg: 'rgba(45,69,124,0.08)' },
    },
    {
      naam: 'Wilmar',
      zichtbaar: !!(w.wilmar_organisation_id),
      detail: [`Org ${w.wilmar_organisation_id}`, w.wilmar_branch_id ? `Branch ${w.wilmar_branch_id}` : null, w.wilmar_store_naam].filter(Boolean).join(' · '),
      pill: { label: w.api_type ?? 'wilmar', kleur: '#1d4ed8', bg: '#dbeafe' },
    },
    {
      naam: 'CycleSoftware',
      zichtbaar: w.cycle_api_authorized != null,
      detail: w.cycle_api_checked_at ? `Gecheckt: ${new Date(w.cycle_api_checked_at).toLocaleString('nl-NL', { day:'2-digit', month:'2-digit', year:'numeric' })}` : 'Nooit gecheckt',
      pill: w.cycle_api_authorized ? { label: 'Geautoriseerd', kleur: '#15803d', bg: '#dcfce7' } : { label: 'Niet geautoriseerd', kleur: '#d97706', bg: '#fef9c3' },
    },
    {
      naam: 'Vendit API',
      zichtbaar: !!(w.vendit_api_username),
      detail: `User: ${w.vendit_api_username} · Key: ••••${(w.vendit_api_key ?? '').slice(-4) || '••••'}`,
      pill: { label: 'Verbonden', kleur: '#15803d', bg: '#dcfce7' },
    },
    {
      naam: 'Webshop → Kassa',
      zichtbaar: !!(w.webshoporders_naar_kassa),
      detail: w.webshoporders_naar_kassa ?? '',
      pill: { label: 'Ingesteld', kleur: 'rgba(45,69,124,0.6)', bg: 'rgba(45,69,124,0.08)' },
    },
  ]

  const zichtbaar = systemen.filter(s => s.zichtbaar)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {zichtbaar.length === 0 && <p style={{ color:'var(--drg-text-3)', fontSize:13 }}>Geen systemen gekoppeld.</p>}
      {zichtbaar.map(s => (
        <div key={s.naam} style={{ padding:'14px 16px', borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--drg-ink-2)', marginBottom:2 }}>{s.naam}</div>
            <div style={{ fontSize:12, color:'var(--drg-text-2)' }}>{s.detail}</div>
          </div>
          <span style={{ padding:'3px 10px', borderRadius:999, fontSize:11, fontWeight:700, background:s.pill.bg, color:s.pill.kleur, whiteSpace:'nowrap', flexShrink:0 }}>{s.pill.label}</span>
        </div>
      ))}
    </div>
  )
}
