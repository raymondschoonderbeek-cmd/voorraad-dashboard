# DRG Portal — Hand-off document

**Van:** Design (prototype in Claude Design Tool)
**Voor:** Raymond + Claude Code
**Prototype:** `DRG Portal - C prototype.html` (variant C — workspace)
**Repo:** `raymondschoonderbeek-cmd/voorraad-dashboard` (Next.js 15, App Router)
**Laatst bijgewerkt:** april 2026

---

## 1. Wat is er ontworpen

Een herontwerp van de portal-homepage en omliggende modules, opgezet als een **workspace** in plaats van een losse verzameling tegels. Doel:

- Één consistent sjabloon over alle modules heen (sidebar + topbar + main).
- Minder klikken om bij de meest gebruikte acties te komen (voorraad zoeken, ticket openen, lunch bestellen).
- Meer rust in het visuele systeem: minder kleur-accenten, rustiger typografie, meer whitespace.
- Toegankelijker voor winkelmedewerkers op kleinere schermen en met minder technische handigheid.

### Schermen die gedekt zijn
1. Home — overzicht
2. Voorraad
3. IT-hardware (CMDB)
4. Nieuws & mededelingen
5. Winkels
6. Team & beschikbaarheid
7. Campagnefietsen
8. Merk / Groep analyse
9. Lunch bestellen
10. Instellingen

### Interacties die al in het prototype zitten
- Cmd/Ctrl+K command palette (zoeken + navigatie)
- Notificatie-drawer vanuit de topbar
- Detail-drawers: product, ticket, winkel, nieuwsbericht
- Tweaks-paneel: thema (licht/donker), dichtheid (compact/comfortabel)
- localStorage persistentie voor route en drawer-state

---

## 2. Bestandsstructuur van het prototype

```
DRG Portal - C prototype.html        — hoofd-prototype, openen in browser
DRG Portal - C prototype-print.html  — print-versie, alle 10 schermen stacked
app-bundle.jsx                       — App + routing + sidebar/topbar
variant-c.jsx                        — alle page-componenten (Home, Voorraad, …)
icons.jsx                            — inline SVG icon set
styles.css                           — design tokens (kleuren, type, spacing)
uploads/                             — bronmateriaal van Raymond (screenshots, logos)
```

> **Let op:** het prototype is opgezet als pure JSX + inline styles. Bij implementatie in de repo worden de visuele patronen overgenomen, maar niet 1-op-1 de component-structuur — die volgt de bestaande Next.js + Tailwind + SWR-conventies (zie CLAUDE.md).

---

## 3. Design tokens

Overgenomen uit `DYNAMO_BLUE` / `DYNAMO_GOLD` in de huidige codebase, aangevuld met neutrale tinten voor de workspace-look.

### Kleuren
| Token | Waarde | Gebruik |
|---|---|---|
| `--drg-ink` | `#0E1726` | Primaire tekst, headers |
| `--drg-ink-2` | `#2d457c` (DYNAMO_BLUE) | Links, active states, primaire knoppen |
| `--drg-accent` | `#c9a14a` (DYNAMO_GOLD) | Spaarzaam — highlights, badges |
| `--drg-bg` | `#F7F7F4` | Page background |
| `--drg-card` | `#FFFFFF` | Card surfaces |
| `--drg-line` | `rgba(14,23,38,0.08)` | Borders, dividers |
| `--drg-line-2` | `rgba(14,23,38,0.04)` | Zeer lichte scheiding (table rows) |
| `--drg-text-2` | `rgba(14,23,38,0.65)` | Secundaire tekst |
| `--drg-text-3` | `rgba(14,23,38,0.45)` | Tertiaire tekst, labels |
| `--drg-success` | `#16a34a` | Positieve trends, "aanwezig" |
| `--drg-warn` | `#d97706` | Waarschuwingen |
| `--drg-danger` | `#dc2626` | Fouten, negatieve trends |

**Dark mode** gebruikt dezelfde structuur met omgekeerde neutrals — zie `styles.css` voor exacte waarden onder `[data-theme="dark"]`.

### Typografie
- **Display/headings:** Geist (al geconfigureerd in `app/layout.tsx`)
- **UI body:** Geist
- **Fallback / prototype:** Outfit (zoals nu gebruikt in `F = "'Outfit', sans-serif"`)

| Stijl | Grootte | Weight | Letter-spacing | Lijnhoogte |
|---|---|---|---|---|
| H1 (pagina-kop) | clamp(22px, 2.5vw, 28px) | 700 | -0.03em | 1.2 |
| H2 (sectie) | 15px | 600 | -0.01em | 1.3 |
| Eyebrow/label | 11px | 600 | 0.06em uppercase | 1 |
| Body | 14px | 400 | 0 | 1.55 |
| Compact body | 13px | 400 | 0 | 1.5 |
| KPI-waarde | 28px | 700 | -0.02em | 1 |

### Spacing & radii
- Grid-eenheid: 4px. Gebruik 8/12/16/20/24 als belangrijkste stappen.
- Card-radius: **10px** (huidige `rounded-2xl` op dashboard wordt **10px**, niet 16px — kleinere radius = rustigere workspace-uitstraling).
- Button-radius: **8px**.
- Input-radius: **8px**.
- Drawer/modal-radius: **12px**.

### Shadows
- Card default: `0 1px 2px rgba(14,23,38,0.04), 0 0 0 1px rgba(14,23,38,0.04)`
- Card hover: `0 8px 24px rgba(14,23,38,0.08)`
- Drawer: `0 20px 60px rgba(14,23,38,0.18)`

---

## 4. Layout-conventies

### App-shell
```
┌──────────────────────────────────────────┐
│ Topbar (48px)                            │
├───────────┬──────────────────────────────┤
│           │                              │
│ Sidebar   │  Main (scrollable)           │
│ (240px)   │                              │
│           │                              │
└───────────┴──────────────────────────────┘
```

- **Topbar**: breadcrumb links, zoek-trigger + notificaties + avatar rechts. Sticky.
- **Sidebar**: primaire nav (Home, Voorraad, IT, Nieuws, Winkels, Team, Campagne, Merk/Groep, Lunch) + secundaire footer (Instellingen, Afmelden). Collapsible op <900px.
- **Main**: max-width **1280px**, horizontaal gecentreerd. Padding 24px desktop / 16px mobiel.

### Pagina-kop
Elke pagina heeft een consistent `<PageHeader>`:
```
[DATUM EYEBROW]
[H1 Paginatitel]
[optionele sub-actie rechts — primaire knop of filter]
```

### KPI-rij
Altijd 4 kolommen op desktop, 2 op tablet, 1 op mobiel. Elke KPI = label + waarde + sub + optionele trend-arrow. Zie `trendPijl()` in huidige `dashboard/page.tsx` — die implementatie blijft.

### Tables
- Geen zebra-strepen (workspace-esthetiek).
- Rij-hoogte: 44px comfortabel, 36px compact.
- Sticky header + eerste kolom (zoals nu al).
- Virtualisatie via `@tanstack/react-virtual` (zoals nu al).
- Hover-state: `background: var(--drg-line-2)`.

### Drawers (detail-panes)
- Slide-in van rechts, breedte **480px** desktop, **100%** mobiel.
- Scrim-overlay: `rgba(14,23,38,0.35)`.
- Close: X linksboven + Esc + klik op scrim.

---

## 5. Module-tegels (Home)

De huidige `dashboardModuleTile` kleurvariatie wordt losgelaten. **Alle tegels gebruiken dezelfde neutrale surface** (`var(--drg-card)`). Onderscheid komt uit:
- Icoon (blijft `DashboardIcons.tsx`)
- Titel + 1-regel-subtitel
- Footer-CTA met pijl rechts

Eerste tegel (Voorraad) blijft `col-span-2` op desktop om de primaire actie te benadrukken. Drag-reorder blijft zoals nu — drag-handle rechtsboven per tegel.

---

## 6. Wat er NIET verandert

Belangrijk — dit is expliciet buiten scope van het herontwerp:

- ✅ Routing-structuur (`/dashboard`, `/dashboard/lunch`, etc.) — blijft identiek
- ✅ API-endpoints onder `/api/*` — blijven identiek
- ✅ Supabase-schema, auth-flow, MFA
- ✅ `lib/theme.ts` exports (`DYNAMO_BLUE`, `DYNAMO_GOLD`, `DYNAMO_LOGO`) — **blijven bestaan**, krijgen alleen aanvullende tokens
- ✅ `DashboardIcons.tsx` — icon set wordt hergebruikt
- ✅ Modules-volgorde opslag via `/api/profile` — blijft
- ✅ Column-config in voorraadtabel — blijft

---

## 7. Implementatie-aanpak

**Aanbevolen volgorde** (per PR, niet alles tegelijk):

1. **Tokens** — nieuwe CSS custom properties in `app/globals.css` + uitbreiding van `lib/theme.ts`.
2. **Shell** — `DashboardSidebar.tsx` + `DashboardTopbar.tsx` krijgen de nieuwe layout. Bestaande routes blijven werken.
3. **Home** — `app/dashboard/page.tsx` hero-sectie + module-tegels herstylen met nieuwe tokens.
4. **Voorraad-tabel** — styling-only update (geen logica).
5. **Drawers** — nieuw `components/Drawer.tsx` voor product/ticket/winkel/news detail.
6. **Cmd+K** — nieuwe `components/CommandPalette.tsx`. Route-jumps + voorraad-zoeken.
7. **Per-module pagina's** — IT, Nieuws, Winkels, Team, Campagne, Merk/Groep, Lunch, Instellingen. Elk in aparte PR.

Elke PR: **alleen visuele + structurele wijzigingen**, geen data- of API-wijzigingen. Voeg Playwright-smoketest toe die controleert of de pagina laadt + belangrijkste acties werken.

---

## 8. Open vragen voor Raymond

- [ ] Wil je dark mode live meenemen, of eerst alleen light-mode?
- [ ] Moet het Cmd+K palette ook door voorraad-items zoeken, of alleen navigatie?
- [ ] Notificatie-drawer: realtime via Supabase, of polling?
- [ ] Mobiel: aparte route `/mobile`, of responsive binnen dezelfde shell? (huidige prototype is responsive)
- [ ] Moet de sidebar collapse-state per-gebruiker persistent zijn?

---

## 9. Referenties

- Prototype (Design Tool): `DRG Portal - C prototype.html`
- Print/PDF-versie: `DRG Portal - C prototype-print.html`
- Repo: https://github.com/raymondschoonderbeek-cmd/voorraad-dashboard
- CLAUDE.md (implementatie-gids voor Claude Code): zie aparte file
