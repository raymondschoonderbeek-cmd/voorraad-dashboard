# CLAUDE.md — DRG Portal (voorraad-dashboard)

Deze file is voor Claude Code (of een andere agent) die in dit project werkt. Lees hem in zijn geheel voordat je code wijzigt.

---

## Project context

**Wat dit is:** intern portal voor Dynamo Retail Group (DRG). Medewerkers in winkels en op kantoor gebruiken het om voorraad te bekijken, IT-hardware te beheren, intern nieuws te lezen, lunch te bestellen, campagnefietsen te tracken, en beschikbaarheid van collega's in te zien.

**Stack:**
- Next.js 15 (App Router)
- React 19 + TypeScript
- Supabase (auth + Postgres + RLS)
- Tailwind CSS 4
- SWR voor data-fetching
- `@tanstack/react-virtual` voor grote tabellen
- Hosted op Vercel

**Taal:** UI is **Nederlands**. Variabelen, functies, commits, PR-titels zijn ook Nederlands waar dat past (`haalVoorraadOp`, `geselecteerdeWinkel`, `zichtbareKolommen`). Engelse termen blijven Engels als ze API- of third-party-concepten zijn (`fetcher`, `router`, `SWR`).

---

## Architectuur in één pagina

```
app/
├── layout.tsx              ← RootLayout + ThemeProvider + ToastProvider
├── page.tsx                ← redirect naar /dashboard
├── globals.css             ← CSS tokens + Tailwind
├── dashboard/              ← alle portal-pagina's (client components)
│   ├── page.tsx            ← HOME — grote file, 1500+ regels, bevat tegel-grid
│   ├── lunch/              ← lunchmodule
│   ├── it-cmdb/            ← IT-hardware CMDB
│   ├── brand-groep/        ← merk/groep analyse
│   ├── campagne-fietsen/   ← landelijke campagne-voorraad
│   ├── nieuws/beheer/      ← nieuws-CMS
│   ├── winkels/            ← winkel-overzicht + kaart
│   ├── beschikbaarheid/    ← team-OOF + werktijden
│   └── beheer/             ← admin-panel
├── api/                    ← server routes (REST-achtig)
├── login/ auth/ mfa-verify/ update-password/
└── tv/                     ← publieke TV-weergave voor in winkels

components/
├── BrancheNieuws.tsx       ← RSS-feed NieuwsFiets
├── DashboardIcons.tsx      ← SVG icon set — GEBRUIK DEZE, maak geen nieuwe
├── DashboardSidebar.tsx    ← sidebar nav
├── DashboardTopbar.tsx     ← topbar + user menu
├── WinkelModal.tsx         ← winkel-kiezer modal
├── WinkelSelect.tsx        ← inline winkel-dropdown
├── WinkelKaart.tsx         ← Leaflet map
├── Toast.tsx               ← ToastProvider + useToast()
├── ThemeProvider.tsx       ← light/dark via data-theme
├── MfaGuard.tsx            ← route-guard
├── beheer/                 ← admin-only componenten
├── nieuws/                 ← nieuws-CMS componenten
├── campagne-fietsen/       ← campagne-module
└── it-cmdb/                ← IT-CMDB componenten

lib/
├── theme.ts                ← DYNAMO_BLUE, DYNAMO_GOLD, dashboardUi, etc.
├── supabase/client.ts      ← browser client
├── supabase/server.ts      ← server client (in API routes)
└── types.ts                ← Winkel, Product, Gebruiker types
```

---

## Design tokens (bron van waarheid)

**Gebruik ALTIJD CSS custom properties**, niet gehardcodeerde hex-waardes. Wanneer je een nieuw token nodig hebt, voeg hem toe aan `app/globals.css` EN exporteer hem zo nodig in `lib/theme.ts`.

```css
:root {
  --drg-ink: #0E1726;
  --drg-ink-2: #2d457c;     /* DYNAMO_BLUE */
  --drg-accent: #c9a14a;    /* DYNAMO_GOLD — spaarzaam gebruiken */
  --drg-bg: #F7F7F4;
  --drg-card: #FFFFFF;
  --drg-line: rgba(14,23,38,0.08);
  --drg-text-2: rgba(14,23,38,0.65);
  --drg-text-3: rgba(14,23,38,0.45);
  --drg-success: #16a34a;
  --drg-warn: #d97706;
  --drg-danger: #dc2626;
}
```

De bestaande `DYNAMO_BLUE`/`DYNAMO_GOLD` exports in `lib/theme.ts` BLIJVEN — refactor ze niet weg. Gebruik in nieuwe code bij voorkeur de CSS-vars; in oude code is de inline hex prima tot je er tóch langs moet.

### Font
`Geist` (`next/font/google`) is al geconfigureerd in `app/layout.tsx`. In oude code staat `const F = "'Outfit', sans-serif"` — dit mag blijven, maar nieuwe componenten gebruiken `var(--font-geist-sans)` of gewoon de default body font (die al geset is).

### Radii & spacing
- Card: **10px** (rounded-[10px], niet rounded-2xl)
- Button: **8px**
- Input: **8px**
- Drawer/modal: **12px**
- Base spacing-eenheid: 4px (Tailwind default)

---

## Conventies die je MOET aanhouden

### 1. Client vs server componenten
- Dashboard-pagina's zijn `'use client'` (ze gebruiken allemaal SWR + localStorage).
- API-routes (`app/api/*/route.ts`) gebruiken `lib/supabase/server.ts`.
- Nooit een service-role key lekken naar client bundles.

### 2. Data-fetching
- **SWR** voor GET. Altijd via de shared `fetcher` helper:
  ```ts
  const fetcher = (url: string) => fetch(url).then(r => r.json())
  const { data, isLoading, mutate } = useSWR<T>('/api/xxx', fetcher)
  ```
- **POST/PATCH/DELETE** via `fetch()` direct, daarna `mutate()` van de betrokken SWR-key.
- Nooit `axios`, nooit `tanstack-query`. SWR is de standaard.

### 3. State-persistentie
- `localStorage`-keys zijn geprefixed met `dynamo_`:
  - `dynamo_zichtbare_kolommen`
  - `dynamo_geselecteerde_winkel_id`
- Server-side per-gebruiker state → `/api/profile` (modules_order, etc.)
- Draai ALTIJD localStorage-lezen in een `useEffect` (SSR-safe).

### 4. Styling
- Tailwind utility classes voor layout & spacing.
- Inline `style={{}}` voor kleuren die uit tokens komen (zoals nu in `dashboard/page.tsx`).
- Geen CSS modules, geen styled-components.
- Geen nieuwe npm-packages voor animaties — gebruik CSS `@keyframes` zoals nu.

### 5. Iconen
- `components/DashboardIcons.tsx` is de canonieke set. Voeg daar nieuwe iconen aan toe, maak geen nieuwe files.
- Inline stroke-width **2**, `strokeLinecap="round" strokeLinejoin="round"`.
- Size default 16 of 20, kleur via `currentColor`.

### 6. Taal
- UI-strings in het Nederlands.
- Foutmeldingen in het Nederlands.
- Commits/PR's: Nederlands mag, Engels ook goed — blijf consistent binnen één PR.

### 7. Accessibility
- Elke interactieve `<div>` krijgt `role="button" tabIndex={0}` + keyboard handler voor Enter/Space. Zie voorbeeld in `dashboard/page.tsx` bij de Voorraad-tegel.
- `aria-label` op icon-only buttons.
- Focus-visible states: `outline: 2px solid rgba(45,69,124,0.35); outline-offset: 3px`.
- Drag-handles expliciet `aria-describedby` koppelen naar een uitleg-regel.

### 8. TypeScript
- `strict: true` is aan. Geen `any` toevoegen — gebruik `unknown` + narrowing als het echt niet anders kan.
- Types voor domein-objecten in `lib/types.ts`.
- Voor API-responses gebruik we inline `useSWR<T>` generic — OK.

### 9. Supabase & RLS
- RLS is aan op **alle** user-facing tables. Schrijf nooit een nieuwe API-route die service-role gebruikt zonder expliciete reden + comment.
- Authorisatie-checks in route handlers gebruiken `createClient()` uit `lib/supabase/server.ts` en `supabase.auth.getUser()`.

### 10. Performance
- Voor grote lijsten (> 200 items) → `@tanstack/react-virtual` (zoals voorraadtabel).
- Voor plaatjes uit Supabase Storage → `next/image` met `unoptimized={false}` en correcte `sizes`.
- Dashboard-page.tsx is groot (1500+ regels). Splits alleen op als een gedeelte in 3+ pagina's hergebruikt wordt.

---

## Routes-overzicht

| Pad | Beschrijving | Auth |
|---|---|---|
| `/` | Redirect naar `/dashboard` | — |
| `/login` | Login (Supabase) | public |
| `/mfa-verify` | TOTP-verificatie | auth |
| `/update-password` | Wachtwoord-reset flow | auth |
| `/dashboard` | Home + module-grid + voorraad per winkel | auth |
| `/dashboard/lunch` | Broodjes bestellen | auth |
| `/dashboard/it-cmdb` | IT-hardware | auth |
| `/dashboard/brand-groep` | Merk/groep analyse | auth |
| `/dashboard/campagne-fietsen` | Landelijk voorraad-overzicht | auth |
| `/dashboard/nieuws/beheer` | Nieuws-CMS | auth |
| `/dashboard/winkels` | Winkel-overzicht + kaart | auth |
| `/dashboard/beschikbaarheid` | Team OOF + werktijden | auth |
| `/dashboard/beheer` | Admin-panel | admin |
| `/tv` | Publieke TV-weergave | public |
| `/aanvragen` | Extern aanvraagformulier | public |

---

## Werkwijze voor wijzigingen

### Voordat je code schrijft
1. Lees deze CLAUDE.md.
2. Lees `PORTAL_HANDOFF.md` als de taak met het herontwerp te maken heeft.
3. Kijk of er een bestaand component is dat je kunt hergebruiken (zie lijst hierboven).
4. Als je twijfelt over data-shape: check `lib/types.ts` of de betreffende `/api/*/route.ts`.

### Tijdens coderen
- **Hou PR's klein.** Eén module, één feature per PR.
- **Splits style van logica.** Een styling-refactor bevat geen logica-wijziging.
- **Voeg een Playwright-smoketest toe** als je een nieuwe route maakt.
- **Geen breaking changes op API zonder migratie.** Als een endpoint van shape verandert, schrijf een migratie-plan in de PR-description.

### Voor je commit
- `npm run lint` — geen warnings negeren zonder uitleg.
- `npm run build` — moet slagen.
- Lokaal testen met een echte Supabase-sessie (niet alleen mocks).
- Check dark-mode als je CSS hebt aangeraakt (`ThemeProvider` schakelt `data-theme`).

---

## Bekende valkuilen

1. **`@/` alias.** tsconfig-paths. Gebruik altijd `@/components/...`, nooit relatieve paden voorbij één niveau omhoog.
2. **Next 15 async `searchParams` / `params`.** In pages/layouts moet je `await params`/`await searchParams` gebruiken. Zie bestaande pages voor voorbeeld.
3. **SWR re-fetch bij focus.** Standaard aan. Voor mutaties die niet triggeren bij focus → expliciet `mutate()` na POST.
4. **localStorage leest `undefined` tijdens SSR.** Altijd in `useEffect` of met `typeof window !== 'undefined'` guard.
5. **Sidebar scroll.** De sidebar is een aparte flex-kolom met eigen overflow-y. Main-content scrollt ONAFHANKELIJK.
6. **`dashboard/page.tsx` is lang.** Editeer hem liever op plek dan het helemaal te gaan splitsen — dat is een aparte refactor-PR.

---

## Herontwerp-status (april 2026)

Zie `PORTAL_HANDOFF.md` voor de volledige context. Status per scherm:

| Scherm | Prototype klaar | In repo geïmplementeerd |
|---|:-:|:-:|
| Home | ✅ | ⏳ |
| Voorraad | ✅ | ⏳ |
| IT-hardware | ✅ | ⏳ |
| Nieuws | ✅ | ⏳ |
| Winkels | ✅ | ⏳ |
| Team/beschikbaarheid | ✅ | ⏳ |
| Campagnefietsen | ✅ | ⏳ |
| Merk/Groep | ✅ | ⏳ |
| Lunch | ✅ | ⏳ |
| Instellingen | ✅ | ⏳ |

Werk per rij; begin met **tokens** (globals.css + lib/theme.ts) en **shell** (Sidebar/Topbar) voordat je individuele pagina's herstyled.

---

## Vragen?

- Eigenaar: Raymond Schoonderbeek
- Design-bron: `DRG Portal - C prototype.html` (Claude Design Tool)
- Als je vastzit: commit niet, vraag het na. Breaking changes op productie zijn duur om terug te draaien.
