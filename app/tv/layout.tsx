import type { ReactNode } from 'react'
import '@/app/globals.css'

export const metadata = { title: 'DRG TV' }

/**
 * TV-layout — minimalistisch, geen sidebar/topbar, geen auth.
 * Zwarte body vangt de buitenrand op bij schaalverschillen (TvStage).
 */
export default function TvLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          background: '#0E1726',
          cursor: 'none',
          userSelect: 'none',
        }}
      >
        {children}
      </body>
    </html>
  )
}
