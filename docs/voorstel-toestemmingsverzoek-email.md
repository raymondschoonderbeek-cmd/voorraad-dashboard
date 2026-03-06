# Voorstel: Toestemmingsverzoek per e-mail vanuit Beheer

## Doel
Op de Beheer-pagina, bij winkels die nog geen toestemming hebben gegeven voor de CycleSoftware API, een knop tonen waarmee de admin een e-mail kan versturen met het verzoek om toestemming te geven.

## Context
- **CycleSoftware** winkels: `cycle_api_authorized` = `true` (toestemming), `false` (geen toestemming), of `null` (nog niet gecontroleerd)
- Zonder toestemming kan voorraad niet worden opgehaald
- Admin moet de winkel kunnen vragen om in CycleSoftware toestemming te geven

---

## Architectuur

### 1. Contact e-mail per winkel

**Probleem**: Winkels hebben nu geen e-mailadres. We moeten weten waar de mail naartoe gaat.

**Oplossing**: Kolom `contact_email` toevoegen aan `winkels`.

```sql
alter table winkels add column if not exists contact_email text;
comment on column winkels.contact_email is 'E-mail voor toestemmingsverzoeken en communicatie';
```

- Admin vult dit in bij aanmaken/bewerken van een winkel
- De knop "Verstuur verzoek" is alleen actief als `contact_email` is ingevuld
- Als geen e-mail: knop disabled met tooltip "Voeg eerst een contact e-mail toe bij Bewerken"

### 2. API-route: `/api/toestemmingsverzoek/route.ts`

**POST** – verstuur e-mail voor een winkel

**Request body**:
```json
{ "winkel_id": 123 }
```

**Logica**:
1. Admin-check (`requireAdmin`)
2. Haal winkel op; controleer of `api_type === 'cyclesoftware'` (of null/wilmar zonder koppeling)
3. Controleer of `contact_email` is ingevuld
4. Verstuur e-mail via e-mailprovider
5. Optioneel: log in `toestemmingsverzoek_log` (zie hieronder) voor audit

**Response**: `{ success: true }` of `{ error: "..." }`

### 3. E-mailprovider

**Opties**:
- **Resend** – eenvoudig, gratis tier, goede docs
- **SendGrid** – veel gebruikt
- **Supabase Edge Function** – als je al Edge Functions gebruikt

**Aanbeveling**: Resend (`npm i resend`). Eenvoudige integratie:

```ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)
await resend.emails.send({
  from: 'Dynamo Retail <noreply@jouwdomein.nl>',
  to: winkel.contact_email,
  subject: `Toestemming voorraad – ${winkel.naam}`,
  html: `...`
})
```

**Benodigd**: `RESEND_API_KEY` in `.env.local`, en een geverifieerd domein bij Resend (of gebruik hun sandbox voor testen).

### 4. E-mailinhoud (concept)

**Onderwerp**: Toestemming voorraad – [Winkelnaam]

**Body** (voorbeeld):
```
Beste [contact],

Voor het Dynamo Retail voorraaddashboard hebben we toegang nodig tot jullie voorraad via CycleSoftware.

Winkel: [naam]
Dealer nummer: [dealer_nummer]

Kunt u in CycleSoftware toestemming geven om de voorraad uit te lezen? 
Na het geven van toestemming kunnen we de voorraad automatisch tonen in het dashboard.

Met vriendelijke groet,
[Dynamo Retail / Bike Totaal]
```

### 5. UI in Beheer

**Locatie**: Bij elke winkel in de winkellijst, naast "Bewerken" en "Verwijderen".

**Wanneer tonen**:
- Alleen voor CycleSoftware-winkels (`api_type === 'cyclesoftware'` of geen wilmar/vendit)
- Alleen als `cycle_api_authorized !== true` (dus false of null)

**Knop**:
- Label: "Verstuur verzoek" of "📧 Verstuur verzoek"
- Styling: vergelijkbaar met "Bewerken" (blauw/neutraal)
- Disabled als `!contact_email` met tooltip: "Voeg eerst een contact e-mail toe bij Bewerken"
- Bij klik: bevestiging "E-mail versturen naar [email]?" → POST naar API
- Loading-state tijdens versturen
- Success: korte melding "E-mail verstuurd"
- Error: toon foutmelding

---

## Implementatiestappen

1. **Migratie** – `contact_email` kolom toevoegen aan `winkels`
2. **Winkelformulier** – veld "Contact e-mail" toevoegen bij aanmaken/bewerken
3. **Resend** – `npm i resend`, `RESEND_API_KEY` in env
4. **API-route** – `/api/toestemmingsverzoek/route.ts` (POST)
5. **Beheer UI** – knop "Verstuur verzoek" per winkel (alleen bij geen toestemming)

---

## Optioneel: Auditlog

Tabel om te loggen wanneer een verzoek is verstuurd:

```sql
create table toestemmingsverzoek_log (
  id bigint generated always as identity primary key,
  winkel_id int references winkels(id),
  verstuurd_aan text,
  verstuurd_door uuid references auth.users(id),
  created_at timestamptz default now()
);
```

Zo kun je later zien wanneer het laatste verzoek is verstuurd en door wie.

---

## Overwegingen

| | |
|---|---|
| **Rate limiting** | Max 5 verzoeken per winkel per dag (voorkom spam) |
| **Privacy** | contact_email is gevoelig; alleen admins kunnen het zien/aanpassen |
| **Wilmar/Vendit** | Dit voorstel richt zich op CycleSoftware. Wilmar/Vendit hebben geen vergelijkbare "toestemming"-flow |
