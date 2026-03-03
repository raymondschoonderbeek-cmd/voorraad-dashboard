import { MfaGuard } from '@/components/MfaGuard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MfaGuard>{children}</MfaGuard>
}
