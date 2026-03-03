'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Controleert of MFA-verificatie nodig is (IP niet vertrouwd + MFA ingeschakeld).
 * Redirect naar /mfa-verify indien nodig.
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

    let cancelled = false
    fetch('/api/auth/session-info')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data?.requiresMfaChallenge) {
          router.replace('/mfa-verify')
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
