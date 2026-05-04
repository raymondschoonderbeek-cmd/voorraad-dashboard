'use client'
import { useState, useMemo, useEffect } from 'react'
import type { Winkel } from '@/lib/types'
import { StatusPill } from './components/StatusPill'
import { FlagBadge } from './components/FlagBadge'
import { IconMap, IconList } from '@/components/DashboardIcons'
import Link from 'next/link'

const INITIAAL_KLEUREN = ['#2D457C','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#65a30d','#db2777','#854d0e','#0f766e']
const RECENT_KEY = 'dynamo_crm_recent'
const FAV_KEY = 'dynamo_crm_favs'
const DENSE_KEY = 'dynamo_crm_dense'

function initialen(naam: string) {
  const d = naam.trim().split(/\s+/)
  if (d.length >= 2) return (d[0][0] + d[d.length - 1][0]).toUpperCase()
  return naam.slice(0, 2).toUpperCase()
}

interface Props {
  winkels: Winkel[]
  geselecteerdeId: number | null
  onSelecteer: (w: Winkel) => void
  favorieten: number[]
  onToggleFavoriet: (id: number) => void
  isAdmin: boolean
}

export function WinkelLijst({ winkels, geselecteerdeId, onSelecteer, favorieten, onToggleFavoriet: _onToggleFavoriet, isAdmin: _isAdmin }: Props) {
  const [zoekterm, setZoekterm] = useState('')
  const [recentZoekopdrachten, setRecentZoekopdrachten] = useState<string[]>([])
  const [filterLand, setFilterLand] = useState<'alle' | 'Netherlands' | 'Belgium'>('alle')
  const [filterProvincie, setFilterProvincie] = useState('alle')
  const [filterRegio, setFilterRegio] = useState('alle')
  const [filterStatus, setFilterStatus] = useState<'alle' | 'actief' | 'geblokkeerd'>('alle')
  const [filterFormule, setFilterFormule] = useState('alle')
  const [dense, setDense] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]
      setRecentZoekopdrachten(r)
      setDense(localStorage.getItem(DENSE_KEY) === 'true')
    } catch {
      // ignore
    }
  }, [])

  function persistRecent(term: string) {
    if (!term.trim()) return
    const updated = [term, ...recentZoekopdrachten.filter(r => r !== term)].slice(0, 5)
    setRecentZoekopdrachten(updated)
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
  }

  function toggleDense() {
    const next = !dense
    setDense(next)
    localStorage.setItem(DENSE_KEY, String(next))
  }

  const provincies = useMemo(() => {
    const set = new Set(winkels.filter(w => w.provincie && (filterLand === 'alle' || w.land === filterLand)).map(w => w.provincie!))
    return ['alle', ...Array.from(set).sort()]
  }, [winkels, filterLand])

  const regios = useMemo(() => {
    const set = new Set(winkels.filter(w => w.regio_manager).map(w => w.regio_manager!))
    return ['alle', ...Array.from(set).sort()]
  }, [winkels])

  const formules = useMemo(() => {
    const set = new Set(winkels.filter(w => w.formule).map(w => w.formule!))
    return ['alle', ...Array.from(set).sort()]
  }, [winkels])

  const gefilterd = useMemo(() => {
    const q = zoekterm.trim().toLowerCase()
    return winkels.filter(w => {
      if (filterLand !== 'alle' && w.land !== filterLand) return false
      if (filterProvincie !== 'alle' && w.provincie !== filterProvincie) return false
      if (filterRegio !== 'alle' && w.regio_manager !== filterRegio) return false
      if (filterFormule !== 'alle' && w.formule !== filterFormule) return false
      if (filterStatus === 'actief' && (!w.actief || w.geblokkeerd?.trim())) return false
      if (filterStatus === 'geblokkeerd' && !w.geblokkeerd?.trim()) return false
      if (!q) return true
      const blob = [w.naam, w.stad, w.postcode, w.lidnummer, w.cbnr, w.kvk].map(s => String(s ?? '').toLowerCase()).join(' ')
      return blob.includes(q)
    })
  }, [winkels, zoekterm, filterLand, filterProvincie, filterRegio, filterStatus, filterFormule])

  const filtersActief = filterLand !== 'alle' || filterProvincie !== 'alle' || filterRegio !== 'alle' || filterStatus !== 'alle' || filterFormule !== 'alle'

  function wisFilters() {
    setFilterLand('alle'); setFilterProvincie('alle'); setFilterRegio('alle'); setFilterStatus('alle'); setFilterFormule('alle')
  }

  const favorieteWinkels = gefilterd.filter(w => favorieten.includes(w.id))
  const andereWinkels = gefilterd.filter(w => !favorieten.includes(w.id))

  function WinkelRij({ w, kleurIdx }: { w: Winkel; kleurIdx: number }) {
    const kleur = INITIAAL_KLEUREN[kleurIdx % INITIAAL_KLEUREN.length]
    const geselecteerd = geselecteerdeId === w.id
    return (
      <button
        onClick={() => onSelecteer(w)}
        style={{ width:'100%', textAlign:'left', padding: dense ? '8px 12px' : '10px 12px', background: geselecteerd ? 'rgba(45,69,124,0.07)' : 'transparent', border:'none', borderLeft: geselecteerd ? '3px solid var(--drg-accent)' : '3px solid transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}
        onMouseEnter={e => { if (!geselecteerd) e.currentTarget.style.background = 'rgba(45,69,124,0.03)' }}
        onMouseLeave={e => { if (!geselecteerd) e.currentTarget.style.background = 'transparent' }}
      >
        <div style={{ width: dense ? 28 : 34, height: dense ? 28 : 34, borderRadius: dense ? 6 : 8, background:kleur, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize: dense ? 11 : 13, fontWeight:700, flexShrink:0 }}>
          {initialen(w.naam)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize: dense ? 12 : 13, fontWeight:600, color:'var(--drg-ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.naam}</div>
          {!dense && <div style={{ fontSize:11, color:'var(--drg-text-3)', marginTop:1 }}>{[w.lidnummer, w.stad].filter(Boolean).join(' · ')}</div>}
        </div>
        <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4 }}>
          <FlagBadge land={w.land} />
          {!dense && <StatusPill actief={w.actief} geblokkeerd={w.geblokkeerd} />}
        </div>
      </button>
    )
  }

  const selectStyle: React.CSSProperties = { padding:'5px 8px', borderRadius:6, border:'1px solid rgba(45,69,124,0.12)', background:'white', color:'rgba(45,69,124,0.8)', fontSize:12, flex:1 }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink:0, padding:'16px 12px 8px', borderBottom:'1px solid var(--drg-line)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <h1 style={{ margin:0, fontSize:16, fontWeight:700, color:'var(--drg-ink)' }}>Winkels &amp; CRM</h1>
            <p style={{ margin:0, fontSize:11, color:'var(--drg-text-3)' }}>{gefilterd.length}/{winkels.length} zichtbaar · {favorieten.length} favorieten</p>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={toggleDense} title={dense ? 'Normaal' : 'Compact'} style={{ padding:6, borderRadius:6, border:'1px solid rgba(45,69,124,0.12)', background: dense ? 'rgba(45,69,124,0.08)' : 'white', cursor:'pointer', color:'rgba(45,69,124,0.6)', display:'flex' }}>
              <IconList size={14} />
            </button>
            <Link href="/dashboard/winkels?view=kaart" style={{ padding:6, borderRadius:6, border:'1px solid rgba(45,69,124,0.12)', background:'white', color:'rgba(45,69,124,0.6)', display:'flex', textDecoration:'none' }}>
              <IconMap size={14} />
            </Link>
          </div>
        </div>
        {/* Zoek */}
        <input
          type="search"
          value={zoekterm}
          onChange={e => setZoekterm(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') persistRecent(zoekterm) }}
          placeholder="Zoek op naam, plaats, postcode of lidnummer…"
          style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid rgba(45,69,124,0.15)', fontSize:13, background:'white', color:'var(--drg-ink)', boxSizing:'border-box', marginBottom: recentZoekopdrachten.length > 0 && !zoekterm ? 6 : 0 }}
        />
        {recentZoekopdrachten.length > 0 && !zoekterm && (
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:4 }}>
            {recentZoekopdrachten.map(r => (
              <button key={r} onClick={() => setZoekterm(r)} style={{ padding:'2px 8px', borderRadius:999, fontSize:11, background:'rgba(45,69,124,0.06)', border:'1px solid rgba(45,69,124,0.12)', color:'var(--drg-text-2)', cursor:'pointer' }}>
                {r}
              </button>
            ))}
          </div>
        )}
        {/* Filters */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
          <select value={filterLand} onChange={e => { setFilterLand(e.target.value as typeof filterLand); setFilterProvincie('alle') }} style={selectStyle}>
            <option value="alle">Alle landen</option>
            <option value="Netherlands">🇳🇱 Nederland</option>
            <option value="Belgium">🇧🇪 België</option>
          </select>
          <select value={filterProvincie} onChange={e => setFilterProvincie(e.target.value)} style={selectStyle}>
            {provincies.map(p => <option key={p} value={p}>{p === 'alle' ? 'Alle provincies' : p}</option>)}
          </select>
          <select value={filterRegio} onChange={e => setFilterRegio(e.target.value)} style={selectStyle}>
            {regios.map(r => <option key={r} value={r}>{r === 'alle' ? 'Alle regio\'s' : r}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} style={selectStyle}>
            <option value="alle">Alle statussen</option>
            <option value="actief">Actief</option>
            <option value="geblokkeerd">Geblokkeerd</option>
          </select>
          <select value={filterFormule} onChange={e => setFilterFormule(e.target.value)} style={selectStyle}>
            {formules.map(f => <option key={f} value={f}>{f === 'alle' ? 'Alle formules' : f}</option>)}
          </select>
          {filtersActief && (
            <button onClick={wisFilters} style={{ padding:'5px 10px', borderRadius:6, background:'rgba(45,69,124,0.06)', border:'1px solid rgba(45,69,124,0.12)', color:'rgba(45,69,124,0.7)', fontSize:12, cursor:'pointer', fontWeight:600 }}>Wis filters</button>
          )}
        </div>
      </div>
      {/* Lijst */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {gefilterd.length === 0 && (
          <p style={{ padding:'20px 12px', fontSize:13, color:'var(--drg-text-3)', textAlign:'center' }}>Geen winkels gevonden.</p>
        )}
        {favorieteWinkels.length > 0 && (
          <>
            <div style={{ padding:'8px 12px 4px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>★ Mijn winkels</div>
            {favorieteWinkels.map((w, i) => <WinkelRij key={w.id} w={w} kleurIdx={i} />)}
          </>
        )}
        {andereWinkels.length > 0 && (
          <>
            <div style={{ padding:'8px 12px 4px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--drg-text-3)' }}>Alle winkels</div>
            {andereWinkels.map((w, i) => <WinkelRij key={w.id} w={w} kleurIdx={favorieteWinkels.length + i} />)}
          </>
        )}
      </div>
    </div>
  )
}
