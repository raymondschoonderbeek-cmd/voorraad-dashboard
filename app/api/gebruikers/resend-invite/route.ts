import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'
import { sendWelcomeEmail } from '@/lib/send-welcome-email'

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .single()
  return data?.rol === 'admin'
}

function genPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 32])
    .join('')
}

/** POST: Stuur uitnodigingsmail opnieuw naar bestaande gebruiker (nieuw wachtwoord per e-mail) */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { user_id } = await request.json()
  const userId = String(user_id ?? '').trim()
  if (!userId) return NextResponse.json({ error: 'user_id ontbreekt' }, { status: 400 })

  if (!hasAdminKey()) {
    return NextResponse.json({
      error: 'Opnieuw uitnodigen vereist SUPABASE_SERVICE_ROLE_KEY.',
    }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // E-mail ophalen via RPC
  const { data: emails } = await adminClient.rpc('get_user_emails', {
    user_ids: [userId],
  })
  const row = Array.isArray(emails) && emails.length > 0 ? emails[0] : null
  const email = row && typeof (row as { email?: string }).email === 'string' ? (row as { email: string }).email : null
  if (!email) {
    return NextResponse.json({ error: 'E-mailadres van gebruiker niet gevonden.' }, { status: 404 })
  }

  // Naam uit rol
  const { data: rol } = await adminClient
    .from('gebruiker_rollen')
    .select('naam, rol')
    .eq('user_id', userId)
    .single()
  const naam = (rol as { naam?: string })?.naam ?? email
  const rolNaam = (rol as { rol?: string })?.rol ?? 'viewer'

  const nieuwWachtwoord = genPassword()

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    password: nieuwWachtwoord,
  })
  if (updateError) {
    return NextResponse.json({ error: `Wachtwoord bijwerken mislukt: ${updateError.message}` }, { status: 500 })
  }

  await adminClient
    .from('gebruiker_rollen')
    .update({ must_change_password: true })
    .eq('user_id', userId)

  const loginUrl = `${request.nextUrl.origin}/login`
  const emailResult = await sendWelcomeEmail({
    to: email,
    naam,
    wachtwoord: nieuwWachtwoord,
    loginUrl,
    rol: rolNaam,
  })
  if (!emailResult.ok) {
    return NextResponse.json({
      success: true,
      warning: `Inloggegevens zijn bijgewerkt, maar de e-mail kon niet worden verstuurd: ${emailResult.error}`,
    })
  }

  return NextResponse.json({ success: true })
}
