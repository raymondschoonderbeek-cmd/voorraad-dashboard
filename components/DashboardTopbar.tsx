'use client'

import { usePathname } from 'next/navigation'
import { DYNAMO_BLUE_LIGHT, FONT_FAMILY as F } from '@/lib/theme'

const TOPBAR_BG = 'var(--drg-topbar-bg)'
const BORDER = 'var(--drg-topbar-border)'
const TEXT_MUTED = 'rgba(255,255,255,0.42)'
const TEXT_MAIN = 'rgba(255,255,255,0.88)'

const PAGINA_TITELS: Record<string, string> = {
  '/dashboard': 'Home — overzicht',
  '/dashboard/nieuws': 'Intern nieuws',
  '/dashboard/nieuws/beheer': 'Nieuwsberichten beheer',
  '/dashboard/lunch': 'Lunch',
  '/dashboard/it-cmdb': 'IT-hardware (CMDB)',
  '/dashboard/winkels': 'Winkels & vestigingen',
  '/dashboard/beschikbaarheid': 'Beschikbaarheid team',
  '/dashboard/beheer': 'Beheer',
  '/dashboard/instellingen': 'Instellingen',
  '/dashboard/campagne-fietsen': 'Campagnefietsen',
  '/dashboard/brand-groep': 'Merk / Groep',
}

function paginaTitel(pathname: string): string {
  if (PAGINA_TITELS[pathname]) return PAGINA_TITELS[pathname]
  for (const [prefix, label] of Object.entries(PAGINA_TITELS)) {
    if (pathname.startsWith(prefix + '/')) return label
  }
  return 'DRG Portal'
}

export function DashboardTopbar() {
  const pathname = usePathname()
  const titel = paginaTitel(pathname)

  return (
    <header className="drg-topbar" style={{
      height: 48, background: TOPBAR_BG,
      borderBottom: `1px solid ${BORDER}`,
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 16,
      flexShrink: 0, zIndex: 50,
      fontFamily: F,
    }}>
      {/* Merk + Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.15em', color: '#ffffff', textTransform: 'uppercase', flexShrink: 0 }}>DYNAMO</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>|</span>
        <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 500, flexShrink: 0 }}>DRG Portal</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: TEXT_MUTED, flexShrink: 0 }} aria-hidden>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titel}
        </span>
      </div>

      {/* Zoekbalk */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '6px 12px',
        width: 280, flexShrink: 0,
        cursor: 'text',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: TEXT_MUTED, flexShrink: 0 }} aria-hidden>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span style={{ fontSize: 12, color: TEXT_MUTED, flex: 1 }}>Zoek module, winkel, artikel…</span>
        <kbd style={{
          fontSize: 10, fontWeight: 600, color: TEXT_MUTED,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, padding: '1px 5px', lineHeight: '16px',
        }}>⌘K</kbd>
      </div>

      {/* Rechts: acties */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* Notificatie */}
        <button style={{
          width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: TEXT_MUTED, transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--drg-hover-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="Notificaties"
          aria-label="Notificaties"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
      </div>
    </header>
  )
}
