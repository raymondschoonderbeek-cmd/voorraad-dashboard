-- Uitbreiden api_type check constraint met 'vendit'
alter table winkels drop constraint if exists winkels_api_type_check;
alter table winkels add constraint winkels_api_type_check check (api_type is null or api_type in ('cyclesoftware', 'wilmar', 'vendit'));
