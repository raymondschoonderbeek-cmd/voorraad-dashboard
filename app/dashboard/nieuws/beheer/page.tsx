'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NieuwsBeheerTab } from '@/components/nieuws/NieuwsBeheerTab'
import { dashboardUi, FONT_FAMILY } from '@/lib/theme'

export default function NieuwsBeheerPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const res = await fetch('/api/auth/session-info')
      const info = await res.json().catch(() => ({}))
      if (cancelled) return
      setAllowed(info.canManageInterneNieuws === true)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (allowed === false) router.replace('/dashboard/nieuws')
  }, [allowed, router])

  if (allowed === null) {
    return (
      <div style={{ minHeight: '100%', fontFamily: FONT_FAMILY, color: dashboardUi.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
        Laden…
      </div>
    )
  }

  if (!allowed) return null

  return (
    <div style={{ minHeight: '100%', fontFamily: FONT_FAMILY }}>
      <div className="max-w-4xl mx-auto w-full" style={{ padding: '24px 28px' }}>
        <NieuwsBeheerTab />
      </div>
    </div>
  )
}
