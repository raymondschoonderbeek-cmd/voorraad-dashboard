-- Snelle RPCs: retourneren JSON in één rij (geen 1000-rijenlimiet)
-- Voor Beheer: "in dataset" en "laatst datum" zonder paginatie

create or replace function get_vendit_dealer_numbers_json()
returns json as $$
  select coalesce(json_agg(d), '[]'::json)
  from (select distinct dealer_number::text as d from vendit_stock) sub
$$ language sql stable;

create or replace function get_vendit_dealer_stats_json()
returns json as $$
  select coalesce(json_object_agg(dealer_nummer, last_updated), '{}'::json)
  from (
    select dealer_number::text as dealer_nummer, max(file_date_time)::timestamptz as last_updated
    from vendit_stock
    group by dealer_number
  ) sub
$$ language sql stable;
