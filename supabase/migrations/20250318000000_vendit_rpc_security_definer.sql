-- RPCs met SECURITY DEFINER: lezen vendit_stock ongeacht RLS/caller
-- Zo werkt "in dataset" en "laatst datum" ook als de caller beperkte rechten heeft

create or replace function get_vendit_dealer_numbers_json()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dealer_col text;
  q text;
  res json;
begin
  -- Zoek dealer-kolom (dealer_number of dealer_nummer)
  select column_name into dealer_col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'vendit_stock'
    and column_name in ('dealer_number', 'dealer_nummer')
  order by case column_name when 'dealer_number' then 1 else 2 end
  limit 1;

  if dealer_col is null then
    return '[]'::json;
  end if;

  q := format(
    'select coalesce(json_agg(d), ''[]''::json) from (select distinct %I::text as d from vendit_stock) sub',
    dealer_col
  );
  execute q into res;
  return coalesce(res, '[]'::json);
end;
$$;

-- get_vendit_dealer_stats_json: dynamische dealer- en timestamp-kolom
create or replace function get_vendit_dealer_stats_json()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dealer_col text;
  ts_col text;
  q text;
  res json;
begin
  select column_name into dealer_col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'vendit_stock'
    and column_name in ('dealer_number', 'dealer_nummer')
  order by case column_name when 'dealer_number' then 1 else 2 end
  limit 1;

  select c.column_name into ts_col
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'vendit_stock'
    and c.column_name in ('file_date_time', 'file_datetime', 'sync_date', 'created_at', 'updated_at', 'import_date', 'stock_date')
  order by case c.column_name
    when 'file_date_time' then 1
    when 'file_datetime' then 2
    when 'sync_date' then 3
    when 'updated_at' then 4
    when 'created_at' then 5
    else 6
  end
  limit 1;

  if dealer_col is null then
    return '{}'::json;
  end if;

  if ts_col is null then
    q := format(
      'select coalesce(json_object_agg(d::text, null), ''{}''::json) from (select distinct %I as d from vendit_stock) sub',
      dealer_col
    );
  else
    q := format(
      'select coalesce(json_object_agg(dealer_nummer, last_updated), ''{}''::json) from (
        select %I::text as dealer_nummer, max(%I)::timestamptz as last_updated
        from vendit_stock
        group by %I
      ) sub',
      dealer_col, ts_col, dealer_col
    );
  end if;
  execute q into res;
  return coalesce(res, '{}'::json);
end;
$$;
