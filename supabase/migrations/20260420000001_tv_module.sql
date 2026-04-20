-- TV module: verjaardagen op profiel + mededelingen ticker

-- Verjaardagen en weergavenaam toevoegen aan profiles
alter table public.profiles
  add column if not exists geboortedatum date,
  add column if not exists weergave_naam text;

comment on column public.profiles.geboortedatum is 'Geboortedatum voor TV-module verjaardag weergave (dag/maand, jaar niet zichtbaar op scherm)';
comment on column public.profiles.weergave_naam is 'Weergavenaam op TV-module (optioneel, anders email-prefix)';

-- TV mededelingen: scrollende ticker-berichten onderin het TV-scherm
create table if not exists public.tv_mededelingen (
  id uuid primary key default gen_random_uuid(),
  tekst text not null,
  actief boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tv_mededelingen is 'Scrollende ticker-berichten onderaan TV-scherm. Beheerd door admins.';

alter table public.tv_mededelingen enable row level security;

create policy tv_mededelingen_select on public.tv_mededelingen
  for select to authenticated
  using (true);

create policy tv_mededelingen_insert on public.tv_mededelingen
  for insert to authenticated
  with check (public.is_drg_admin(auth.uid()));

create policy tv_mededelingen_update on public.tv_mededelingen
  for update to authenticated
  using (public.is_drg_admin(auth.uid()))
  with check (public.is_drg_admin(auth.uid()));

create policy tv_mededelingen_delete on public.tv_mededelingen
  for delete to authenticated
  using (public.is_drg_admin(auth.uid()));

-- RPC: haal jarigen op voor service_role (geen RLS bypass nodig, profiles is eigen-rij)
-- Gebruik service_role in API-route om profielen van alle gebruikers te lezen
