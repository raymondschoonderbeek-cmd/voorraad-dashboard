'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { FONT_FAMILY as F } from '@/lib/theme'
import type { FtpFoutNotificatie, FtpNietGedraaidNotificatie, SyncNietActueelNotificatie } from '@/app/api/notifications/ftp-fouten/route'

const GEZIEN_KEY = 'dynamo_ftp_notificaties_gezien_tot'

const TOPBAR_BG = 'var(--drg-topbar-bg)'
const BORDER = 'var(--drg-topbar-border)'
const TEXT_MUTED = 'rgba(255,255,255,0.42)'
const TEXT_MAIN = 'rgba(255,255,255,0.88)'

const PAGINA_TITELS: Record<string, string> = {
  '/dashboard': 'Home — overzicht',
  '/dashboard/nieuws': 'Intern nieuws',
  '/dashboard/nieuws/beheer': 'Nieuwsberichten beheer',
  '/dashboard/lunch': 'Lunch',
  '/dashboard/lunch/beheer': 'Lunch beheer',
  '/dashboard/lunch/overzicht': 'Mijn bestellingen',
  '/dashboard/it-cmdb': 'IT-hardware (CMDB)',
  '/dashboard/it-cmdb/catalogus': 'IT-hardware catalogus',
  '/dashboard/it-cmdb/gebruikers': 'IT-hardware gebruikers',
  '/dashboard/winkels': 'Winkels & vestigingen',
  '/dashboard/beschikbaarheid': 'Beschikbaarheid team',
  '/dashboard/beheer': 'Beheer',
  '/dashboard/instellingen': 'Instellingen',
  '/dashboard/instellingen/beschikbaarheid': 'Beschikbaarheid',
  '/dashboard/campagne-fietsen': 'Campagnefietsen',
  '/dashboard/brand-groep': 'Merk / Groep',
  '/dashboard/ftp-koppeling': 'Integraties & statussen',
  '/dashboard/voorraad': 'Voorraad',
}

function paginaTitel(pathname: string): string {
  if (PAGINA_TITELS[pathname]) return PAGINA_TITELS[pathname]
  for (const [prefix, label] of Object.entries(PAGINA_TITELS)) {
    if (pathname.startsWith(prefix + '/')) return label
  }
  return 'DRG Portal'
}

function initialen(naam: string): string {
  const delen = naam.trim().split(/\s+/)
  if (delen.length >= 2) return (delen[0][0] + delen[delen.length - 1][0]).toUpperCase()
  return naam.slice(0, 2).toUpperCase() || '?'
}

function NotificatieBel() {
  const [fouten, setFouten] = useState<FtpFoutNotificatie[]>([])
  const [nietGedraaid, setNietGedraaid] = useState<FtpNietGedraaidNotificatie[]>([])
  const [syncNietActueel, setSyncNietActueel] = useState<SyncNietActueelNotificatie[]>([])
  const [open, setOpen] = useState(false)
  // Lazy init: lees localStorage alleen client-side (SSR-safe)
  const [gezienTot, setGezienTot] = useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem(GEZIEN_KEY) ?? '') : ''
  )
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/notifications/ftp-fouten')
      .then(r => r.json())
      .then((d: { fouten?: FtpFoutNotificatie[]; niet_gedraaid?: FtpNietGedraaidNotificatie[]; sync_niet_actueel?: SyncNietActueelNotificatie[] }) => {
        setFouten(d.fouten ?? [])
        setNietGedraaid(d.niet_gedraaid ?? [])
        setSyncNietActueel(d.sync_niet_actueel ?? [])
      })
      .catch(() => {})
  }, [])

  // Klik buiten → sluiten
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const ongelezenFouten = fouten.filter(f => !gezienTot || f.created_at > gezienTot).length
  const ongelezen = ongelezenFouten + nietGedraaid.length + syncNietActueel.length

  function openPanel() {
    setOpen(v => !v)
    if (!open) {
      // Markeer fouten als gezien (niet_gedraaid blijft altijd zichtbaar tot opgelost)
      const nu = new Date().toISOString()
      localStorage.setItem(GEZIEN_KEY, nu)
      setGezienTot(nu)
    }
  }

  return (
    <div ref={ref} className="hidden md:block" style={{ position: 'relative' }}>
      <button
        onClick={openPanel}
        style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT_MUTED, transition: 'background 0.15s', position: 'relative' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        title="Integratie-meldingen"
        aria-label="Integratie-meldingen"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {ongelezen > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '1.5px solid var(--drg-topbar-bg)' }} aria-hidden />
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 38, right: 0, width: 320, background: 'white', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: '1px solid rgba(45,69,124,0.12)', zIndex: 200, overflow: 'hidden', fontFamily: F }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(45,69,124,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--drg-ink-2)' }}>Integratie-meldingen</span>
            <Link href="/dashboard/ftp-koppeling" onClick={() => setOpen(false)} style={{ fontSize: 11, color: 'var(--drg-ink-2)', opacity: 0.6, textDecoration: 'none', fontWeight: 600 }}>Naar integraties →</Link>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {syncNietActueel.length > 0 && (
              <>
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                  Sync niet actueel (&gt;26u)
                </div>
                {syncNietActueel.map(s => (
                  <div key={s.label} style={{ padding: '9px 16px', borderBottom: '1px solid rgba(45,69,124,0.06)', background: '#fffdf5' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e', display: 'block', marginBottom: 2 }}>{s.label}</span>
                    <p style={{ margin: 0, fontSize: 11, color: '#b45309', lineHeight: 1.4 }}>
                      {s.laatste_sync
                        ? `Laatste sync: ${new Date(s.laatste_sync).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                        : 'Nog nooit gesynchroniseerd'}
                    </p>
                  </div>
                ))}
              </>
            )}
            {nietGedraaid.length > 0 && (
              <>
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                  Niet gedraaid (&gt;26u)
                </div>
                {nietGedraaid.map(k => (
                  <div key={k.id} style={{ padding: '9px 16px', borderBottom: '1px solid rgba(45,69,124,0.06)', background: '#fffdf5' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>{k.naam}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: '#b45309', lineHeight: 1.4 }}>
                      {k.laatste_run
                        ? `Laatste run: ${new Date(k.laatste_run).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                        : 'Nog nooit gedraaid'}
                    </p>
                  </div>
                ))}
              </>
            )}
            {fouten.length > 0 && (
              <>
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#991b1b', background: '#fff5f5', borderBottom: '1px solid #fecaca' }}>
                  Fouten (7 dagen)
                </div>
                {fouten.map(f => (
                  <div key={f.id} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(45,69,124,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--drg-ink-2)' }}>{f.koppeling_naam ?? 'Onbekende koppeling'}</span>
                      <span style={{ fontSize: 10, color: 'rgba(45,69,124,0.4)' }}>{new Date(f.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: '#dc2626', lineHeight: 1.4 }}>{f.bericht}</p>
                  </div>
                ))}
              </>
            )}
            {fouten.length === 0 && nietGedraaid.length === 0 && syncNietActueel.length === 0 && (
              <p style={{ margin: 0, padding: '14px 16px', fontSize: 13, color: 'rgba(45,69,124,0.5)' }}>Geen meldingen.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function DashboardTopbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const pathname = usePathname()
  const titel = paginaTitel(pathname)
  const [naam, setNaam] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('gebruiker_rollen').select('naam').eq('user_id', user.id).single()
        .then(({ data }) => {
          setNaam(data?.naam || user.email?.split('@')[0] || '')
        })
    })
  }, [])

  const avatar = naam ? initialen(naam) : '?'

  return (
    <header className="drg-topbar" style={{
      height: 48, background: TOPBAR_BG,
      borderBottom: `1px solid ${BORDER}`,
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 10,
      flexShrink: 0, zIndex: 60,
      fontFamily: F,
    }}>

      {/* Hamburger — alleen mobiel */}
      <button
        className="md:hidden"
        type="button"
        onClick={onMenuToggle}
        aria-label="Menu openen"
        style={{
          width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: TEXT_MAIN, flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Merk + Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        {/* Desktop: volledige breadcrumb */}
        <span className="hidden md:inline" style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.15em', color: '#ffffff', textTransform: 'uppercase', flexShrink: 0 }}>DYNAMO</span>
        <span className="hidden md:inline" style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>|</span>
        <span className="hidden md:inline" style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 500, flexShrink: 0 }}>DRG Portal</span>
        <svg className="hidden md:block" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: TEXT_MUTED, flexShrink: 0 }} aria-hidden>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        {/* Paginatitel — altijd zichtbaar */}
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titel}
        </span>
      </div>

      {/* Zoekbalk — alleen desktop */}
      <div className="hidden md:flex" style={{
        alignItems: 'center', gap: 8,
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

      {/* Rechts: notificaties + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <NotificatieBel />

        {/* Avatar */}
        <Link
          href="/dashboard/instellingen"
          title={naam || 'Instellingen'}
          style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#ffffff',
            textDecoration: 'none', flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          aria-label="Mijn instellingen"
        >
          {avatar}
        </Link>
      </div>
    </header>
  )
}
