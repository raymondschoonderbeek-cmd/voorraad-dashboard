'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DYNAMO_BLUE, DYNAMO_BLUE_LIGHT, DYNAMO_GOLD, FONT_FAMILY as F } from '@/lib/theme'
import { useTheme } from '@/components/ThemeProvider'

const SIDEBAR_BG = '#ffffff'
const SIDEBAR_ACTIVE = '#2D457C'
const SIDEBAR_HOVER = 'rgba(45,69,124,0.06)'
const TEXT_DIM = '#6691AE'
const TEXT_NORMAL = '#2D457C'
const TEXT_BRIGHT = '#2D457C'

type NavItem = {
  id: string
  label: string
  href: string
  icon: React.ReactNode
  badge?: number | string | null
  section?: string
}

function IconHome() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IconBox() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
}
function IconChart() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
}
function IconBike() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 0 0-1-1h-1V4"/><path d="M9 17.5 12 10l2 3.5"/><path d="M16 17.5 12 10 8.5 17.5"/></svg>
}
function IconNewspaper() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8"/><path d="M10 10h8"/></svg>
}
function IconChat() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
}
function IconLaptop() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
}
function IconMap() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
}
function IconUsers() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function IconLunch() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
}
function IconReceipt() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M12 16H8"/></svg>
}
function IconSettings() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
function IconBeheer() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}

function Badge({ count }: { count: number | string }) {
  return (
    <span style={{
      minWidth: 18, height: 18, borderRadius: 100, fontSize: 10, fontWeight: 700,
      background: DYNAMO_GOLD, color: DYNAMO_BLUE,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 5px', lineHeight: 1, flexShrink: 0,
    }}>
      {count}
    </span>
  )
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 10px', borderRadius: 6,
        color: active ? '#ffffff' : TEXT_NORMAL,
        background: active ? SIDEBAR_ACTIVE : 'transparent',
        fontSize: 13, fontWeight: active ? 600 : 500,
        fontFamily: F, textDecoration: 'none',
        transition: 'background 0.15s, color 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = SIDEBAR_HOVER }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <span style={{ color: active ? '#ffffff' : TEXT_DIM, flexShrink: 0, display: 'flex' }}>
        {item.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>
      {item.badge != null && item.badge !== 0 && <Badge count={item.badge} />}
    </Link>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: TEXT_DIM, fontFamily: F, padding: '14px 10px 4px',
    }}>
      {label}
    </div>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(45,69,124,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: dark ? DYNAMO_BLUE_LIGHT : DYNAMO_GOLD, flexShrink: 0 }} aria-hidden>
        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <button
        role="switch"
        aria-checked={dark}
        aria-label="Dark mode aan/uit"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        style={{
          width: 36, height: 20, borderRadius: 100, border: 'none', cursor: 'pointer',
          background: dark ? DYNAMO_BLUE_LIGHT : 'rgba(255,255,255,0.15)',
          position: 'relative', transition: 'background 0.25s', padding: 0, flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: dark ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: 'white', transition: 'left 0.25s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: dark ? DYNAMO_BLUE_LIGHT : '#6691AE', flexShrink: 0 }} aria-hidden>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </div>
  )
}

export function DashboardSidebar({ isOpen = false, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const [gebruiker, setGebruiker] = useState('')
  const [rol, setRol] = useState('')
  const [modules, setModules] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [nieuwsBadge, setNieuwsBadge] = useState(0)
  const [initials, setInitials] = useState('?')

  useEffect(() => {
    const supabase = createClient()

    async function laad() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: rolData }, sessionRes, nieuwsRes] = await Promise.all([
        supabase.from('gebruiker_rollen').select('rol, naam').eq('user_id', user.id).single(),
        fetch('/api/auth/session-info'),
        fetch('/api/news/unread').catch(() => null),
      ])

      const naam = rolData?.naam || user.email?.split('@')[0] || ''
      setGebruiker(naam)
      setRol(rolData?.rol === 'admin' ? 'Beheerder' : rolData?.rol || '')
      setIsAdmin(rolData?.rol === 'admin')
      setInitials(naam.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?')

      const session = await sessionRes.json().catch(() => ({}))
      setModules(session.dashboardModules ?? [])

      if (nieuwsRes?.ok) {
        const d = await nieuwsRes.json().catch(() => ({}))
        setNieuwsBadge(d.count ?? 0)
      }
    }

    void laad()
  }, [])

  async function uitloggen() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  const heeftModule = (id: string) => modules.includes(id)

  return (
    <aside
      className={`drg-sidebar${isOpen ? ' drg-sidebar--open' : ''}`}
      style={{
        width: 240, background: SIDEBAR_BG,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(45,69,124,0.12)',
        overflow: 'hidden',
        fontFamily: F,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '16px 14px 14px', borderBottom: '1px solid rgba(45,69,124,0.1)', flexShrink: 0 }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.18em', color: '#2D457C', fontFamily: F, textTransform: 'uppercase', lineHeight: 1 }}>DYNAMO</span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0', scrollbarWidth: 'none' }}>

        {/* Hoofdnavigatie */}
        <NavLink item={{ id: 'home', label: 'Home', href: '/dashboard', icon: <IconHome /> }} active={pathname === '/dashboard'} onClick={onClose} />
        {heeftModule('voorraad') && (
          <NavLink item={{ id: 'voorraad', label: 'Voorraad', href: '/dashboard/voorraad', icon: <IconBox /> }} active={pathname === '/dashboard/voorraad' || pathname.startsWith('/dashboard/voorraad/')} onClick={onClose} />
        )}
        {heeftModule('brand-groep') && (
          <NavLink item={{ id: 'brand', label: 'Merk / Groep', href: '/dashboard/brand-groep', icon: <IconChart /> }} active={isActive('/dashboard/brand-groep')} onClick={onClose} />
        )}
        {heeftModule('campagne-fietsen') && (
          <NavLink item={{ id: 'campagne', label: 'Campagnefietsen', href: '/dashboard/campagne-fietsen', icon: <IconBike /> }} active={isActive('/dashboard/campagne-fietsen')} onClick={onClose} />
        )}

        {/* Communicatie */}
        {(heeftModule('branche-nieuws') || heeftModule('interne-nieuws') || heeftModule('nieuws-redacteur') || heeftModule('lunch')) && (
          <>
            <SectionLabel label="Communicatie" />
            {(heeftModule('interne-nieuws') || heeftModule('nieuws-redacteur')) && (
              <NavLink item={{ id: 'nieuws', label: 'Intern nieuws', href: '/dashboard/nieuws', icon: <IconChat />, badge: nieuwsBadge || null }} active={isActive('/dashboard/nieuws')} onClick={onClose} />
            )}
            {heeftModule('lunch') && (
              <NavLink item={{ id: 'lunch', label: 'Lunch', href: '/dashboard/lunch', icon: <IconLunch /> }} active={pathname === '/dashboard/lunch'} onClick={onClose} />
            )}
          </>
        )}

        {/* IT */}
        {heeftModule('it-cmdb') && (
          <>
            <SectionLabel label="IT" />
            <NavLink item={{ id: 'it', label: 'IT-hardware', href: '/dashboard/it-cmdb', icon: <IconLaptop /> }} active={isActive('/dashboard/it-cmdb')} onClick={onClose} />
          </>
        )}

        {/* Organisatie */}
        {(heeftModule('winkels') || heeftModule('beschikbaarheid')) && (
          <>
            <SectionLabel label="Organisatie" />
            {heeftModule('winkels') && (
              <NavLink item={{ id: 'winkels', label: 'Winkels', href: '/dashboard/winkels', icon: <IconMap /> }} active={isActive('/dashboard/winkels')} onClick={onClose} />
            )}
            {heeftModule('beschikbaarheid') && (
              <NavLink item={{ id: 'beschikbaar', label: 'Beschikbaarheid', href: '/dashboard/beschikbaarheid', icon: <IconUsers /> }} active={isActive('/dashboard/beschikbaarheid')} onClick={onClose} />
            )}
          </>
        )}

        {/* Admin */}
        {isAdmin && (
          <>
            <SectionLabel label="Beheer" />
            <NavLink item={{ id: 'beheer', label: 'Beheer', href: '/dashboard/beheer', icon: <IconBeheer /> }} active={isActive('/dashboard/beheer')} onClick={onClose} />
          </>
        )}

        {/* Gazelle orders: admin of module-recht */}
        {(isAdmin || heeftModule('gazelle-orders')) && (
          <NavLink item={{ id: 'gazelle-orders', label: 'Gazelle pakket orders', href: '/dashboard/gazelle-pakket-orders', icon: <IconReceipt /> }} active={isActive('/dashboard/gazelle-pakket-orders')} onClick={onClose} />
        )}

        <SectionLabel label="" />
        <NavLink item={{ id: 'instellingen', label: 'Instellingen', href: '/dashboard/instellingen', icon: <IconSettings /> }} active={isActive('/dashboard/instellingen')} onClick={onClose} />
      </nav>

      <ThemeToggle />

      {/* User profiel onderaan */}
      <div style={{
        padding: '10px 10px 12px',
        borderTop: '1px solid rgba(45,69,124,0.1)',
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: DYNAMO_BLUE, color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_BRIGHT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gebruiker}</div>
          <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 1 }}>{rol}</div>
        </div>
        <button
          onClick={uitloggen}
          title="Uitloggen"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, padding: 4, display: 'flex', borderRadius: 5, transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = TEXT_NORMAL)}
          onMouseLeave={e => (e.currentTarget.style.color = TEXT_DIM)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}
