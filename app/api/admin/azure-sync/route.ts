import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'

interface GraphUser {
  id: string
  displayName: string | null
  mail: string | null
  userPrincipalName: string
  givenName: string | null
  surname: string | null
  jobTitle: string | null
  department: string | null
  accountEnabled: boolean
}

async function getAzureToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Azure omgevingsvariabelen ontbreken. Voeg AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET toe aan .env.local.'
    )
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error_description?: string }
    throw new Error(`Azure token ophalen mislukt: ${err.error_description ?? res.statusText}`)
  }

  const data = await res.json() as { access_token: string }
  return data.access_token
}

async function fetchAllAzureUsers(token: string): Promise<GraphUser[]> {
  const users: GraphUser[] = []
  let url: string | null =
    'https://graph.microsoft.com/v1.0/users' +
    '?$select=id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,accountEnabled' +
    '&$filter=accountEnabled eq true' +
    '&$top=999'

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(`Graph API fout: ${err.error?.message ?? res.statusText}`)
    }

    const data = await res.json() as { value?: GraphUser[]; '@odata.nextLink'?: string }
    users.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }

  return users
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rolData } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', user.id)
    .single()
  if (rolData?.rol !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  if (!hasAdminKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Azure token + gebruikerslijst ophalen
  let token: string
  try {
    token = await getAzureToken()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  let azureUsers: GraphUser[]
  try {
    azureUsers = await fetchAllAzureUsers(token)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Haal alle bestaande Supabase-gebruikers op
  const supabaseUsers: { id: string; email: string }[] = []
  let page = 1
  while (true) {
    const { data: { users: batch } } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (!batch || batch.length === 0) break
    supabaseUsers.push(...batch.map(u => ({ id: u.id, email: (u.email ?? '').toLowerCase() })))
    if (batch.length < 1000) break
    page++
  }

  const emailToUserId = new Map(supabaseUsers.map(u => [u.email, u.id]))

  // Haal bestaande gebruiker_rollen op
  const { data: bestaandeRollen } = await adminClient.from('gebruiker_rollen').select('user_id')
  const heeftRol = new Set<string>((bestaandeRollen ?? []).map((r: { user_id: string }) => r.user_id))

  let aangemaakt = 0
  let profielGezet = 0
  let overgeslagen = 0
  const fouten: string[] = []

  for (const azUser of azureUsers) {
    // Externe gastaccounts (#EXT#) en accounts zonder e-mail overslaan
    const email = (azUser.mail ?? azUser.userPrincipalName ?? '').toLowerCase().trim()
    if (!email || email.includes('#ext#')) {
      overgeslagen++
      continue
    }

    let userId = emailToUserId.get(email)

    if (!userId) {
      // Nieuwe gebruiker aanmaken — geen wachtwoord, moet via Azure SSO inloggen
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          azure_object_id: azUser.id,
          full_name: azUser.displayName,
          provider: 'azure',
        },
      })

      if (createErr) {
        // Bestaat al (race condition of listUsers miste hem)
        if (createErr.message?.toLowerCase().includes('already')) {
          overgeslagen++
          continue
        }
        fouten.push(`${email}: ${createErr.message}`)
        continue
      }

      userId = created.user.id
      aangemaakt++
    }

    if (!heeftRol.has(userId)) {
      const naam = azUser.displayName ?? email

      const { error: rolErr } = await adminClient.from('gebruiker_rollen').insert({
        user_id: userId,
        rol: 'viewer',
        naam,
      })

      if (rolErr) {
        fouten.push(`Profiel ${email}: ${rolErr.message}`)
      } else {
        profielGezet++
        // Standaard module-toegang
        try {
          await adminClient.from('profiles').upsert(
            {
              user_id: userId,
              modules_toegang: ['voorraad', 'brand-groep', 'branche-nieuws', 'meer'],
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
        } catch {
          // profiles tabel optioneel
        }
      }
    } else {
      overgeslagen++
    }
  }

  return NextResponse.json({
    success: true,
    totaal_azure: azureUsers.length,
    aangemaakt,
    profiel_gezet: profielGezet,
    overgeslagen,
    fouten,
  })
}
