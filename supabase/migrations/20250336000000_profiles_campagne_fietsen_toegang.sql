-- Per gebruiker: toegang tot dashboard-module Campagnefietsen (admins negeren dit in de app)
alter table public.profiles
  add column if not exists campagne_fietsen_toegang boolean not null default false;

comment on column public.profiles.campagne_fietsen_toegang is 'Mag /dashboard/campagne-fietsen en API; admins hebben altijd toegang';
