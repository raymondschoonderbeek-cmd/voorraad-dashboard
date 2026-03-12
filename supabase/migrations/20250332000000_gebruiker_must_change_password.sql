-- Gebruiker moet wachtwoord wijzigen na eerste inlog (bijv. na aanmaken door admin)
alter table public.gebruiker_rollen
  add column if not exists must_change_password boolean not null default false;

comment on column public.gebruiker_rollen.must_change_password is 'Na eerste inlog moet gebruiker wachtwoord wijzigen (bij aanmaken door admin)';
