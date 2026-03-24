-- Referentie-snapshot (vastgelegde stand) om mutaties / geschatte verkoop te vergelijken met huidige voorraad
create table public.campagne_fietsen_voorraad_baseline_meta (
  id smallint primary key default 1 check (id = 1),
  recorded_at timestamptz
);

insert into public.campagne_fietsen_voorraad_baseline_meta (id, recorded_at)
values (1, null)
on conflict (id) do nothing;

comment on table public.campagne_fietsen_voorraad_baseline_meta is 'Singleton: tijdstip vastgelegde referentievoorraad (één rij id=1)';

create table public.campagne_fiets_winkel_voorraad_baseline (
  campagne_fiets_id uuid not null references public.campagne_fietsen (id) on delete cascade,
  winkel_id integer not null references public.winkels (id) on delete cascade,
  voorraad integer not null default 0 check (voorraad >= 0),
  bron text not null default 'cyclesoftware',
  primary key (campagne_fiets_id, winkel_id)
);

create index campagne_fiets_winkel_voorraad_baseline_winkel_id_idx on public.campagne_fiets_winkel_voorraad_baseline (winkel_id);

comment on table public.campagne_fiets_winkel_voorraad_baseline is 'Kopie van campagne_fiets_winkel_voorraad op referentiemoment; wordt gezet via API';

alter table public.campagne_fietsen_voorraad_baseline_meta enable row level security;
alter table public.campagne_fiets_winkel_voorraad_baseline enable row level security;

create policy "Ingelogde gebruikers lezen baseline meta"
  on public.campagne_fietsen_voorraad_baseline_meta for select
  to authenticated
  using (true);

create policy "Ingelogde gebruikers lezen baseline voorraad"
  on public.campagne_fiets_winkel_voorraad_baseline for select
  to authenticated
  using (true);
