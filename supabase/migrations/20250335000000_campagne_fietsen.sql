-- Campagnefietsen: beheer via dashboard, voorraad via bestaande koppelingen (EAN / leveranciersnummer)
create table public.campagne_fietsen (
  id uuid primary key default gen_random_uuid(),
  merk text not null default '',
  omschrijving_fiets text not null default '',
  ean_code text not null,
  bestelnummer_leverancier text not null default '',
  kleur text not null default '',
  framemaat text not null default '',
  foto_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campagne_fietsen_ean_unique unique (ean_code)
);

create index campagne_fietsen_active_idx on public.campagne_fietsen (active);

comment on table public.campagne_fietsen is 'Campagnefietsen; voorraad match op EAN of leveranciersartikel via /api/voorraad';

alter table public.campagne_fietsen enable row level security;

create policy "campagne_fietsen_select_authenticated"
  on public.campagne_fietsen for select
  to authenticated
  using (true);

create policy "campagne_fietsen_insert_admin"
  on public.campagne_fietsen for insert
  to authenticated
  with check (
    exists (select 1 from public.gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

create policy "campagne_fietsen_update_admin"
  on public.campagne_fietsen for update
  to authenticated
  using (
    exists (select 1 from public.gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  )
  with check (
    exists (select 1 from public.gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

create policy "campagne_fietsen_delete_admin"
  on public.campagne_fietsen for delete
  to authenticated
  using (
    exists (select 1 from public.gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

-- Seed Cortina E-Fello campagne (9 regels)
insert into public.campagne_fietsen (merk, omschrijving_fiets, ean_code, bestelnummer_leverancier, kleur, framemaat, foto_url, active)
values
  ('Cortina', 'Cortina E-Fello MM D47 N7', '8719461059541', 'CEFEMM47L0001', 'iron/black matt', 'D47', 'https://kruitbosch.xcdn.nl/CEFELLO0001.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true),
  ('Cortina', 'Cortina E-Fello MM D52 N7', '8719461059572', 'CEFEMM52L0001', 'iron/black matt', 'D52', 'https://kruitbosch.xcdn.nl/CEFELLO0001.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true),
  ('Cortina', 'Cortina E-Fello MM D57 N7', '8719461059602', 'CEFEMM57L0001', 'iron/black matt', 'D57', 'https://kruitbosch.xcdn.nl/CEFELLO0001.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true),
  ('Cortina', 'Cortina E-Fello MM D57 N8', '8719461059640', 'CEFEMM57L1001', 'iron/black matt', 'D57', 'https://kruitbosch.xcdn.nl/CEFELLOPLUS0001.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true),
  ('Cortina', 'Cortina E-Fello MM D47 N8', '8719461059701', 'CEFEMM47L1001', 'iron/black matt', 'D47', 'https://kruitbosch.xcdn.nl/CEFELLOPLUS0001.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true),
  ('Cortina', 'Cortina E-Fello MM D52 N8', '8719461059732', 'CEFEMM52L1001', 'iron/black matt', 'D52', 'https://kruitbosch.xcdn.nl/CEFELLOPLUS0001.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true),
  ('Cortina', 'Cortina E-Fello MM D57 N8', '8719461059657', 'CEFEMM57L1002', 'pebble grey', 'D57', 'https://kruitbosch.xcdn.nl/CEFELLOPLUS0002.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true),
  ('Cortina', 'Cortina E-Fello MM D47 N8', '8719461059718', 'CEFEMM47L1002', 'pebble grey', 'D47', 'https://kruitbosch.xcdn.nl/CEFELLOPLUS0002.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true),
  ('Cortina', 'Cortina E-Fello MM D52 N8', '8719461059749', 'CEFEMM52L1002', 'pebble grey', 'D52', 'https://kruitbosch.xcdn.nl/CEFELLOPLUS0002.jpg?d=2&f=s:500:500:0:1/bg:ffffff/q:60', true)
on conflict (ean_code) do nothing;
