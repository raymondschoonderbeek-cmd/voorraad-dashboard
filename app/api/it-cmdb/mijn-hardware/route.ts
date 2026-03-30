import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * GET: hardware waar de ingelogde gebruiker als assigned_user_id aan gekoppeld is.
 * Geen it-cmdb-module nodig; RLS staat alleen SELECT op eigen rijen toe.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('it_cmdb_hardware')
    .select('id, serial_number, hostname, intune, user_name, device_type, notes, location, updated_at')
    .eq('assigned_user_id', user.id)
    .order('serial_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}
