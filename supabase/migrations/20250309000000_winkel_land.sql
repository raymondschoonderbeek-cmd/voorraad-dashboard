-- Land per winkel (Nederland/België)
alter table winkels add column if not exists land text check (land is null or land in ('Netherlands', 'Belgium'));
