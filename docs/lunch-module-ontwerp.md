# Lunch module – ontwerp

## Per-gebruiker toggle (optie B)

**Keuze:** Elke gebruiker kan de lunch module zelf aan- of uitzetten via **Instellingen**.

### Implementatie

1. **Database**
   - Tabel `profiles` met kolom `lunch_module_enabled` (boolean, default `false`)
   - Tabellen: `lunch_products`, `lunch_orders`, `lunch_order_items`, `lunch_payments`

2. **Instellingen-pagina**
   - Toggle "Lunch bestellingen" (aan/uit)
   - Opslaan in `profiles.lunch_module_enabled`

3. **Navigatie**
   - Lunch-menu-item alleen tonen als `lunch_module_enabled === true`
   - Route `/dashboard/lunch` – productcatalogus, winkelwagen, checkout

4. **Functionaliteit**
   - Productcatalogus (Panini Italiani broodjes, seed data)
   - Winkelwagen, bestelling plaatsen
   - Mock Tikkie: checkout genereert fake URL; "Simuleer betaling" markeert als betaald
   - Webhook `/api/payments/tikkie/webhook` voor betalingsstatus (mock + productie)
   - Mijn bestellingen: `/dashboard/lunch/overzicht`
   - Admin beheer: `/dashboard/lunch/beheer` – dagoverzicht + product CRUD

5. **Fallback**
   - Als `profiles` niet bestaat of `lunch_module_enabled` null: standaard `false` (module uit)
