-- Afdelingen voor intern nieuws (was vaste categorieën); slug komt overeen met drg_news_posts.category

create table if not exists public.drg_news_afdelingen (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (char_length(slug) <= 64 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drg_news_afdelingen_sort_idx on public.drg_news_afdelingen (sort_order, label);

comment on table public.drg_news_afdelingen is 'Afdelingen (labels) voor intern nieuws; slug = drg_news_posts.category';
comment on column public.drg_news_afdelingen.slug is 'Stabiele sleutel; wijzigen alleen via migratie/DB';

alter table public.drg_news_afdelingen enable row level security;

create policy drg_news_afdelingen_select on public.drg_news_afdelingen
  for select to authenticated
  using (true);

create policy drg_news_afdelingen_insert on public.drg_news_afdelingen
  for insert to authenticated
  with check (public.can_manage_drg_internal_news(auth.uid()));

create policy drg_news_afdelingen_update on public.drg_news_afdelingen
  for update to authenticated
  using (public.can_manage_drg_internal_news(auth.uid()))
  with check (public.can_manage_drg_internal_news(auth.uid()));

create policy drg_news_afdelingen_delete on public.drg_news_afdelingen
  for delete to authenticated
  using (public.can_manage_drg_internal_news(auth.uid()));

insert into public.drg_news_afdelingen (slug, label, sort_order)
values
  ('algemeen', 'Algemeen', 10),
  ('hr', 'HR', 20),
  ('winkel', 'Winkel', 30),
  ('it', 'IT', 40),
  ('organisatie', 'Organisatie', 50)
on conflict (slug) do nothing;
