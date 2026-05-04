'use client'
import type { Winkel } from '@/lib/types'
import { KvList, KvItem } from '../components/KvList'

export function TabOverzicht({ w }: { w: Winkel }) {
  const adresRegel = [w.straat, w.huisnummer].filter(Boolean).join(' ')
  const pcStad = [w.postcode, w.stad].filter(Boolean).join(' ')
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
      <Card title="NAW">
        <KvList>
          <KvItem label="Naam" value={w.naam} />
          <KvItem label="Lidnummer" value={w.lidnummer} />
          <KvItem label="CBnr" value={w.cbnr} />
          <KvItem label="Straat" value={adresRegel || null} />
          <KvItem label="Postcode / Stad" value={pcStad || null} />
          <KvItem label="Provincie" value={w.provincie} />
          <KvItem label="Land" value={w.land === 'Netherlands' ? 'Nederland' : w.land === 'Belgium' ? 'België' : w.land} />
        </KvList>
      </Card>
      <Card title="Identificatie">
        <KvList>
          <KvItem label="KVK" value={w.kvk} />
          <KvItem label="BTW nummer" value={w.btw_nummer} />
          <KvItem label="GLN" value={w.gln} />
          <KvItem label="IBAN" value={w.iban} />
          <KvItem label="Accountant" value={w.accountant} />
        </KvList>
      </Card>
      <Card title="Aansluiting" span2>
        <KvList>
          <KvItem label="Formule" value={w.formule} />
          <KvItem label="Aangesloten sinds" value={w.aangesloten_sinds} />
          <KvItem label="VVO" value={w.vvo_m2 ? `${w.vvo_m2} m²` : null} />
          <KvItem label="Regiomanager" value={w.regio_manager} />
        </KvList>
      </Card>
    </div>
  )
}

function Card({ title, children, span2 }: { title: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div style={{ padding:16, borderRadius:10, background:'var(--drg-card)', border:'1px solid var(--drg-line)', gridColumn: span2 ? 'span 2 / span 2' : undefined }}>
      <h3 style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>{title}</h3>
      {children}
    </div>
  )
}
