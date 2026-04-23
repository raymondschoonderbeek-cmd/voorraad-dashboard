import { MfaGuard } from '@/components/MfaGuard'
import { DashboardShell } from '@/components/DashboardShell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <MfaGuard>
      <DashboardShell>{children}</DashboardShell>
    </MfaGuard>
  )
}
