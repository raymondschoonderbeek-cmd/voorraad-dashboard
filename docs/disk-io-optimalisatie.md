# Disk IO Optimalisatie

Supabase waarschuwt wanneer je Disk IO Budget opraakt. Dit document beschrijft de genomen maatregelen en aanvullende tips.

## Genomen maatregelen

### 1. Indexen op vendit_stock (migratie 20250321000000)

De tabel `vendit_stock` werd bij elke query volledig gescand. Indexen op de dealer-kolom verminderen dit:

- `idx_vendit_stock_dealer_number` – als kolom `dealer_number` bestaat
- `idx_vendit_stock_dealer_nummer` – als kolom `dealer_nummer` bestaat  
- `idx_vendit_stock_dealer_id` – als kolom `dealer_id` bestaat

**Actie**: Voer `npx supabase db push` uit of pas de migratie handmatig toe in de Supabase SQL Editor.

### 2. Caching van vendit RPC-resultaten

De RPCs `get_vendit_dealer_stats_json` en `get_vendit_dealer_numbers_json` doen full table scans. Resultaten worden nu 60 seconden gecached in het geheugen:

- `/api/winkels` – gebruikt cache voor vendit_laatst_datum
- `/api/gebruikers` – gebruikt cache voor vendit_in_dataset en vendit_laatst_datum

Dit vermindert het aantal zware database-queries aanzienlijk bij herhaalde pagina-loads.

## Aanvullende aanbevelingen

### Supabase Dashboard

1. **Cache Hit Rate**: Ga naar Database → Performance. Zorg dat de cache hit rate > 99% is. Lage waarden betekenen veel disk reads.
2. **Query Performance**: Gebruik de Query Performance Advisor om trage queries te vinden.
3. **Compute upgrade**: Bij structureel hoge IO: overweeg een grotere compute add-on (4XL+ heeft consistentere disk performance).

### Database

- **Autovacuum**: Laat autovacuum draaien. Bij Disk IO-problemen kan het uitlopen; na verbetering herstelt het.
- **Unused indexes**: Voer `npx supabase inspect db unused-indexes` uit om ongebruikte indexen te vinden.
- **RLS policies**: Vermijd zware joins in RLS; die worden bij elke query uitgevoerd.

### Applicatie

- **Winkels Cache-Control**: De winkels-API gebruikt `Cache-Control: no-store` voor actuele Vendit-datums. Dat is bewust; caching zou verouderde data tonen.
- **Batch-operaties**: De voorraad-API haalt vendit_stock in batches van 1000 op; dat blijft nodig voor grote dealers.

## Monitoring

- [Supabase Observability](https://supabase.com/dashboard/project/_/observability/database) – Disk IO Budget en gebruik
- [Supabase Metrics](https://supabase.com/docs/guides/platform/metrics) – Prometheus/Grafana voor gedetailleerde IO-metrics
