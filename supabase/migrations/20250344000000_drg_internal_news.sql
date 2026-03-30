-- Intern DRG-nieuws: berichten, gelezen-status, digest-voorkeur

create or replace function public.is_drg_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.gebruiker_rollen g
    where g.user_id = uid and g.rol = 'admin'
  );
$$;

comment on function public.is_drg_admin(uuid) is 'True als gebruiker admin-rol heeft (gebruiker_rollen).';

grant execute on function public.is_drg_admin(uuid) to authenticated;
grant execute on function public.is_drg_admin(uuid) to service_role;

create table if not exists public.drg_news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text,
  body_html text not null default '',
  category text not null default 'algemeen',
  is_important boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drg_news_posts_published_at_idx on public.drg_news_posts (published_at desc nulls last);
create index if not exists drg_news_posts_category_idx on public.drg_news_posts (category);

comment on table public.drg_news_posts is 'Interne nieuwsberichten DRG Portal';
comment on column public.drg_news_posts.published_at is 'Null = concept; <= now() = live voor niet-admins; > now() = gepland';

create table if not exists public.drg_news_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  news_id uuid not null references public.drg_news_posts (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, news_id)
);

create index if not exists drg_news_reads_news_id_idx on public.drg_news_reads (news_id);

create table if not exists public.drg_news_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weekly_digest_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on column public.drg_news_preferences.weekly_digest_enabled is 'Wekelijkse samenvatting per e-mail';

alter table public.drg_news_posts enable row level security;
alter table public.drg_news_reads enable row level security;
alter table public.drg_news_preferences enable row level security;

-- Berichten: iedereen ingelogd ziet gepubliceerde; admin ziet alles
create policy drg_news_posts_select on public.drg_news_posts
  for select to authenticated
  using (
    (published_at is not null and published_at <= now())
    or public.is_drg_admin(auth.uid())
  );

create policy drg_news_posts_insert on public.drg_news_posts
  for insert to authenticated
  with check (public.is_drg_admin(auth.uid()));

create policy drg_news_posts_update on public.drg_news_posts
  for update to authenticated
  using (public.is_drg_admin(auth.uid()))
  with check (public.is_drg_admin(auth.uid()));

create policy drg_news_posts_delete on public.drg_news_posts
  for delete to authenticated
  using (public.is_drg_admin(auth.uid()));

-- Gelezen: eigen rijen
create policy drg_news_reads_select on public.drg_news_reads
  for select to authenticated
  using (user_id = auth.uid());

create policy drg_news_reads_insert on public.drg_news_reads
  for insert to authenticated
  with check (user_id = auth.uid());

create policy drg_news_reads_delete on public.drg_news_reads
  for delete to authenticated
  using (user_id = auth.uid());

-- Voorkeuren: eigen rij
create policy drg_news_prefs_select on public.drg_news_preferences
  for select to authenticated
  using (user_id = auth.uid());

create policy drg_news_prefs_upsert on public.drg_news_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

create policy drg_news_prefs_update on public.drg_news_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
