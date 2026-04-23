'use client'

import { useState } from 'react'
import { DashboardSidebar } from './DashboardSidebar'
import { DashboardTopbar } from './DashboardTopbar'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <DashboardTopbar onMenuToggle={() => setSidebarOpen(o => !o)} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Overlay — alleen mobiel, sluit sidebar bij klik buiten */}
        {sidebarOpen && (
          <div
            className="md:hidden"
            style={{
              position: 'fixed', inset: 0, top: 48,
              background: 'rgba(14,23,38,0.45)', zIndex: 50,
            }}
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}
        <DashboardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--drg-page-bg)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
