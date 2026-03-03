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
      return NextResponse.json({ requiresMfaChallenge: false, aal: null, ipTrusted: false })
    }

    const clientIp = getClientIp(request)
    const { data: dbIps, error: dbErr } = await supabase.from('trusted_ips').select('ip_or_cidr')
    const dbEntries = !dbErr && dbIps ? dbIps.map(r => r.ip_or_cidr).filter(Boolean) : []
    const ipTrusted = isIpTrusted(clientIp, dbEntries)

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const currentLevel = aalData?.currentLevel ?? 'aal1'
    const nextLevel = aalData?.nextLevel ?? 'aal1'

    // MFA vereist als: gebruiker heeft MFA ingeschakeld (nextLevel aal2) maar nog niet geverifieerd (currentLevel aal1) EN IP is niet vertrouwd
    const hasMfaEnrolled = nextLevel === 'aal2'
    const needsVerification = currentLevel === 'aal1' && hasMfaEnrolled
    const requiresMfaChallenge = needsVerification && !ipTrusted

    return NextResponse.json({
      aal: currentLevel,
      nextLevel,
      ipTrusted,
      requiresMfaChallenge,
      hasMfaEnrolled,
    })
  } catch (err) {
    console.error('Session info error:', err)
    return NextResponse.json({ requiresMfaChallenge: false, aal: 'aal1', ipTrusted: false })
  }
}
