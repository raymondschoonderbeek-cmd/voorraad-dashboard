-- Per-module rollen: viewer | bewerker | admin
-- Vervangt de binaire modules_toegang array voor modules die fine-grained rechten nodig hebben.
-- modules_toegang blijft bestaan voor backward compatibility (sidebar-zichtbaarheid).

create table gebruiker_module_rollen (
  user_id uuid not null,
  module  text not null,
  rol     text not null check (rol in ('viewer', 'bewerker', 'admin')),
  updated_at timestamptz default now(),
  primary key (user_id, module)
);

alter table gebruiker_module_rollen enable row level security;

-- Admins kunnen alle rollen beheren
create policy "Admins beheren module rollen"
  on gebruiker_module_rollen for all to authenticated
  using (
    exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

-- Elke gebruiker kan zijn eigen rollen inzien (voor session-info)
create policy "Gebruikers lezen eigen module rollen"
  on gebruiker_module_rollen for select to authenticated
  using (user_id = auth.uid());
