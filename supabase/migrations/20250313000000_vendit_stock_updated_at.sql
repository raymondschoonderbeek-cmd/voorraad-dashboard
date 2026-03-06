-- RPC: per dealer_number de laatste file_date_time (bestaande kolom in vendit_stock)
create or replace function get_vendit_dealer_stats()
returns table(dealer_nummer text, last_updated timestamptz) as $$
  select dealer_number::text, max(file_date_time::timestamptz) as last_updated
  from vendit_stock
  where file_date_time is not null
  group by dealer_number
$$ language sql stable;

-- RPC: alle dealer_numbers in vendit_stock (voor "in dataset" check, geen row limit)
create or replace function get_vendit_dealer_numbers()
returns table(dealer_nummer text) as $$
  select distinct dealer_number::text from vendit_stock
$$ language sql stable;
