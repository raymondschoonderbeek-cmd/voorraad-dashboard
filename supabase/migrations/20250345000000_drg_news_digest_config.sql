-- Configuratie wekelijkse nieuws-digest (admin); cron leest via service role

create table if not exists public.drg_news_digest_config (
  id smallint primary key default 1 constraint drg_news_digest_config_singleton check (id = 1),
  digest_enabled boolean not null default true,
  /** ISO weekdag 1=ma … 7=zo, Europe/Amsterdam */
  digest_weekday smallint not null default 5
    check (digest_weekday >= 1 and digest_weekday <= 7),
  digest_time_local text not null default '09:00',
  last_digest_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.drg_news_digest_config is 'Wekelijkse nieuws-digest: weekdag en tijd (Amsterdam)';
comment on column public.drg_news_digest_config.last_digest_sent_at is 'Laatste succesvolle run (geen dubbele mail dezelfde dag)';

insert into public.drg_news_digest_config (id) values (1)
on conflict (id) do nothing;

alter table public.drg_news_digest_config enable row level security;

create policy drg_news_digest_config_select on public.drg_news_digest_config
  for select to authenticated
  using (public.is_drg_admin(auth.uid()));

create policy drg_news_digest_config_update on public.drg_news_digest_config
  for update to authenticated
  using (public.is_drg_admin(auth.uid()))
  with check (public.is_drg_admin(auth.uid()));

create policy drg_news_digest_config_insert on public.drg_news_digest_config
  for insert to authenticated
  with check (public.is_drg_admin(auth.uid()));
