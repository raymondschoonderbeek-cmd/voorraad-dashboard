import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type FtpFoutNotificatie = {
  id: number
  koppeling_naam: string | null
  bericht: string
  status: string
  created_at: string
}

/**
 * GET /api/notifications/ftp-fouten
 * Geeft FTP-webhook-fouten van de laatste 7 dagen terug (admin only).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ fouten: [] })

  const { data: rol } = await supabase
    .from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  if (rol?.rol !== 'admin') return NextResponse.json({ fouten: [] })

  const admin = createAdminClient()
  const zeven = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Log-entries ophalen
  const { data: logData } = await admin
    .from('ftp_webhook_log')
    .select('id, koppeling_id, status, bericht, created_at')
    .in('status', ['fout', 'auth_fout'])
    .gte('created_at', zeven)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!logData?.length) return NextResponse.json({ fouten: [] })

  // Koppeling-namen ophalen
  const koppelingIds = [...new Set(logData.map(r => r.koppeling_id).filter(Boolean))]
  let namenMap: Record<number, string> = {}
  if (koppelingIds.length) {
    const { data: namen } = await admin
      .from('ftp_koppeling_instellingen')
      .select('id, naam')
      .in('id', koppelingIds)
    namenMap = Object.fromEntries((namen ?? []).map(r => [r.id, r.naam]))
  }

  const fouten: FtpFoutNotificatie[] = logData.map(r => ({
    id: r.id,
    koppeling_naam: r.koppeling_id ? (namenMap[r.koppeling_id] ?? `Koppeling ${r.koppeling_id}`) : null,
    bericht: r.bericht,
    status: r.status,
    created_at: r.created_at,
  }))

  return NextResponse.json({ fouten })
}
