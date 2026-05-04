import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'
import { sendWelcomeEmail } from '@/lib/send-welcome-email'
import { getCachedVenditStats, setCachedVenditStats, getCachedVenditDealerNumbers, setCachedVenditDealerNumbers } from '@/lib/vendit-cache'
import type { DashboardModuleId, LandCode } from '@/lib/dashboard-modules'
import { landenToegangForDb, normalizeModulesFromBody, parseModulesToegang, resolveDashboardModules } from '@/lib/dashboard-modules'

// Controleer of gebruiker admin is
async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .single()
  return data?.rol === 'admin'
}

// Haal MFA-status op via Postgres-functie (leest auth.mfa_factors)
async function haalMfaStatusOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  if (userIds.length === 0) return result
  try {
    const { data } = await supabase.rpc('get_user_mfa_status', { user_ids: userIds })
    for (const row of data ?? []) {
      const uid = (row as { user_id: string }).user_id
      if (uid) result[uid] = true
    }
    // Vul false voor users zonder MFA (zodat we — MFA tonen)
    for (const uid of userIds) {
      if (!(uid in result)) result[uid] = false
    }
  } catch {
    // Migratie mogelijk nog niet uitgevoerd
  }
  return result
}

// Haal e-mailadressen op via Postgres-functie (leest auth.users)
async function haalUserEmailsOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (userIds.length === 0) return result
  try {
    const { data } = await supabase.rpc('get_user_emails', {
      user_ids: userIds,
    })
    for (const row of data ?? []) {
      const uid = (row as { user_id: string }).user_id
      const email = (row as { email: string }).email ?? ''
      if (uid && email) result[uid] = email
    }
  } catch {
    // Migratie mogelijk nog niet uitgevoerd
  }
  return result
}

// Haal laatste inlogdatum op via Postgres-functie (leest auth.users)
async function haalUserLastSignInsOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[]
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {}
  if (userIds.length === 0) return result
  try {
    const { data } = await supabase.rpc('get_user_last_sign_ins', {
      user_ids: userIds,
    })
    for (const row of data ?? []) {
      const uid = (row as { user_id: string }).user_id
      const dt = (row as { last_sign_in_at: string | null }).last_sign_in_at
      if (uid) result[uid] = dt ? new Date(dt).toISOString() : null
    }
  } catch {
    // Migratie mogelijk nog niet uitgevoerd
  }
  return result
}

// Haal alle gebruikers op
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  // Gebruik service role client om RLS te omzeilen: admins moeten alle gebruikers zien
  const client = hasAdminKey() ? createAdminClient() : supabase

  const { data: rollen } = await client
    .from('gebruiker_rollen')
    .select('*')
    .order('created_at')

  const { data: winkelsRaw } = await client
    .from('winkels')
    .select('*')
    .order('naam')

  const { searchParams } = new URL(request.url)
  const light = searchParams.get('light') === '1' || searchParams.get('light') === 'true'

  const venditDealerNummers = new Set<string>()
  const venditLaatstPerDealer = new Map<string, string>() // kassa_nummer -> ISO datum
  const venditWinkels = (winkelsRaw ?? []).filter((w: { api_type?: string }) => w.api_type === 'vendit')
  if (!light && venditWinkels.length > 0) {
    const cachedNumbers = getCachedVenditDealerNumbers()
    const cachedStats = getCachedVenditStats()
    if (cachedNumbers) {
      cachedNumbers.forEach(k => venditDealerNummers.add(k))
    }
    if (cachedStats) {
      Object.entries(cachedStats).forEach(([k, dt]) => { if (dt) venditLaatstPerDealer.set(k, dt) })
    }
    if (!cachedNumbers || !cachedStats) {
      try {
        const [dealersRes, statsRes] = await Promise.all([
          client.rpc('get_vendit_dealer_numbers_json'),
          client.rpc('get_vendit_dealer_stats_json'),
        ])
        if (dealersRes?.error) throw new Error(dealersRes.error.message)
        if (!cachedNumbers) {
          let dealersArr: unknown[] = []
          let rawDealers = dealersRes?.data as unknown
          if (typeof rawDealers === 'string') {
            try { rawDealers = JSON.parse(rawDealers) } catch { rawDealers = null }
          }
          if (Array.isArray(rawDealers)) {
            const first = rawDealers[0]
            if (first != null && typeof first === 'object' && !Array.isArray(first)) {
              const val = (first as Record<string, unknown>).get_vendit_dealer_numbers_json ?? Object.values(first)[0]
              dealersArr = Array.isArray(val) ? val : rawDealers
            } else if (Array.isArray(first)) {
              dealersArr = first
            } else {
              dealersArr = rawDealers
            }
          }
          const numbersSet = new Set<string>()
          for (const d of dealersArr) {
            if (d != null) {
              const k = String(d).trim()
              venditDealerNummers.add(k)
              numbersSet.add(k)
            }
          }
          setCachedVenditDealerNumbers(numbersSet)
        }
        if (!cachedStats) {
          let statsObj = statsRes?.data as unknown
          if (Array.isArray(statsObj) && statsObj.length > 0 && typeof statsObj[0] === 'object') {
            const first = statsObj[0] as Record<string, unknown>
            statsObj = first.get_vendit_dealer_stats_json ?? Object.values(first)[0] ?? statsObj
          }
          if (statsObj && typeof statsObj === 'object' && !Array.isArray(statsObj)) {
            const toCache: Record<string, string> = {}
            for (const [k, dt] of Object.entries(statsObj)) {
              if (dt) {
                const key = String(k).trim()
                const dtStr = typeof dt === 'string' ? dt : new Date(dt as Date).toISOString()
                venditLaatstPerDealer.set(key, dtStr)
                toCache[key] = dtStr
              }
            }
            setCachedVenditStats(toCache)
          }
        }
      } catch {
        try {
          const { data: dealers } = await client.rpc('get_vendit_dealer_numbers')
          for (const row of dealers ?? []) {
            const d = (row as { dealer_nummer: string })?.dealer_nummer
            if (d != null) venditDealerNummers.add(String(d).trim())
          }
        } catch {}
        try {
          const { data: stats } = await client.rpc('get_vendit_dealer_stats')
          for (const row of stats ?? []) {
            const d = (row as { dealer_nummer: string })?.dealer_nummer
            const dt = (row as { last_updated: string })?.last_updated
            if (d != null && dt) venditLaatstPerDealer.set(String(d).trim(), dt)
          }
        } catch {}
      }
    }
  }

  const winkels = (winkelsRaw ?? []).map((w: any) => {
    const { vendit_api_password: _p, ...rest } = w
    const base = rest as any
    if (base.api_type === 'vendit') {
      const key = String(w.kassa_nummer ?? '').trim()
      const inDataset = venditDealerNummers.has(key)
      const laatstDatum = venditLaatstPerDealer.get(key) ?? null
      return {
        ...base,
        vendit_in_dataset: inDataset,
        vendit_laatst_datum: laatstDatum,
      }
    }
    if (base.api_type === 'vendit_api') {
      const hasVenditApiCreds =
        (w.vendit_api_key ?? '').trim() !== '' &&
        (w.vendit_api_username ?? '').trim() !== '' &&
        (w.vendit_api_password ?? '').trim() !== ''
      return { ...base, has_vendit_api_credentials: hasVenditApiCreds }
    }
    return base
  })

  const userIds = (rollen ?? []).map((r: { user_id: string }) => r.user_id)
  const [mfaStatus, userEmails, userLastSignIns] = await Promise.all([
    haalMfaStatusOp(supabase, userIds),
    haalUserEmailsOp(supabase, userIds),
    haalUserLastSignInsOp(supabase, userIds),
  ])

  const profileCampagneFietsen: Record<string, boolean> = {}
  const profileModulesToegang: Record<string, DashboardModuleId[] | null> = {}
  const profileLandenRaw: Record<string, unknown> = {}
  const profileRowsForResolve: Record<string, { lunch_module_enabled?: boolean; campagne_fietsen_toegang?: boolean; modules_toegang?: unknown }> = {}
  if (userIds.length > 0) {
    try {
      const { data: profRows } = await client
        .from('profiles')
        .select('user_id, campagne_fietsen_toegang, modules_toegang, landen_toegang, lunch_module_enabled')
        .in('user_id', userIds)
      for (const row of profRows ?? []) {
        const uid = (row as { user_id: string }).user_id
        if (!uid) continue
        const r = row as {
          campagne_fietsen_toegang?: boolean
          modules_toegang?: unknown
          landen_toegang?: unknown
          lunch_module_enabled?: boolean
        }
        profileCampagneFietsen[uid] = r.campagne_fietsen_toegang === true
        profileModulesToegang[uid] = parseModulesToegang(r.modules_toegang)
        profileLandenRaw[uid] = r.landen_toegang ?? null
        profileRowsForResolve[uid] = {
          lunch_module_enabled: r.lunch_module_enabled,
          campagne_fietsen_toegang: r.campagne_fietsen_toegang,
          modules_toegang: r.modules_toegang,
        }
      }
    } catch {
      // kolom of tabel ontbreekt op oudere omgeving
    }
  }

  const profileModulesResolved: Record<string, DashboardModuleId[]> = {}
  for (const r of rollen ?? []) {
    const uid = (r as { user_id: string }).user_id
    const rolName = (r as { rol: string }).rol
    profileModulesResolved[uid] = resolveDashboardModules(
      rolName,
      profileRowsForResolve[uid] ?? null,
      rolName === 'admin'
    )
  }

  return NextResponse.json({
    rollen: rollen ?? [],
    winkels,
    mfaStatus,
    userEmails,
    userLastSignIns,
    profileCampagneFietsen,
    profileModulesToegang,
    profileLandenRaw,
    profileModulesResolved,
  })
}

// Nieuwe gebruiker uitnodigen
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const {
    email,
    rol,
    naam,
    mfa_verplicht,
    wachtwoord,
    campagne_fietsen_toegang,
    modules_toegang: modulesRaw,
    landen_toegang: landenRaw,
  } = await request.json()
  const emailTrim = String(email ?? '').trim().toLowerCase()
  const naamTrim = String(naam ?? email ?? '').trim() || emailTrim

  if (!hasAdminKey()) {
    return NextResponse.json({
      error: 'Aanmaken vereist SUPABASE_SERVICE_ROLE_KEY. Voeg deze toe aan .env.local en herstart de server.',
    }, { status: 400 })
  }
  const adminClient = createAdminClient()

  let newUserId: string
  let isNewUser = false
  let isExistingUser = false

  // Nieuwe gebruiker: wachtwoord verplicht, createUser + e-mail
  const hasPassword = typeof wachtwoord === 'string' && wachtwoord.trim().length >= 8
  if (hasPassword) {
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: emailTrim,
      password: wachtwoord.trim(),
      email_confirm: true,
    })
    if (createError) {
      const isAlreadyRegistered =
        createError.message?.toLowerCase().includes('already been registered') ||
        createError.message?.toLowerCase().includes('already registered')
      if (isAlreadyRegistered) {
        isExistingUser = true
        const { data: { users } } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = users?.find(u => u.email?.toLowerCase() === emailTrim)
        if (!existing) {
          return NextResponse.json({
            error: 'E-mailadres bestaat al in het systeem, maar kon niet worden gevonden.',
          }, { status: 400 })
        }
        newUserId = existing.id
        const { data: bestaand } = await adminClient.from('gebruiker_rollen').select('id').eq('user_id', newUserId).single()
        if (bestaand) {
          return NextResponse.json({
            error: 'Deze gebruiker staat al in de lijst. Bewerk de bestaande gebruiker.',
          }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: createError.message }, { status: 400 })
      }
    } else {
      newUserId = created!.user.id
      isNewUser = true
      const loginUrl = `${request.nextUrl.origin}/login`
      const emailResult = await sendWelcomeEmail({
        to: emailTrim,
        naam: naamTrim,
        wachtwoord: wachtwoord.trim(),
        loginUrl,
        rol,
      })
      if (!emailResult.ok) {
        // Gebruiker is aangemaakt, maar e-mail mislukt – log maar blokkeer niet
        console.warn('Welcome email failed:', emailResult.error)
      }
    }
  } else {
    // Geen wachtwoord: legacy invite-flow (magic link)
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(emailTrim)
    if (inviteError) {
      const isAlreadyRegistered =
        inviteError.message?.toLowerCase().includes('already been registered') ||
        inviteError.message?.toLowerCase().includes('already registered')
      if (isAlreadyRegistered) {
        isExistingUser = true
        const { data: { users } } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = users?.find(u => u.email?.toLowerCase() === emailTrim)
        if (!existing) {
          return NextResponse.json({
            error: 'E-mailadres bestaat al in het systeem, maar kon niet worden gevonden.',
          }, { status: 400 })
        }
        newUserId = existing.id
        const { data: bestaand } = await adminClient.from('gebruiker_rollen').select('id').eq('user_id', newUserId).single()
        if (bestaand) {
          return NextResponse.json({
            error: 'Deze gebruiker staat al in de lijst. Bewerk de bestaande gebruiker.',
          }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: inviteError.message }, { status: 400 })
      }
    } else {
      newUserId = invited!.user.id
    }
  }

  // Sla rol op (admin client omzeilt RLS)
  const rolData = {
    user_id: newUserId,
    rol: rol ?? 'viewer',
    naam: naamTrim,
    mfa_verplicht: mfa_verplicht === true,
    must_change_password: isNewUser,
  }
  const { error: rolError } = await adminClient
    .from('gebruiker_rollen')
    .upsert(rolData, { onConflict: 'user_id' })

  if (rolError) {
    // Fallback: probeer insert als upsert faalt (bijv. oude schema zonder unique)
    const { error: insertError } = await adminClient.from('gebruiker_rollen').insert([rolData])
    if (insertError) {
      return NextResponse.json({
        error: `Kon gebruiker niet toevoegen: ${insertError.message}`,
      }, { status: 500 })
    }
  }

  if (hasAdminKey()) {
    try {
      const r = rol ?? 'viewer'
      const modList =
        normalizeModulesFromBody(modulesRaw, r) ??
        resolveDashboardModules(
          r,
          typeof campagne_fietsen_toegang === 'boolean'
            ? { campagne_fietsen_toegang: campagne_fietsen_toegang === true, lunch_module_enabled: false }
            : null,
          r === 'admin'
        )
      let landenPayload: LandCode[] | null = null
      if (Array.isArray(landenRaw)) {
        const picked = landenRaw.filter((x: unknown): x is LandCode => x === 'Netherlands' || x === 'Belgium')
        landenPayload = landenToegangForDb(picked)
      }
      const defaultOrder = ['voorraad', 'lunch', 'brand-groep', 'campagne-fietsen', 'meer']
      await adminClient.from('profiles').upsert(
        {
          user_id: newUserId,
          modules_toegang: modList,
          landen_toegang: landenPayload,
          lunch_module_enabled: modList.includes('lunch'),
          campagne_fietsen_toegang: modList.includes('campagne-fietsen'),
          modules_order: defaultOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
    } catch {
      // profiles niet beschikbaar
    }
  }

  return NextResponse.json({
    success: true,
    existingUser: isExistingUser,
  })
}

// Gebruiker verwijderen (incl. auth-registratie – gebruiker is daarna niet meer bekend)
export async function DELETE(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id ontbreekt' }, { status: 400 })

  if (!hasAdminKey()) {
    return NextResponse.json({
      error: 'Volledig verwijderen vereist SUPABASE_SERVICE_ROLE_KEY. Voeg toe aan .env.local en herstart.',
    }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Eerst eigen tabellen (gebruiker_rollen, gebruiker_winkels)
  const { error: rolError } = await adminClient.from('gebruiker_rollen').delete().eq('user_id', userId)
  if (rolError) {
    return NextResponse.json({ error: `Verwijderen mislukt: ${rolError.message}` }, { status: 500 })
  }
  await adminClient.from('gebruiker_winkels').delete().eq('user_id', userId)

  // Auth-registratie verwijderen – gebruiker kan niet meer inloggen en is niet meer bekend
  const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
  if (authError) {
    return NextResponse.json({
      error: `Auth verwijderen mislukt: ${authError.message}. Rol en winkeltoegang zijn wel verwijderd.`,
    }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}