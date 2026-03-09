-- Voer uit in Supabase SQL Editor om vendit_stock schema te controleren
-- Zo kun je zien welke kolommen bestaan en welke timestamp-kolom gebruikt kan worden

-- 1. Alle kolommen van vendit_stock
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vendit_stock'
ORDER BY ordinal_position;

-- 2. Sample van 1 rij om te zien welke timestamp-kolommen data hebben
SELECT *
FROM vendit_stock
LIMIT 1;

-- 3. Unieke dealer nummers (controleer kolomnaam in stap 1)
-- SELECT DISTINCT dealer_number FROM vendit_stock LIMIT 10;
