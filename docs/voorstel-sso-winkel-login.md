# Voorstel: SSO-login voor winkels

## Doel
Winkels (en hun medewerkers) kunnen inloggen via hun eigen bedrijfs-identiteit in plaats van een apart wachtwoord. Bijvoorbeeld: "Log in met Microsoft" of "Log in met Google" – of voor grotere ketens: "Log in met jullie bedrijfsaccount" (SAML/OIDC).

## Huidige situatie
- **Supabase Auth** met e-mail/wachtwoord
- **MFA** (TOTP) optioneel
- **gebruiker_rollen** koppelt user_id aan rol (viewer/admin)
- **gebruiker_winkels** bepaalt winkeltoegang (exclusie)
- Gebruikers worden uitgenodigd via e-mail; ze zetten zelf een wachtwoord

---

## SSO-opties

### Optie A: Social login (Google, Microsoft) – eenvoudig

**Idee**: Naast e-mail/wachtwoord ook knoppen "Inloggen met Google" en "Inloggen met Microsoft".

**Voordelen**:
- Supabase ondersteunt dit out-of-the-box
- Geen extra infrastructuur
- Veel winkels gebruiken al Google Workspace of Microsoft 365

**Nadelen**:
- Niet per winkel configureerbaar – iedereen kan met Google/Microsoft inloggen
- Geen strikte "alleen medewerkers van winkel X" – je moet nog steeds gebruiker_rollen/gebruiker_winkels beheren

**Implementatie**:
1. In Supabase Dashboard: Authentication → Providers → Google/Microsoft inschakelen
2. OAuth credentials aanmaken (Google Cloud Console / Azure AD)
3. Op login-pagina: `supabase.auth.signInWithOAuth({ provider: 'google' })` (of `azure`)

---

### Optie B: Per-winkel SSO (SAML/OIDC) – enterprise

**Idee**: Winkel "Bike Totaal Amsterdam" heeft een Azure AD-tenant. Alleen medewerkers van dat bedrijf kunnen inloggen. Winkel "Fietsen BV" gebruikt Google Workspace – die krijgt een Google-knop. Of: elke winkel heeft een eigen SAML IdP (Okta, Azure AD, etc.).

**Voordelen**:
- Sterke scheiding per winkel
- Geen wachtwoorden in jouw systeem
- Centraal beheer bij de winkel (medewerker vertrekt = toegang weg)

**Nadelen**:
- Complexer om op te zetten
- Supabase ondersteunt custom OAuth; voor echte SAML vaak externe service (bijv. Auth0, WorkOS, Clerk)

**Implementatie**:
- **Supabase Custom OAuth**: Je kunt een eigen OAuth-provider configureren. Voor Azure AD of Google per "tenant" is dat mogelijk, maar beperkt.
- **Externe IdP + JWT**: Gebruik Auth0, WorkOS of Azure B2C als centrale IdP; die levert JWT. Supabase kan externe JWT's valideren (custom access token).
- **Supabase + SAML**: Supabase heeft geen native SAML. Je zou een proxy (Edge Function of aparte service) kunnen bouwen die SAML afhandelt en daarna een Supabase-sessie aanmaakt.

---

### Optie C: Magic link / passwordless – eenvoudig alternatief

**Idee**: Geen wachtwoord; gebruiker krijgt een link per e-mail om in te loggen.

**Voordelen**:
- Geen wachtwoord onthouden
- Supabase ondersteunt dit (`signInWithOtp`)

**Nadelen**:
- Geen echte SSO – gebruiker moet nog steeds e-mail openen
- Minder geschikt voor "log in met bedrijfsaccount"

---

## Aanbevolen aanpak: gefaseerd

### Fase 1: Google + Microsoft (social login)

**Doel**: Snel bruikbaar voor winkels die Google of Microsoft gebruiken.

**Stappen**:
1. Supabase: Google- en Microsoft-providers inschakelen
2. Login-pagina: knoppen "Inloggen met Google" en "Inloggen met Microsoft" toevoegen
3. **User provisioning**: Na eerste SSO-login moet de user nog gekoppeld worden aan `gebruiker_rollen`. Opties:
   - **Handmatig**: Admin voegt user toe na eerste login (user bestaat in auth.users maar niet in gebruiker_rollen → geen toegang tot dashboard)
   - **Auto-provisioning**: Als e-mail domein matcht met een bekende winkel (bijv. `@biketotaal.nl`), automatisch viewer-rol geven. Vereist configuratie van domein → winkel.

**Technisch**:
```ts
// Login page
await supabase.auth.signInWithOAuth({
  provider: 'google', // of 'azure'
  options: { redirectTo: `${origin}/auth/callback` }
})
```

Callback-route: Supabase handelt redirect af; user is ingelogd. Controleer of user in `gebruiker_rollen` staat; zo niet, toon "Geen toegang – neem contact op met beheerder".

### Fase 2: Per-winkel IdP (optioneel)

**Doel**: Grote ketens of enterprise-winkels met eigen IdP.

**Aanpak**:
- Tabel `winkel_sso_config`: `winkel_id`, `idp_type` (saml/oidc), `entity_id`, `metadata_url`, etc.
- Gebruik een service als **WorkOS** of **Auth0** voor multi-tenant SSO
- Of: Supabase Custom OAuth met Azure AD multi-tenant – elke winkel heeft eigen tenant-id

Dit vraagt meer architectuur en mogelijk een betaalde SSO-service.

---

## Implementatiestappen Fase 1 (Google + Microsoft)

### 1. Supabase-configuratie
- Dashboard → Authentication → Providers
- Google: Client ID + Client Secret (Google Cloud Console)
- Azure: Application (client) ID, Directory (tenant) ID, Client Secret (Azure Portal)

### 2. Login-pagina aanpassen
- Knoppen "Inloggen met Google" en "Inloggen met Microsoft"
- Naast bestaand e-mail/wachtwoord-formulier
- Redirect naar `/auth/callback` (Supabase standaard)

### 3. Auth callback
- Route `/auth/callback` (of in middleware) – Supabase wisselt code om voor sessie
- Check: staat user in `gebruiker_rollen`? Zo niet: toon melding "Geen toegang" + uitloggen of doorverwijzen

### 4. User provisioning
- **Optie A**: Geen auto – admin nodigt nog steeds uit; bij uitnodiging kan user kiezen "Account aanmaken met Google" i.p.v. wachtwoord
- **Optie B**: Whitelist van e-maildomeinen → bij eerste login met dat domein automatisch viewer + koppeling aan winkel(s)

---

## Overwegingen

| | |
|---|---|
| **MFA** | Bij OAuth kan de IdP zelf MFA doen (bijv. Microsoft). Supabase MFA is dan dubbel. Overweeg: voor SSO-users MFA overslaan als IdP het al doet. |
| **Trusted IPs** | Blijft werken – SSO-users kunnen ook vanaf vertrouwde IP's zonder MFA. |
| **Uitnodiging** | Bij uitnodiging: "Kies wachtwoord" of "Log in met Google" – beide moeten mogelijk zijn. |
| **Bestaat user al?** | Als iemand met Google inlogt en het e-mailadres bestaat al als password-user, Supabase koppelt ze (zelfde user). |

---

## Samenvatting

| Fase | Inhoud | Complexiteit |
|------|--------|--------------|
| **1** | Google + Microsoft knoppen op login | Laag |
| **2** | User provisioning (domein-whitelist of handmatig) | Medium |
| **3** | Per-winkel SAML/OIDC (via WorkOS e.d.) | Hoog |

**Praktisch advies**: Start met Fase 1. Voeg Google en Microsoft toe als login-opties. Houd user provisioning handmatig (uitnodiging blijft); de uitgenodigde kan dan kiezen: wachtwoord of SSO. Later kan Fase 2 worden toegevoegd voor enterprise-winkels.
