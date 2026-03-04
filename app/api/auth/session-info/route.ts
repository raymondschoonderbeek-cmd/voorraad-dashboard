import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isIpTrusted, getClientIp } from '@/lib/trusted-ips'

/**
 * Retourneert sessie-info voor MFA/IP-logica.
 * Client roept dit aan om te bepalen of MFA-verificatie nodig is.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ requiresMfaChallenge: false, requiresMfaSetup: false, aal: null, ipTrusted: false, isAdmin: false })
    }

    const { data: rolData } = await supabase
      .from('gebruiker_rollen')
      .select('rol, mfa_verplicht')
      .eq('user_id', user.id)
      .single()
    const isAdmin = rolData?.rol === 'admin'
    const mfaVerplicht = rolData?.mfa_verplicht === true

    const clientIp = getClientIp(request)
    const { data: dbIps, error: dbErr } = await supabase.from('trusted_ips').select('ip_or_cidr')
    const dbEntries = !dbErr && dbIps ? dbIps.map(r => r.ip_or_cidr).filter(Boolean) : []
    const ipTrusted = isIpTrusted(clientIp, dbEntries)

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const currentLevel = aalData?.currentLevel ?? 'aal1'
    const nextLevel = aalData?.nextLevel ?? 'aal1'

    const hasMfaEnrolled = nextLevel === 'aal2'

    let requiresMfaChallenge = false
    let requiresMfaSetup = false

    if (mfaVerplicht && !ipTrusted) {
      if (!hasMfaEnrolled) {
        requiresMfaSetup = true
      } else if (currentLevel === 'aal1') {
        requiresMfaChallenge = true
      }
    } else if (!mfaVerplicht) {
      // Zonder mfa_verplicht: alleen challenge als gebruiker zelf MFA heeft én nog niet geverifieerd
      requiresMfaChallenge = currentLevel === 'aal1' && hasMfaEnrolled && !ipTrusted
    }

    return NextResponse.json({
      aal: currentLevel,
      nextLevel,
      ipTrusted,
      requiresMfaChallenge,
      requiresMfaSetup,
      hasMfaEnrolled,
      isAdmin,
    })
  } catch (err) {
    console.error('Session info error:', err)
    return NextResponse.json({ requiresMfaChallenge: false, requiresMfaSetup: false, aal: 'aal1', ipTrusted: false, isAdmin: false })
  }
}
