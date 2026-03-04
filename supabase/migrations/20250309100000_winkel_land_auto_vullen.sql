-- Vul land automatisch in voor bestaande winkels (waar land nog null is)
-- Logica: 4-cijferige postcode = België, bekende Belgische steden = België, anders Nederland
update winkels
set land = case
  when regexp_replace(trim(coalesce(postcode, '')), '\s', '', 'g') ~ '^\d{4}$' then 'Belgium'
  when lower(coalesce(stad, '')) ~ 'brussel|brussels|antwerpen|antwerp|gent|ghent|liège|liege|charleroi|brugge|bruges|namur|leuven|mons|aalst|mechelen|kortrijk|hasselt|sint-niklaas|genk|roeselare|dendermonde|turnhout|dilbeek|heist-op-den-berg|lokeren|vilvoorde|sint-truiden|mouscron|waregem|geel|braine-l''alleud|louvain-la-neuve|louvière|louviere' then 'Belgium'
  else 'Netherlands'
end
where land is null
  and (trim(coalesce(postcode, '')) <> '' or trim(coalesce(stad, '')) <> '');
