-- Haal B- of B vooraan uit postcode voor Belgische winkels (B-1000 → 1000)
update winkels
set postcode = trim(regexp_replace(postcode, '^[bB]-?', '', 'i'))
where land = 'Belgium'
  and postcode is not null
  and trim(postcode) ~ '^[bB]-?\d';
