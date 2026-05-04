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

export type FtpNietGedraaidNotificatie = {
  id: number
  naam: string
  laatste_run: string | null
}

/**
 * GET /api/notifications/ftp-fouten
 * Geeft FTP-webhook-fouten (7 dagen) en actieve koppelingen die >26u niet gedraaid hebben (admin only).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ fouten: [], niet_gedraaid: [] })

  const { data: rol } = await supabase
    .from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  if (rol?.rol !== 'admin') return NextResponse.json({ fouten: [], niet_gedraaid: [] })

  const admin = createAdminClient()
  const zeven = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Actieve koppelingen ophalen
  const { data: koppelingen } = await admin
    .from('ftp_koppeling_instellingen')
    .select('id, naam')
    .eq('actief', true)

  // Laatste log per actieve koppeling ophalen
  const actieveIds = (koppelingen ?? []).map(k => k.id as number)
  const { data: alleLogs } = actieveIds.length > 0
    ? await admin
        .from('ftp_webhook_log')
        .select('koppeling_id, created_at')
        .in('koppeling_id', actieveIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const lastRunMap = new Map<number, string>()
  for (const row of alleLogs ?? []) {
    const kid = row.koppeling_id as number
    if (!lastRunMap.has(kid)) lastRunMap.set(kid, row.created_at as string)
  }

  const grens = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
  const niet_gedraaid: FtpNietGedraaidNotificatie[] = (koppelingen ?? [])
    .filter(k => {
      const last = lastRunMap.get(k.id as number) ?? null
      return !last || last < grens
    })
    .map(k => ({
      id: k.id as number,
      naam: k.naam as string,
      laatste_run: lastRunMap.get(k.id as number) ?? null,
    }))

  // Log-fouten ophalen
  const { data: logData } = await admin
    .from('ftp_webhook_log')
    .select('id, koppeling_id, status, bericht, created_at')
    .in('status', ['fout', 'auth_fout'])
    .gte('created_at', zeven)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!logData?.length) return NextResponse.json({ fouten: [], niet_gedraaid })

  // Koppeling-namen ophalen voor fouten
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

  return NextResponse.json({ fouten, niet_gedraaid })
}
