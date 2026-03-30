'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NieuwsBeheerTab } from '@/components/nieuws/NieuwsBeheerTab'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'

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
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: dashboardUi.pageBg, fontFamily: FONT_FAMILY, color: dashboardUi.textMuted }}>
        Laden…
      </div>
    )
  }

  if (!allowed) return null

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: FONT_FAMILY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-center gap-2 py-2 min-h-[56px]">
          <Link
            href="/dashboard/nieuws"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90"
          >
            ← Nieuws
          </Link>
          <span className="text-white text-sm font-semibold">Beheer nieuwsberichten</span>
        </div>
      </header>
      <main className="flex-1 p-3 sm:p-5 max-w-4xl mx-auto w-full">
        <NieuwsBeheerTab />
      </main>
    </div>
  )
}
