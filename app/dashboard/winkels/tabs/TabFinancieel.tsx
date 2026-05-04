'use client'
import type { Winkel } from '@/lib/types'
import { KvList, KvItem } from '../components/KvList'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding:16, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)' }}>
      <h3 style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>{title}</h3>
      {children}
    </div>
  )
}

function DeelnamePill({ waarde }: { waarde: string | null }) {
  const lc = (waarde ?? '').toLowerCase()
  const ja = lc === 'ja' || lc === 'yes' || lc === '1' || lc === 'true'
  const nee = lc === 'nee' || lc === 'no' || lc === '0' || lc === 'false'
  if (ja) return <span style={{ padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, background:'#dcfce7', color:'#15803d' }}>Ja</span>
  if (nee) return <span style={{ padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700, background:'rgba(45,69,124,0.08)', color:'rgba(45,69,124,0.5)' }}>Nee</span>
  return <span style={{ fontSize:13, color:'var(--drg-ink)' }}>{waarde || '—'}</span>
}

export function TabFinancieel({ w }: { w: Winkel }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
      <Card title="Commercie">
        <KvList>
          <KvItem label="Bike Totaal start" value={w.bike_totaal_nieuw_start} />
          <KvItem label="Bike Totaal eind" value={w.bike_totaal_nieuw_eind} />
          <KvItem label="VVO" value={w.vvo_m2 ? `${w.vvo_m2} m²` : null} />
          <KvItem label="Sales channels" value={w.sales_channels_qv} />
        </KvList>
      </Card>
      <Card title="Centraal betalen">
        <KvList>
          <KvItem label="Deelname" value={<DeelnamePill waarde={w.deelname_centraal_betalen} />} />
        </KvList>
      </Card>
      <Card title="CM Fietsen">
        <KvList>
          <KvItem label="Deelname" value={<DeelnamePill waarde={w.cm_fietsen_deelname} />} />
          <KvItem label="Instroom" value={w.cm_fietsen_instroom} />
          <KvItem label="Uitstroom" value={w.cm_fietsen_uitstroom} />
        </KvList>
      </Card>
      <Card title="Jaarcijfers">
        <KvList>
          <KvItem label="Jaarcijfers" value={w.jaarcijfers
            ? (w.jaarcijfers.startsWith('http') ? <a href={w.jaarcijfers} target="_blank" rel="noopener noreferrer" style={{ color:'var(--drg-ink-2)' }}>Bekijk →</a> : w.jaarcijfers)
            : null
          } />
        </KvList>
      </Card>
    </div>
  )
}
