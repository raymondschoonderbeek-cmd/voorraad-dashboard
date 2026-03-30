-- Naam-zoek (p_name_only): hele woord (raymond matcht niet graymond); regexp_quote + \y (PG15+)

create or replace function public.it_cmdb_hardware_search_ids(p_tokens text[], p_name_only boolean default false)
returns uuid[]
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    array_agg(d.id),
    '{}'::uuid[]
  )
  from public.it_cmdb_hardware d
  where public.can_access_it_cmdb(auth.uid())
  and p_tokens is not null
  and array_length(p_tokens, 1) is not null
  and array_length(p_tokens, 1) > 0
  and not exists (
    select 1
    from unnest(p_tokens) as t(needle)
    where length(trim(needle)) > 0
    and not (
      case
        when p_name_only then (
          (
            coalesce(d.user_name, '') <> ''
            and lower(unaccent(d.user_name)) ~* (
              '\y' || regexp_quote(lower(unaccent(trim(needle)))) || '\y'
            )
          )
          or (
            d.assigned_user_id is not null
            and exists (
              select 1 from auth.users u
              where u.id = d.assigned_user_id
              and coalesce(u.email, '') <> ''
              and lower(unaccent(u.email)) ~* (
                '\y' || regexp_quote(lower(unaccent(trim(needle)))) || '\y'
              )
            )
          )
          or (
            coalesce(d.intune_snapshot->>'emailAddress', '') <> ''
            and lower(unaccent(d.intune_snapshot->>'emailAddress')) ~* (
              '\y' || regexp_quote(lower(unaccent(trim(needle)))) || '\y'
            )
          )
          or (
            coalesce(d.intune_snapshot->>'userPrincipalName', '') <> ''
            and lower(unaccent(d.intune_snapshot->>'userPrincipalName')) ~* (
              '\y' || regexp_quote(lower(unaccent(trim(needle)))) || '\y'
            )
          )
        )
        else (
          d.serial_number ilike '%' || trim(needle) || '%'
          or d.hostname ilike '%' || trim(needle) || '%'
          or d.user_name ilike '%' || trim(needle) || '%'
          or (
            coalesce(d.user_name, '') <> ''
            and unaccent(d.user_name) ilike '%' || unaccent(trim(needle)) || '%'
          )
          or coalesce(d.device_type, '') ilike '%' || trim(needle) || '%'
          or coalesce(d.notes, '') ilike '%' || trim(needle) || '%'
          or coalesce(d.location, '') ilike '%' || trim(needle) || '%'
          or coalesce(d.intune, '') ilike '%' || trim(needle) || '%'
          or d.intune_snapshot::text ilike '%' || trim(needle) || '%'
          or (
            d.assigned_user_id is not null
            and exists (
              select 1 from auth.users u
              where u.id = d.assigned_user_id
              and (
                coalesce(u.email, '') ilike '%' || trim(needle) || '%'
                or (
                  coalesce(u.email, '') <> ''
                  and unaccent(u.email) ilike '%' || unaccent(trim(needle)) || '%'
                )
              )
            )
          )
        )
      end
    )
  );
$$;

comment on function public.it_cmdb_hardware_search_ids(text[], boolean) is
  'Zoeken: p_name_only=true = hele woord op naam/e-mail/UPN (regexp \y). Anders alle velden.';
