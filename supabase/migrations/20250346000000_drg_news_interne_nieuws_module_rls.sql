-- Nieuwsbeheer voor niet-admins: modules_toegang bevat 'interne-nieuws'

create or replace function public.can_manage_drg_internal_news(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_drg_admin(uid)
  or exists (
    select 1 from public.profiles p
    where p.user_id = uid
    and p.modules_toegang is not null
    and jsonb_typeof(p.modules_toegang) = 'array'
    and p.modules_toegang @> '["interne-nieuws"]'::jsonb
  );
$$;

comment on function public.can_manage_drg_internal_news(uuid) is 'Admin of profiles.modules_toegang bevat interne-nieuws.';

grant execute on function public.can_manage_drg_internal_news(uuid) to authenticated;
grant execute on function public.can_manage_drg_internal_news(uuid) to service_role;

drop policy if exists drg_news_posts_select on public.drg_news_posts;
create policy drg_news_posts_select on public.drg_news_posts
  for select to authenticated
  using (
    (published_at is not null and published_at <= now())
    or public.can_manage_drg_internal_news(auth.uid())
  );

drop policy if exists drg_news_posts_insert on public.drg_news_posts;
create policy drg_news_posts_insert on public.drg_news_posts
  for insert to authenticated
  with check (public.can_manage_drg_internal_news(auth.uid()));

drop policy if exists drg_news_posts_update on public.drg_news_posts;
create policy drg_news_posts_update on public.drg_news_posts
  for update to authenticated
  using (public.can_manage_drg_internal_news(auth.uid()))
  with check (public.can_manage_drg_internal_news(auth.uid()));

drop policy if exists drg_news_posts_delete on public.drg_news_posts;
create policy drg_news_posts_delete on public.drg_news_posts
  for delete to authenticated
  using (public.can_manage_drg_internal_news(auth.uid()));

drop policy if exists drg_news_digest_config_select on public.drg_news_digest_config;
create policy drg_news_digest_config_select on public.drg_news_digest_config
  for select to authenticated
  using (public.can_manage_drg_internal_news(auth.uid()));

drop policy if exists drg_news_digest_config_update on public.drg_news_digest_config;
create policy drg_news_digest_config_update on public.drg_news_digest_config
  for update to authenticated
  using (public.can_manage_drg_internal_news(auth.uid()))
  with check (public.can_manage_drg_internal_news(auth.uid()));

drop policy if exists drg_news_digest_config_insert on public.drg_news_digest_config;
create policy drg_news_digest_config_insert on public.drg_news_digest_config
  for insert to authenticated
  with check (public.can_manage_drg_internal_news(auth.uid()));
