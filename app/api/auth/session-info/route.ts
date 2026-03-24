import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isIpTrusted, getClientIp } from '@/lib/trusted-ips'
import { withRateLimit } from '@/lib/api-middleware'
import { parseLandenToegang, resolveDashboardModules, type LandCode } from '@/lib/dashboard-modules'

/**
 * Retourneert sessie-info voor MFA/IP-logica.
 * Client roept dit aan om te bepalen of MFA-verificatie nodig is.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        requiresMfaChallenge: false,
        requiresMfaSetup: false,
        aal: null,
        ipTrusted: false,
        isAdmin: false,
        lunchOnly: false,
        lunchModuleEnabled: false,
        campagneFietsenEnabled: false,
        dashboardModules: [],
        allowedCountries: null,
        mustChangePassword: false,
      })
    }

    const { data: rolData } = await supabase
      .from('gebruiker_rollen')
      .select('rol, mfa_verplicht, must_change_password')
      .eq('user_id', user.id)
      .single()
    const isAdmin = rolData?.rol === 'admin'
    const lunchOnly = rolData?.rol === 'lunch'
    const mustChangePassword = rolData?.must_change_password === true
    const mfaVerplicht = rolData?.mfa_verplicht === true

    let lunchModuleEnabled = lunchOnly
    let campagneFietsenEnabled = isAdmin
    let dashboardModules: string[] = []
    let allowedCountries: LandCode[] | null = null
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('lunch_module_enabled, campagne_fietsen_toegang, modules_toegang, landen_toegang')
        .eq('user_id', user.id)
        .maybeSingle()
      dashboardModules = resolveDashboardModules(rolData?.rol, profileData, isAdmin)
      allowedCountries = parseLandenToegang(profileData?.landen_toegang)
      if (!lunchOnly) lunchModuleEnabled = dashboardModules.includes('lunch')
      if (!isAdmin) campagneFietsenEnabled = dashboardModules.includes('campagne-fietsen')
    } catch {
      // profiles tabel bestaat mogelijk nog niet
      dashboardModules = resolveDashboardModules(rolData?.rol, null, isAdmin)
      if (!lunchOnly) lunchModuleEnabled = dashboardModules.includes('lunch')
      if (!isAdmin) campagneFietsenEnabled = dashboardModules.includes('campagne-fietsen')
    }

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
      lunchOnly,
      lunchModuleEnabled,
      campagneFietsenEnabled,
      dashboardModules,
      allowedCountries,
      mustChangePassword,
    })
  } catch (err) {
    console.error('Session info error:', err)
    return NextResponse.json({
      requiresMfaChallenge: false,
      requiresMfaSetup: false,
      aal: 'aal1',
      ipTrusted: false,
      isAdmin: false,
      lunchOnly: false,
      lunchModuleEnabled: false,
      campagneFietsenEnabled: false,
      dashboardModules: [],
      allowedCountries: null,
      mustChangePassword: false,
    })
  }
}
