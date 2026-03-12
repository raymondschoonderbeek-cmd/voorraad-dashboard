-- Module-volgorde per gebruiker (dashboard)
alter table public.profiles
  add column if not exists modules_order jsonb not null default '["voorraad","lunch","brand-groep","meer"]'::jsonb;

comment on column public.profiles.modules_order is 'Volgorde van dashboard-modules: voorraad, lunch, brand-groep, meer';
