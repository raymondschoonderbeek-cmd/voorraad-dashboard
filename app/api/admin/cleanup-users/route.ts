import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'

const ALLOWED_DOMAIN = '@dynamoretailgroup.com'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, user: null }
  const { data: rolData } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', user.id)
    .single()
  if (rolData?.rol !== 'admin') return { error: 'Geen toegang', status: 403, user: null }
  return { error: null, status: 200, user }
}

/** GET — preview: welke gebruikers worden verwijderd */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { error, status, user } = await assertAdmin()
  if (error || !user) return NextResponse.json({ error }, { status })

  if (!hasAdminKey()) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 400 })
  const adminClient = createAdminClient()

  const teVerwijderen: { id: string; email: string }[] = []
  let page = 1
  while (true) {
    const { data: { users: batch } } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (!batch || batch.length === 0) break
    for (const u of batch) {
      const email = (u.email ?? '').toLowerCase()
      if (!email.endsWith(ALLOWED_DOMAIN) && u.id !== user.id) {
        teVerwijderen.push({ id: u.id, email })
      }
    }
    if (batch.length < 1000) break
    page++
  }

  return NextResponse.json({ teVerwijderen, totaal: teVerwijderen.length })
}

/** DELETE — verwijder alle gebruikers zonder @dynamoretailgroup.com */
export async function DELETE(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { error, status, user } = await assertAdmin()
  if (error || !user) return NextResponse.json({ error }, { status })

  if (!hasAdminKey()) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 400 })
  const adminClient = createAdminClient()

  // Verzamel alle te verwijderen users
  const teVerwijderen: { id: string; email: string }[] = []
  let page = 1
  while (true) {
    const { data: { users: batch } } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (!batch || batch.length === 0) break
    for (const u of batch) {
      const email = (u.email ?? '').toLowerCase()
      if (!email.endsWith(ALLOWED_DOMAIN) && u.id !== user.id) {
        teVerwijderen.push({ id: u.id, email })
      }
    }
    if (batch.length < 1000) break
    page++
  }

  let verwijderd = 0
  const fouten: string[] = []

  for (const u of teVerwijderen) {
    // Verwijder uit eigen tabellen
    await adminClient.from('gebruiker_rollen').delete().eq('user_id', u.id)
    await adminClient.from('profiles').delete().eq('user_id', u.id)
    await adminClient.from('gebruiker_winkels').delete().eq('user_id', u.id)

    // Verwijder uit auth
    const { error: delErr } = await adminClient.auth.admin.deleteUser(u.id)
    if (delErr) {
      fouten.push(`${u.email}: ${delErr.message}`)
    } else {
      verwijderd++
    }
  }

  return NextResponse.json({
    success: true,
    verwijderd,
    fouten,
  })
}
