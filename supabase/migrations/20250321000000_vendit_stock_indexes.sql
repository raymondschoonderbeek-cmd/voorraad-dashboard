-- Indexen op vendit_stock om Disk IO te verminderen
-- Zonder index: full table scan bij elke query op dealer-kolom
-- Met index: snelle lookup, minder disk reads

-- Alleen indexen aanmaken voor kolommen die bestaan (vendit_stock schema kan variëren)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vendit_stock' and column_name = 'dealer_number') then
    create index if not exists idx_vendit_stock_dealer_number on vendit_stock(dealer_number);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vendit_stock' and column_name = 'dealer_nummer') then
    create index if not exists idx_vendit_stock_dealer_nummer on vendit_stock(dealer_nummer);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vendit_stock' and column_name = 'dealer_id') then
    create index if not exists idx_vendit_stock_dealer_id on vendit_stock(dealer_id);
  end if;
end $$;
