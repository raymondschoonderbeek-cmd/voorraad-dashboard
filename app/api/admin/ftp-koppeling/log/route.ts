import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Unauthorized', status: 401 }
  const { data: rol } = await supabase.from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  if (rol?.rol !== 'admin') return { ok: false as const, error: 'Geen toegang', status: 403 }
  return { ok: true as const }
}

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const koppelingId = searchParams.get('koppeling_id')

  const adminClient = createAdminClient()
  let query = adminClient
    .from('ftp_webhook_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (koppelingId) {
    query = query.eq('koppeling_id', koppelingId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ log: data ?? [] })
}
