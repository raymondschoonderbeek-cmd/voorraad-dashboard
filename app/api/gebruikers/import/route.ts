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

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  if (!hasAdminKey()) {
    return NextResponse.json({
      error: 'Importeren vereist SUPABASE_SERVICE_ROLE_KEY.',
    }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const users = Array.isArray(body.users) ? body.users : []
  if (users.length === 0) {
    return NextResponse.json({ error: 'Geen gebruikers om te importeren.' }, { status: 400 })
  }
  if (users.length > 100) {
    return NextResponse.json({ error: 'Maximaal 100 gebruikers per import.' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const loginUrl = `${request.nextUrl.origin}/login`
  const toegevoegd: string[] = []
  const bestaand: string[] = []
  const fouten: { rij: number; email: string; message: string }[] = []

  for (let i = 0; i < users.length; i++) {
    const { email, naam, rol } = users[i]
    const emailTrim = String(email ?? '').trim().toLowerCase()
    if (!emailTrim) {
      fouten.push({ rij: i + 1, email: emailTrim || '(leeg)', message: 'E-mail ontbreekt' })
      continue
    }
    const naamTrim = String(naam ?? email ?? '').trim() || emailTrim
    const rolVal = ['viewer', 'lunch', 'admin'].includes(String(rol ?? '').toLowerCase().trim())
      ? String(rol).toLowerCase().trim()
      : 'viewer'

    const wachtwoord = genPassword()
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: emailTrim,
      password: wachtwoord,
      email_confirm: true,
    })

    if (createError) {
      const isAlreadyRegistered =
        createError.message?.toLowerCase().includes('already been registered') ||
        createError.message?.toLowerCase().includes('already registered')
      if (isAlreadyRegistered) {
        const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = authUsers?.find(u => u.email?.toLowerCase() === emailTrim)
        if (!existing) {
          fouten.push({ rij: i + 1, email: emailTrim, message: 'E-mail bestaat al, kon niet vinden' })
          continue
        }
        const { data: inRollen } = await adminClient.from('gebruiker_rollen').select('id').eq('user_id', existing.id).single()
        if (inRollen) {
          bestaand.push(emailTrim)
          continue
        }
        const { error: rolErr } = await adminClient.from('gebruiker_rollen').upsert({
          user_id: existing.id,
          rol: rolVal,
          naam: naamTrim,
          mfa_verplicht: false,
          must_change_password: false,
        }, { onConflict: 'user_id' })
        if (rolErr) fouten.push({ rij: i + 1, email: emailTrim, message: rolErr.message })
        else bestaand.push(emailTrim)
      } else {
        fouten.push({ rij: i + 1, email: emailTrim, message: createError.message })
      }
      continue
    }

    const newUserId = created!.user.id
    const emailResult = await sendWelcomeEmail({
      to: emailTrim,
      naam: naamTrim,
      wachtwoord,
      loginUrl,
      rol: rolVal,
    })
    if (!emailResult.ok) {
      // Gebruiker aangemaakt, e-mail mislukt – log maar blokkeer niet
    }

    const { error: rolErr } = await adminClient.from('gebruiker_rollen').upsert({
      user_id: newUserId,
      rol: rolVal,
      naam: naamTrim,
      mfa_verplicht: false,
      must_change_password: true,
    }, { onConflict: 'user_id' })

    if (rolErr) {
      fouten.push({ rij: i + 1, email: emailTrim, message: rolErr.message })
    } else {
      toegevoegd.push(emailTrim)
    }
  }

  return NextResponse.json({
    toegevoegd,
    bestaand,
    fouten,
    success: toegevoegd.length + bestaand.length,
  })
}
