'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Controleert of MFA-verificatie of MFA-setup nodig is.
 * Redirect naar /mfa-verify of /dashboard/instellingen indien nodig.
 */
export function MfaGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (pathname === '/mfa-verify') {
      setReady(true)
      return
    }
    if (pathname === '/update-password') {
      setReady(true)
      return
    }

    setReady(false)
    let cancelled = false
    fetch('/api/auth/session-info')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data?.mustChangePassword) {
          router.replace('/update-password')
          return
        }
        if (data?.requiresMfaSetup) {
          if (pathname !== '/dashboard/instellingen') {
            router.replace('/dashboard/instellingen?mfa=verplicht')
          } else {
            setReady(true)
          }
          return
        }
        if (data?.requiresMfaChallenge) {
          router.replace('/mfa-verify')
          return
        }
        // Lunch-only gebruikers: lunch, instellingen, en (bij campagne-toegang) dashboard + campagnefietsen
        const isLunchPath = pathname === '/dashboard/lunch' || pathname.startsWith('/dashboard/lunch/')
        const isInstellingen = pathname === '/dashboard/instellingen'
        const isDashboardHome = pathname === '/dashboard' || pathname === '/dashboard/'
        const isCampagneFietsenPath =
          pathname === '/dashboard/campagne-fietsen' || pathname.startsWith('/dashboard/campagne-fietsen/')
        const lunchExtraAllowed =
          data?.campagneFietsenEnabled === true && (isDashboardHome || isCampagneFietsenPath)
        if (data?.lunchOnly && !isLunchPath && !isInstellingen && !lunchExtraAllowed) {
          router.replace('/dashboard/lunch')
          return
        }
        setReady(true)
      })
      .catch(() => setReady(true))

    return () => { cancelled = true }
  }, [pathname, router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Beveiliging controleren...</div>
      </div>
    )
  }

  return <>{children}</>
}
