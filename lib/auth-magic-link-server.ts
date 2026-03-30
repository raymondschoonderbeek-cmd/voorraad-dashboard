import { createAdminClient } from '@/lib/supabase/admin'

/** Supabase: "For security purposes, you can only request this after 26 seconds." */
export function parseMagicLinkRateLimitWaitMs(message: string): number | null {
  const m = /after (\d+)\s*seconds/i.exec(message)
  if (m) return (parseInt(m[1], 10) + 1) * 1000
  return null
}

const MAGIC_LINK_MAX_ATTEMPTS = 6

/**
 * Magic link voor auth flows (lunch-mail, admin “inloggen als”); bij rate limit wachten en opnieuw proberen.
 */
export async function generateMagicLinkWithRetry(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  redirectTo: string
): Promise<string> {
  const addr = email.trim().toLowerCase()
  for (let attempt = 0; attempt < MAGIC_LINK_MAX_ATTEMPTS; attempt++) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: addr,
      options: { redirectTo },
    })
    if (!error) {
      const actionLink = (data as { properties?: { action_link?: string } })?.properties?.action_link
      if (actionLink) return actionLink
      throw new Error('Geen magic link ontvangen van Supabase')
    }
    const msg = error.message ?? ''
    const waitMs = parseMagicLinkRateLimitWaitMs(msg)
    if (waitMs != null && attempt < MAGIC_LINK_MAX_ATTEMPTS - 1) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, waitMs)
      })
      continue
    }
    throw new Error(msg)
  }
  throw new Error('Magic link genereren mislukt na meerdere pogingen')
}
