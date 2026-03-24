# Beveiligingsaudit DRG Portal

*Datum: maart 2025*

## Samenvatting

| Categorie | Status | Opmerkingen |
|-----------|--------|--------------|
| Authenticatie | ✅ Goed | Middleware, Supabase Auth, MFA |
| Autorisatie (admin) | ✅ Goed | requireAdmin op gevoelige endpoints |
| Winkeltoegang (viewer) | ⚠️ Aandacht | API enforceert geen winkel-uitsluitingen |
| Rate limiting | ⚠️ Gedeeltelijk | Niet op alle endpoints |
| Gevoelige data | ✅ Goed | Env vars, geen secrets in client |
| XSS | ✅ Goed | Geen dangerouslySetInnerHTML |
| SQL injection | ✅ Goed | Supabase client, parameterized |
| Debug/productie | ⚠️ Aandacht | Debug endpoint, Wilmar swagger |

---

## 1. Authenticatie & autorisatie

### ✅ Sterke punten
- **Middleware** (`middleware.ts`): Alle routes behalve `/login`, `/update-password`, `/auth/callback` vereisen inloggen.
- **requireAuth / requireAdmin** (`lib/auth.ts`): Duidelijke scheiding; admin-endpoints gebruiken `requireAdmin()`.
- **MFA**: Ondersteuning voor MFA, trusted IPs om MFA te omzeilen op vertrouwde locaties.
- **Rol-check**: `gebruiker_rollen.rol === 'admin'` wordt consequent gecontroleerd.

### Admin-beveiligde endpoints
- `POST/PUT/DELETE /api/winkels` ✅
- `POST/PUT/DELETE /api/gebruikers` ✅
- `POST/DELETE /api/trusted-ips` ✅
- `POST/DELETE /api/bekende-merken` ✅
- `POST /api/winkels/geocode` ✅
- `POST /api/winkels/wilmar-auto-link` ✅

---

## 2. Winkeltoegang (viewer)

### ⚠️ Beperking
`gebruiker_winkels` bevat winkels waar een viewer **geen** toegang toe heeft. De filtering gebeurt nu alleen in de UI (Beheer), niet in de API.

**Risico**: Een viewer die een winkel-ID kent waartoe hij geen toegang heeft, kan toch voorraad ophalen via:
```
GET /api/voorraad?winkel=123
GET /api/winkels  (retourneert alle winkels)
```

**Aanbeveling**: Winkeltoegang in de API afdwingen:
- `/api/winkels`: voor viewers alleen winkels retourneren waar ze toegang toe hebben.
- `/api/voorraad`: controleren of de gebruiker toegang heeft tot de gevraagde winkel voordat voorraad wordt opgehaald.

---

## 3. Rate limiting

### Endpoints mét rate limiting ✅
- `/api/voorraad`
- `/api/winkels` (GET, POST, PUT, DELETE)
- `/api/winkels/geocode`
- `/api/winkels/wilmar-auto-link`
- `/api/gebruikers`
- `/api/trusted-ips`
- `/api/bekende-merken`
- `/api/adres`

### Endpoints zonder rate limiting ⚠️
- `/api/auth/session-info` – vaak aangeroepen, gevoelig voor abuse
- `/api/favorieten` – GET/POST
- `/api/voorraad/status` – CycleSoftware status check
- `/api/voorraad/status/batch`
- `/api/wilmar/swagger` – **geen auth**, gebruikt Wilmar-credentials

**Aanbeveling**: Rate limiting toevoegen aan alle publieke API-routes.

---

## 4. Gevoelige data & credentials

### ✅ Sterke punten
- Geen `NEXT_PUBLIC_` voor secrets (alleen URL en anon key, die bedoeld zijn voor client).
- `SUPABASE_SERVICE_ROLE_KEY`, `WILMAR_*`, `CYCLESOFTWARE_*` alleen server-side.
- Debug endpoint (`/api/debug-env`) blokkeert in productie (404).

### ⚠️ Aandacht
- **Wilmar Swagger** (`/api/wilmar/swagger`): Geen authenticatie. Iedere ingelogde gebruiker kan dit aanroepen; het endpoint gebruikt Wilmar-credentials. Overweeg dit te beperken tot admins of te verwijderen in productie.

---

## 5. IP-spoofing (X-Forwarded-For)

`getClientIp()` gebruikt `x-forwarded-for` of `x-real-ip`. Als er geen reverse proxy is die deze headers overschrijft, kan een client `X-Forwarded-For` vervalsen.

**Aanbeveling**: Zorg dat Vercel/nginx/load balancer de echte client-IP zet. Bij Vercel: `x-forwarded-for` wordt correct gezet. Bij eigen hosting: proxy configureren om `X-Forwarded-For` te overschrijven.

---

## 6. Database & RLS

### vendit_stock
- RLS ingeschakeld ✅
- Alleen `authenticated` users mogen `SELECT` ✅

### Overige tabellen
- `winkels`, `gebruiker_rollen`, `gebruiker_winkels`, etc.: afhankelijk van Supabase RLS-configuratie. Controleer of RLS overal correct staat voor alle tabellen.

---

## 8. Uitgevoerde verbeteringen (maart 2025)

- ✅ **Wilmar swagger**: Admin-only + rate limiting
- ✅ **Rate limiting**: Toegevoegd aan session-info, favorieten, voorraad/status, voorraad/status/batch
- ✅ **Security headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy in middleware
- ✅ **session-info**: Toegevoegd aan public paths (nodig voor unauthenticated session-check)

---

## 9. Overige aanbevelingen

1. **Security headers**: Overweeg `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options` in `next.config.ts` of via middleware.
2. **Inputvalidatie**: Bij POST/PUT body’s: lengte-limieten, type-checks (bijv. `id` als integer).
3. **DELETE gebruiker**: Geen validatie of `user_id` bestaat; mislukte delete geeft toch 200. Geen kritiek, maar inconsistent.
4. **Dependencies**: Regelmatig `npm audit` draaien voor bekende kwetsbaarheden.

---

## Actiepunten (prioriteit)

| Prioriteit | Actie | Status |
|-----------|-------|--------|
| Hoog | Winkeltoegang afdwingen in `/api/voorraad` en `/api/winkels` voor viewers | Open |
| Hoog | Wilmar swagger endpoint beveiligen (admin-only) | ✅ Gedaan |
| Medium | Rate limiting toevoegen aan session-info, favorieten, voorraad/status | ✅ Gedaan |
| Medium | Security headers configureren | ✅ Gedaan |
| Laag | Inputvalidatie versterken (lengte, types) | Open |
