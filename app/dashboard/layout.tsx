import { MfaGuard } from '@/components/MfaGuard'
import { DashboardSidebar } from '@/components/DashboardSidebar'
import { DashboardTopbar } from '@/components/DashboardTopbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <MfaGuard>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f3f8' }}>
        <DashboardSidebar />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <DashboardTopbar />
          <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
            {children}
          </main>
        </div>
      </div>
    </MfaGuard>
  )
}
