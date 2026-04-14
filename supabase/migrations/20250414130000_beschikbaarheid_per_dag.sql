-- Vervang platte werk-kolommen door een per-dag JSONB-schema
-- Structuur: { "monday": { "enabled": true, "start": "09:00", "end": "17:00" }, ... }
ALTER TABLE gebruiker_beschikbaarheid
  ADD COLUMN IF NOT EXISTS work_schedule JSONB;

ALTER TABLE gebruiker_beschikbaarheid
  DROP COLUMN IF EXISTS work_days,
  DROP COLUMN IF EXISTS work_start_time,
  DROP COLUMN IF EXISTS work_end_time;
