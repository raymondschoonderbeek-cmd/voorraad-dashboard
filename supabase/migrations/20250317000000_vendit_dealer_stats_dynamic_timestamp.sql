-- get_vendit_dealer_stats_json: zoek dynamisch naar timestamp-kolom
-- Als file_date_time ontbreekt of anders heet, probeer alternatieven

create or replace function get_vendit_dealer_stats_json()
returns json as $$
declare
  ts_col text;
  q text;
  res json;
begin
  -- Zoek eerste bestaande timestamp-kolom in vendit_stock
  select c.column_name into ts_col
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
    and c.table_name = 'vendit_stock'
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

  if ts_col is null then
    -- Geen bekende timestamp-kolom: retourneer dealer_nummers met null (zodat "in dataset" werkt, datum blijft onbekend)
    return (
      select coalesce(json_object_agg(d::text, null), '{}'::json)
      from (select distinct dealer_number as d from vendit_stock) sub
    );
  end if;

  q := format(
    $q$
    select coalesce(json_object_agg(dealer_nummer, last_updated), '{}'::json)
    from (
      select dealer_number::text as dealer_nummer, max(%I)::timestamptz as last_updated
      from vendit_stock
      group by dealer_number
    ) sub
    $q$,
    ts_col
  );
  execute q into res;
  return res;
end;
$$ language plpgsql stable;
