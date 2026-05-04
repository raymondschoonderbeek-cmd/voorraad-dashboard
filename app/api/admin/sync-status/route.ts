import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })

  const admin = createAdminClient()

  // Vendit stock: meest recente file_date_time uit vendit_stock
  let venditStockDatum: string | null = null
  try {
    const { data } = await admin
      .from('vendit_stock')
      .select('file_date_time')
      .not('file_date_time', 'is', null)
      .order('file_date_time', { ascending: false })
      .limit(1)
    if (data && data.length > 0) {
      venditStockDatum = (data[0] as { file_date_time: string }).file_date_time
    }
  } catch {
    // vendit_stock tabel bestaat niet of geen toegang
  }

  // SAP ledenlijst sync: laatste run via sync_meta
  let sapSyncDatum: string | null = null
  let sapSyncStatus: string | null = null
  let sapSyncRegels: number | null = null
  try {
    const { data } = await admin
      .from('sync_meta')
      .select('synced_at, status, regels_bijgewerkt')
      .eq('sync_type', 'sap_ledenlijst')
      .single()
    if (data) {
      const row = data as { synced_at: string; status: string; regels_bijgewerkt: number | null }
      sapSyncDatum = row.synced_at
      sapSyncStatus = row.status
      sapSyncRegels = row.regels_bijgewerkt
    }
  } catch {
    // sync_meta tabel bestaat nog niet of geen rij
  }

  return NextResponse.json({
    vendit_stock: { datum: venditStockDatum },
    sap_ledenlijst: { datum: sapSyncDatum, status: sapSyncStatus, regels_bijgewerkt: sapSyncRegels },
  })
}
