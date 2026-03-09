-- Kassa pakket was api_type (Wilmar, CycleSoftware, Vendit) — kolom niet nodig
alter table winkels drop column if exists kassa_pakket;
