import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { generateMagicLinkWithRetry } from '@/lib/auth-magic-link-server'
import { resolveAppOriginForAuthRedirect } from '@/lib/site-url'

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Alleen admin: genereert een magic link om in te loggen als de gekozen gebruiker (zelfde als uitnodigingsflow).
 * Client volgt `action_link` — huidige sessie wordt daarmee vervangen.
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  if (!hasAdminKey()) {
    return NextResponse.json(
      { error: 'Inloggen als andere gebruiker vereist SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    )
  }

  let body: { user_id?: string; redirect_origin?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: 'Ongeldige user_id' }, { status: 400 })
  }

  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'Je bent al ingelogd als deze gebruiker.' }, { status: 400 })
  }

  let adminClient
  try {
    adminClient = createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Configuratiefout'
    return NextResponse.json({ error: msg }, { status: 503 })
  }

  const { data: targetUser, error: getErr } = await adminClient.auth.admin.getUserById(userId)
  if (getErr || !targetUser?.user?.email) {
    return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 })
  }

  const email = targetUser.user.email.trim().toLowerCase()
  const origin = resolveAppOriginForAuthRedirect(request, body.redirect_origin)
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/dashboard')}`

  try {
    const action_link = await generateMagicLinkWithRetry(adminClient, email, redirectTo)
    return NextResponse.json({ action_link })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Magic link mislukt' },
      { status: 500 }
    )
  }
}
