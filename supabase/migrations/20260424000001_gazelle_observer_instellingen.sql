-- Gazelle Observer instellingen: webhook secret, pakket beschikbaarheid, Google Sheet URL

create table if not exists gazelle_observer_instellingen (
  id int primary key default 1,
  webhook_secret text,
  actief boolean default true not null,
  pakket_instellingen jsonb default '{}'::jsonb,
  google_sheet_url text,
  updated_at timestamptz default now()
);

-- Zorg dat er altijd precies één rij is
insert into gazelle_observer_instellingen (id)
  values (1)
  on conflict (id) do nothing;

alter table gazelle_observer_instellingen enable row level security;

create policy "Admins kunnen alles op gazelle_observer_instellingen"
  on gazelle_observer_instellingen for all to authenticated
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );
