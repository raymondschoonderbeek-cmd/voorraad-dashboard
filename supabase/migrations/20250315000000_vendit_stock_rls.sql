-- Beveilig vendit_stock: alleen ingelogde gebruikers mogen data lezen
-- Zonder RLS kan iedereen met de anon key de tabel uitlezen via de publieke API

alter table vendit_stock enable row level security;

-- Alleen authenticated users mogen vendit_stock lezen (voor dashboard)
create policy "Ingelogde gebruikers mogen vendit_stock lezen"
  on vendit_stock for select
  to authenticated
  using (true);

-- Geen INSERT/UPDATE/DELETE voor authenticated - data komt via sync/service role
-- Service role key bypassed RLS, dus sync jobs blijven werken
