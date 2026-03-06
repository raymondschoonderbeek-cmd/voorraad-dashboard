# Voorraad Dashboard – Dynamo Retail Group

Dashboard voor voorraadbeheer, gekoppeld aan **CycleSoftware** en **Wilmar**. Toont voorraad per winkel, merk/groep-analyse en beheer van gebruikers en winkels.

## Tech stack

- **Next.js 16** (App Router)
- **React 19**
- **Supabase** (auth, database)
- **Tailwind CSS**
- **SWR** (data fetching & caching)
- **@tanstack/react-virtual** (voor toekomstige tabel-virtualisatie bij 1000+ rijen)

## Vereiste environment variables

Maak een `.env.local` in de projectroot:

```env
# Supabase (verplicht)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Wilmar (voor Wilmar-winkels)
WILMAR_API_KEY=...
WILMAR_PASSWORD=...

# CycleSoftware (voor CycleSoftware-winkels)
CYCLESOFTWARE_USER=...
CYCLESOFTWARE_PASS=...
CYCLESOFTWARE_BASE_URL=https://...

# Supabase Service Role (optioneel, voor MFA-status in Beheer)
# Zet SUPABASE_SERVICE_ROLE_KEY om MFA aan/uit per gebruiker te tonen in Beheer > Gebruikers
SUPABASE_SERVICE_ROLE_KEY=

# MFA: vertrouwde IP's (optioneel)
# Vanaf deze IP's is geen TOTP-code nodig. Beheer via Beheer > Vertrouwde IP's (admin).
# Of via env (komma-gescheiden): 192.168.1.100,192.168.1.0/24
TRUSTED_IPS=
```

Bij opstarten worden ontbrekende variabelen gelogd in de console.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Je wordt doorgestuurd naar `/login` als je niet bent ingelogd.

## Database (Supabase)

Benodigde tabellen:

- **winkels** – winkels met `dealer_nummer`, `wilmar_organisation_id`, `wilmar_branch_id`, `api_type`, `straat`, etc.
- **gebruiker_rollen** – `user_id`, `rol` (viewer/admin), `naam`
- **gebruiker_winkels** – winkels waar gebruiker GEEN toegang toe heeft (leeg = alle winkels; standaard alle aangevinkt)
- **trusted_ips** – vertrouwde IP-adressen (geen MFA nodig); alleen admins kunnen beheren via Beheer. Voer `supabase/migrations/20250303000000_trusted_ips.sql` uit in Supabase.
- **bekende_merken** – merken voor Vendit merk-extractie uit productomschrijving; beheer via Beheer > Merken.

## Architectuur

```
app/
├── api/           # API routes
│   ├── voorraad/  # Voorraad (Wilmar + CycleSoftware)
│   ├── winkels/   # CRUD winkels (admin)
│   ├── gebruikers/
│   ├── adres/     # PDOK adreslookup
│   └── wilmar/    # Wilmar API proxy
├── dashboard/     # Hoofddashboard, beheer, merk/groep
├── login/
└── update-password/

lib/
├── auth.ts        # requireAuth, requireAdmin
├── rate-limit.ts  # In-memory rate limiting
├── theme.ts       # Design tokens
└── types.ts       # TypeScript types
```

## Beveiliging

- **Auth**: Supabase Auth, middleware beschermt alle routes behalve `/login` en `/update-password`
- **MFA (TOTP)**: Optioneel via Instellingen. Vanaf vertrouwde IP's (TRUSTED_IPS) is geen MFA nodig
- **Rollen**: Admin voor beheer (gebruikers, winkels); viewer voor alleen voorraad
- **Rate limiting**: 60 requests/minuut per IP op API-routes

## Deployment

Gebruik Vercel of een andere Next.js-host. Zet alle env vars in de hosting-configuratie.
