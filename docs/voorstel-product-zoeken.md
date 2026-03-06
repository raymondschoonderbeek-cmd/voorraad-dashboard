# Voorstel: Product zoeken – welke winkels hebben voorraad?

## Doel
Een module waarmee gebruikers een product kunnen zoeken (barcode, artikelnummer of omschrijving) en direct zien in welke winkels het nog op voorraad is.

## Probleem
Bij ~200 winkels zijn per-winkel API-calls niet haalbaar: 200 requests per zoekactie is te traag en te belastend. Daarom: **gecachte index** met periodieke sync.

---

## Architectuur

### 1. Centrale tabel: `product_voorraad_index`

```sql
create table product_voorraad_index (
  id bigint generated always as identity primary key,
  winkel_id int not null references winkels(id),
  dealer_nummer text,
  bron text not null,  -- 'vendit' | 'wilmar' | 'cyclesoftware'
  barcode text,
  article_number text,
  product_description text,
  stock int default 0,
  synced_at timestamptz default now()
);

create index idx_pvi_winkel on product_voorraad_index(winkel_id);
create index idx_pvi_barcode on product_voorraad_index(barcode);
create index idx_pvi_article on product_voorraad_index(article_number);
create index idx_pvi_desc on product_voorraad_index using gin(to_tsvector('dutch', product_description));
```

### 2. Sync-logica

| Bron | Aanpak |
|------|--------|
| **Vendit** | 1 query: `INSERT INTO product_voorraad_index ... SELECT ... FROM vendit_stock` (join met winkels op dealer_number). |
| **Wilmar** | Job loopt alle winkels met `api_type=wilmar` af, roept bestaande Wilmar API aan, schrijft resultaten naar index. |
| **CycleSoftware** | Idem: job per winkel, bestaande API, resultaten naar index. |

**Sync-frequentie** (bijv.):
- Vendit: elk uur (data staat al in Supabase)
- Wilmar / CycleSoftware: 1x per nacht of 6 uur

**Opschoning**: per sync eerst `DELETE FROM product_voorraad_index WHERE bron = 'vendit'` (of per bron), daarna opnieuw vullen. Zo voorkom je oude records.

### 3. Productzoeken API

**Endpoint**: `GET /api/product-zoeken?q=...`

- Query: barcode, artikelnummer of omschrijving (bijv. `ILIKE '%zoekterm%'` of full-text search)
- Filter: alleen winkels waar gebruiker toegang toe heeft (`gebruiker_winkels`)
- Resultaat: lijst winkels met voorraad per product

### 4. UI

**Pagina**: `/dashboard/product-zoeken`

- Zoekveld
- Resultaten: lijst winkels met voorraad per product
- Kolom: winkelnaam, bron, voorraad, laatst gesynchroniseerd

---

## Implementatiestappen (voor later)

1. **Migratie** – tabel `product_voorraad_index` + indexen
2. **Sync Vendit** – script/API die `vendit_stock` naar index kopieert
3. **Sync Wilmar** – job die alle Wilmar-winkels afloopt en index vult
4. **Sync CycleSoftware** – idem voor CycleSoftware
5. **Cron / scheduler** – Vercel Cron, Supabase Edge Function of externe cron
6. **API-route** – `/api/product-zoeken/route.ts`
7. **UI-pagina** – `/dashboard/product-zoeken` met zoekveld en resultatentabel

---

## Overwegingen

| | |
|---|---|
| **Data-freshness** | Niet realtime; afhankelijk van sync-frequentie (bijv. 1–6 uur) |
| **Opslag** | ~200 winkels × ~1000 producten ≈ 200k rijen; indexen houden queries snel |
| **Fouten** | Als sync voor een winkel faalt: oude data blijft staan tot volgende sync |
| **Vendit** | Kan als eerste worden opgezet; data staat al in Supabase |

---

## Volgorde

1. **Fase 1**: alleen Vendit – sync + zoeken (minder werk, direct bruikbaar)
2. **Fase 2**: Wilmar sync toevoegen
3. **Fase 3**: CycleSoftware sync toevoegen
