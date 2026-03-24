-- Gecachte campagnefiets-voorraad per winkel (periodieke sync + handmatige herberekening)
create table public.campagne_fiets_winkel_voorraad (
  campagne_fiets_id uuid not null references public.campagne_fietsen (id) on delete cascade,
  winkel_id integer not null references public.winkels (id) on delete cascade,
  voorraad integer not null default 0 check (voorraad >= 0),
  bron text not null default 'cyclesoftware',
  primary key (campagne_fiets_id, winkel_id)
);

create index campagne_fiets_winkel_voorraad_winkel_id_idx on public.campagne_fiets_winkel_voorraad (winkel_id);

comment on table public.campagne_fiets_winkel_voorraad is 'Snapshot: voorraad campagnefiets per winkel; wordt ververst door sync-job';

-- Singleton: laatste sync-tijd + API-fouten per winkel
create table public.campagne_fietsen_voorraad_sync (
  id smallint primary key default 1 check (id = 1),
  last_sync_at timestamptz,
  winkel_fouten jsonb not null default '[]'::jsonb
);

insert into public.campagne_fietsen_voorraad_sync (id, last_sync_at, winkel_fouten)
values (1, null, '[]'::jsonb)
on conflict (id) do nothing;

comment on table public.campagne_fietsen_voorraad_sync is 'Meta voor campagne-voorraad sync (één rij id=1)';

alter table public.campagne_fiets_winkel_voorraad enable row level security;
alter table public.campagne_fietsen_voorraad_sync enable row level security;

create policy "Ingelogde gebruikers lezen campagne voorraad snapshot"
  on public.campagne_fiets_winkel_voorraad for select
  to authenticated
  using (true);

create policy "Ingelogde gebruikers lezen campagne sync meta"
  on public.campagne_fietsen_voorraad_sync for select
  to authenticated
  using (true);

-- Schrijven via service role (API sync)
