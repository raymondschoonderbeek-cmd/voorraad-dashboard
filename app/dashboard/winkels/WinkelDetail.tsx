'use client'
import { useState } from 'react'
import useSWR from 'swr'
import type { Winkel } from '@/lib/types'
import { StatusPill } from './components/StatusPill'
import { FlagBadge } from './components/FlagBadge'
import { QuickFacts } from './components/QuickFacts'
import { TabOverzicht } from './tabs/TabOverzicht'
import { TabContact } from './tabs/TabContact'
import { TabSystemen } from './tabs/TabSystemen'
import { TabFinancieel } from './tabs/TabFinancieel'
import { TabContracten } from './tabs/TabContracten'
import { TabActiviteit } from './tabs/TabActiviteit'
import { TabFreshdesk } from './tabs/TabFreshdesk'
import { IconArrowLeft, IconPhone, IconMail, IconStar } from '@/components/DashboardIcons'

type Tab = 'overzicht' | 'contact' | 'systemen' | 'financieel' | 'contracten' | 'activiteit' | 'support'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'contact', label: 'Contact' },
  { id: 'systemen', label: 'Systemen' },
  { id: 'financieel', label: 'Financieel' },
  { id: 'contracten', label: 'Contracten' },
  { id: 'activiteit', label: 'Activiteit' },
  { id: 'support', label: 'Support' },
]

const INITIAAL_KLEUREN = ['#2D457C','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#65a30d','#db2777','#854d0e','#0f766e']
const fetcher = (url: string) => fetch(url).then(r => r.json())

function initialen(naam: string) {
  const d = naam.trim().split(/\s+/)
  if (d.length >= 2) return (d[0][0] + d[d.length - 1][0]).toUpperCase()
  return naam.slice(0, 2).toUpperCase()
}

interface Props {
  winkelId: number
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  isAdmin: boolean
  isFavoriet: boolean
  onToggleFavoriet: (id: number) => void
  onTerug: () => void
  showTerugKnop: boolean
}

export function WinkelDetail({ winkelId, activeTab, onTabChange, isAdmin, isFavoriet, onToggleFavoriet, onTerug, showTerugKnop }: Props) {
  const { data: winkel, mutate } = useSWR<Winkel>(`/api/winkels/${winkelId}`, fetcher, { revalidateOnFocus: false })
  const { data: freshdeskData } = useSWR<{ open: unknown[] }>(`/api/winkels/${winkelId}/freshdesk`, fetcher, { revalidateOnFocus: false })
  const aantalOpenTickets = freshdeskData?.open?.length ?? 0

  const kleur = INITIAAL_KLEUREN[winkelId % INITIAAL_KLEUREN.length]

  function handleUpdate(updated: Winkel) {
    void mutate(updated, false)
  }

  if (!winkel) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--drg-text-3)', fontSize:14 }}>
        Laden…
      </div>
    )
  }

  const breadcrumb = [winkel.land === 'Netherlands' ? 'Nederland' : winkel.land === 'Belgium' ? 'België' : winkel.land, winkel.provincie, winkel.stad].filter(Boolean).join(' › ')

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Sticky header */}
      <div style={{ flexShrink:0, padding:'16px 20px 0', borderBottom:'1px solid var(--drg-line)', background:'var(--drg-card)' }}>
        {/* Breadcrumb + terug */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          {showTerugKnop && (
            <button onClick={onTerug} style={{ padding:'4px 8px', borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:'var(--drg-text-2)', display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
              <IconArrowLeft /> Terug
            </button>
          )}
          {breadcrumb && <span style={{ fontSize:12, color:'var(--drg-text-3)' }}>Winkels › {breadcrumb}</span>}
        </div>
        {/* Naam + acties */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
          {/bike\s*totaal/i.test(winkel.naam) ? (
            <div style={{ width:44, height:44, borderRadius:10, background:'white', border:'1px solid rgba(45,69,124,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden', padding:4 }}>
              <img src="/bike-totaal-logo.png" alt="Bike Totaal" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
            </div>
          ) : (
            <div style={{ width:44, height:44, borderRadius:10, background:kleur, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:16, fontWeight:700, flexShrink:0 }}>
              {initialen(winkel.naam)}
            </div>
          )}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--drg-ink)' }}>{winkel.naam}</h2>
              <FlagBadge land={winkel.land} />
              <StatusPill actief={winkel.actief} geblokkeerd={winkel.geblokkeerd} />
              <button onClick={() => onToggleFavoriet(winkel.id)} aria-label={isFavoriet ? 'Verwijder favoriet' : 'Markeer als favoriet'}
                style={{ padding:4, background:'transparent', border:'none', cursor:'pointer', color: isFavoriet ? '#f59e0b' : 'var(--drg-text-3)', fontSize:16 }}>
                <IconStar size={16} />
              </button>
            </div>
            <p style={{ margin:'3px 0 0', fontSize:12, color:'var(--drg-text-2)' }}>
              {[winkel.lidnummer ? `#${winkel.lidnummer}` : null, [winkel.straat, winkel.huisnummer].filter(Boolean).join(' '), winkel.stad, winkel.telefoon, winkel.email].filter(Boolean).join(' · ')}
            </p>
          </div>
          {/* Actieknoppen */}
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            {winkel.telefoon && <a href={`tel:${winkel.telefoon}`} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--drg-line)', background:'white', color:'var(--drg-ink-2)', textDecoration:'none', display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600 }}><IconPhone size={14} /> Bel</a>}
            {winkel.email && <a href={`mailto:${winkel.email}`} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--drg-line)', background:'white', color:'var(--drg-ink-2)', textDecoration:'none', display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600 }}><IconMail size={14} /> Mail</a>}
          </div>
        </div>
        <QuickFacts w={winkel} />
        {/* Tabs */}
        <div style={{ display:'flex', gap:0, marginTop:12, overflowX:'auto' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => onTabChange(tab.id)}
              style={{ padding:'8px 16px', border:'none', borderBottom: activeTab === tab.id ? '2px solid var(--drg-ink-2)' : '2px solid transparent', background:'transparent', cursor:'pointer', fontSize:13, fontWeight: activeTab === tab.id ? 700 : 500, color: activeTab === tab.id ? 'var(--drg-ink-2)' : 'var(--drg-text-2)', whiteSpace:'nowrap', transition:'color 0.15s', display:'flex', alignItems:'center', gap:5 }}>
              {tab.label}
              {tab.id === 'support' && aantalOpenTickets > 0 && (
                <span style={{ padding:'1px 6px', borderRadius:999, fontSize:11, fontWeight:700, background:'#fee2e2', color:'#b91c1c' }}>{aantalOpenTickets}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {/* Tab content — scrollable */}
      <div style={{ flex:1, overflowY:'auto', padding:20 }}>
        {activeTab === 'overzicht' && <TabOverzicht w={winkel} />}
        {activeTab === 'contact' && <TabContact w={winkel} onUpdate={handleUpdate} isAdmin={isAdmin} />}
        {activeTab === 'systemen' && <TabSystemen w={winkel} />}
        {activeTab === 'financieel' && <TabFinancieel w={winkel} />}
        {activeTab === 'contracten' && <TabContracten w={winkel} />}
        {activeTab === 'activiteit' && <TabActiviteit winkelId={winkel.id} />}
        {activeTab === 'support' && <TabFreshdesk winkelId={winkel.id} />}
      </div>
    </div>
  )
}
