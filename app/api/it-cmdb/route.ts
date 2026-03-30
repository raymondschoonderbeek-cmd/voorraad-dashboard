import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * GET: alle hardware-regels (filter: q, location, intune).
 * POST: nieuwe regel.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const location = searchParams.get('location')?.trim()
  const intune = searchParams.get('intune')?.trim()

  let query = auth.supabase
    .from('it_cmdb_hardware')
    .select('*')
    .order('serial_number', { ascending: true })

  if (location) {
    query = query.ilike('location', `%${location.replace(/%/g, '')}%`)
  }
  if (intune) {
    query = query.ilike('intune', `%${intune.replace(/%/g, '')}%`)
  }
  if (q) {
    const safe = q.replace(/%/g, '').trim()
    if (safe) {
      query = query.or(
        `serial_number.ilike.%${safe}%,hostname.ilike.%${safe}%,user_name.ilike.%${safe}%,device_type.ilike.%${safe}%,notes.ilike.%${safe}%,location.ilike.%${safe}%`
      )
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const serial_number = typeof body.serial_number === 'string' ? body.serial_number.trim() : ''
  if (!serial_number) return NextResponse.json({ error: 'serial_number is verplicht' }, { status: 400 })

  const row = {
    serial_number,
    hostname: typeof body.hostname === 'string' ? body.hostname.trim() : '',
    intune: typeof body.intune === 'string' ? body.intune.trim() || null : null,
    user_name: typeof body.user_name === 'string' ? body.user_name.trim() || null : null,
    device_type: typeof body.device_type === 'string' ? body.device_type.trim() || null : null,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    location: typeof body.location === 'string' ? body.location.trim() || null : null,
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await auth.supabase.from('it_cmdb_hardware').insert(row).select('*').single()
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Dit serienummer bestaat al.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data })
}
