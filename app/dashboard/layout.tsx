import { MfaGuard } from '@/components/MfaGuard'
import { DashboardSidebar } from '@/components/DashboardSidebar'
import { DashboardTopbar } from '@/components/DashboardTopbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <MfaGuard>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <DashboardTopbar />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <DashboardSidebar />
          <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--drg-page-bg)' }}>
            {children}
          </main>
        </div>
      </div>
    </MfaGuard>
  )
}
