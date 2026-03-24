-- Per-gebruiker dashboard-modules en landen (winkel-uitsluitingen niet meer gebruikt in app)
alter table public.profiles
  add column if not exists modules_toegang jsonb,
  add column if not exists landen_toegang jsonb;

comment on column public.profiles.modules_toegang is 'JSON-array module-id''s, zie app; null = legacy defaults (lunch_module_enabled / campagne_fietsen_toegang / rol)';
comment on column public.profiles.landen_toegang is 'JSON-array: Netherlands, Belgium; null of beide = alle landen';
