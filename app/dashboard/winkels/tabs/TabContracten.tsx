'use client'
import type { Winkel } from '@/lib/types'

function datumBadge(datum: string | null): { label: string; kleur: string; bg: string } | null {
  if (!datum) return null
  const d = new Date(datum)
  if (isNaN(d.getTime())) return null
  const dagen = Math.round((d.getTime() - Date.now()) / 86400000)
  if (dagen < 0) return { label: `${Math.abs(dagen)}d verstreken`, kleur: '#b91c1c', bg: '#fee2e2' }
  if (dagen < 30) return { label: `Verloopt over ${dagen}d`, kleur: '#d97706', bg: '#fef9c3' }
  return { label: `${dagen}d resterend`, kleur: '#15803d', bg: '#dcfce7' }
}

function Pill({ waarde }: { waarde: string | null }) {
  if (!waarde) return <span style={{ color:'var(--drg-text-3)', fontSize:12 }}>—</span>
  return <span style={{ padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, background:'rgba(45,69,124,0.08)', color:'var(--drg-ink-2)' }}>{waarde}</span>
}

function DatumCell({ datum }: { datum: string | null }) {
  if (!datum) return <td style={{ padding:'10px 12px', fontSize:13, color:'var(--drg-text-3)' }}>—</td>
  const badge = datumBadge(datum)
  return (
    <td style={{ padding:'10px 12px', fontSize:13, color:'var(--drg-ink)' }}>
      {datum}
      {badge && <span style={{ marginLeft:8, padding:'2px 6px', borderRadius:999, fontSize:10, fontWeight:700, background:badge.bg, color:badge.kleur }}>{badge.label}</span>}
    </td>
  )
}

export function TabContracten({ w }: { w: Winkel }) {
  const rijen = [
    { naam: 'Laatste contract', status: null, start: null, eind: w.laatste_contract },
    { naam: 'Servicepas DRS', status: <Pill waarde={w.deelname_servicepas_drs} />, start: w.startdatum_servicepas_drs, eind: w.einddatum_servicepas_drs },
    { naam: 'Lease', status: <Pill waarde={w.deelname_lease} />, start: w.startdatum_lease, eind: w.einddatum_lease },
    { naam: 'Centraal betalen', status: <Pill waarde={w.deelname_centraal_betalen} />, start: null, eind: null },
  ]
  return (
    <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid var(--drg-line)', background:'var(--drg-card)' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ background:'rgba(45,69,124,0.03)' }}>
            {['Contract', 'Status', 'Startdatum', 'Einddatum'].map(h => (
              <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)', borderBottom:'1px solid var(--drg-line)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rijen.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < rijen.length - 1 ? '1px solid var(--drg-line)' : 'none' }}>
              <td style={{ padding:'10px 12px', fontSize:13, fontWeight:600, color:'var(--drg-ink-2)' }}>{r.naam}</td>
              <td style={{ padding:'10px 12px' }}>{r.status ?? <span style={{ color:'var(--drg-text-3)', fontSize:12 }}>—</span>}</td>
              <DatumCell datum={r.start} />
              <DatumCell datum={r.eind} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
