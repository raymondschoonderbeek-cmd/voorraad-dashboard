-- Gazelle pakket orders: binnenkomende bestellingen via Freshdesk webhook

create table if not exists gazelle_pakket_orders (
  id uuid default gen_random_uuid() primary key,
  freshdesk_ticket_id text unique,
  ontvangen_op timestamptz default now() not null,
  besteldatum text,
  bestelnummer text,
  naam text,
  bedrijfsnaam text,
  emailadres text,
  referentie text,
  opmerkingen text,
  adres text,
  producten jsonb default '[]'::jsonb,
  raw_description text,
  status text default 'nieuw' not null
);

alter table gazelle_pakket_orders enable row level security;

create policy "Admins kunnen alles op gazelle_pakket_orders"
  on gazelle_pakket_orders for all to authenticated
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );
