-- Huisnummer kolom toevoegen
alter table winkels add column if not exists huisnummer text;

-- Nederlandse winkels: haal huisnummer uit straat (bijv. "Hoofdstraat 42" -> straat: "Hoofdstraat", huisnummer: "42")
-- Ondersteunt ook: "Verlengde Maanderweg 106-108" -> straat: "Verlengde Maanderweg", huisnummer: "106-108"
update winkels
set
  huisnummer = (regexp_match(trim(straat), '\s+(\d[\d\s\-a-zA-Z]*)$'))[1],
  straat = trim(regexp_replace(trim(straat), '\s+\d[\d\s\-a-zA-Z]*$', ''))
where land = 'Netherlands'
  and straat is not null
  and trim(straat) ~ '\s+\d[\d\s\-a-zA-Z]*$';
