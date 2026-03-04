-- Winkeltoegang: van inclusie naar uitsluiting
-- Voorheen: gebruiker_winkels = winkels waar gebruiker TOEGANG toe heeft (leeg = alle)
-- Nu: gebruiker_winkels = winkels waar gebruiker GEEN toegang toe heeft (leeg = alle)
-- Standaard alle aangevinkt; alleen uitgevinkte winkels worden opgeslagen.

-- Converteer bestaande inclusie-lijsten naar uitsluitingen
create temp table _gw_backup as
  select user_id, array_agg(winkel_id) as included_ids
  from gebruiker_winkels
  group by user_id;

delete from gebruiker_winkels;

insert into gebruiker_winkels (user_id, winkel_id)
select b.user_id, w.id
from _gw_backup b
cross join winkels w
where not (w.id = any(b.included_ids));
