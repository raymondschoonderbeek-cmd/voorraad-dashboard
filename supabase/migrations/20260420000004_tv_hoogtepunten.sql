-- Maand hoogtepunten voor TV-scherm (feestdagen, bedrijfsevenementen, etc.)
create table if not exists public.tv_hoogtepunten (
  id uuid primary key default gen_random_uuid(),
  datum date not null,
  naam text not null,
  icoon text not null default '📅',
  actief boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.tv_hoogtepunten is 'Hoogtepunten (feestdagen, events) zichtbaar op het TV-scherm';

alter table public.tv_hoogtepunten enable row level security;

create policy tv_hoogtepunten_select on public.tv_hoogtepunten
  for select to authenticated using (true);

create policy tv_hoogtepunten_insert on public.tv_hoogtepunten
  for insert to authenticated with check (public.is_drg_admin(auth.uid()));

create policy tv_hoogtepunten_update on public.tv_hoogtepunten
  for update to authenticated
  using (public.is_drg_admin(auth.uid()))
  with check (public.is_drg_admin(auth.uid()));

create policy tv_hoogtepunten_delete on public.tv_hoogtepunten
  for delete to authenticated using (public.is_drg_admin(auth.uid()));
