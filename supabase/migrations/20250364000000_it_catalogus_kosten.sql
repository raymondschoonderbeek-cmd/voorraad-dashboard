-- Kosten per licentie/product voor totaalkostenberekening
ALTER TABLE it_catalogus
  ADD COLUMN IF NOT EXISTS kosten_per_eenheid NUMERIC(10,2);
