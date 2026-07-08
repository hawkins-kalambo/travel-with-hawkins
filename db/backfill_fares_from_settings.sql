-- Backfill `bookings.fare` from the latest `settings.routes` mapping.
-- Safe to run multiple times (only updates rows with NULL fare).

WITH route_lines AS (
  SELECT regexp_split_to_table(routes, E'\n') AS line
  FROM public.settings
  ORDER BY updated_at DESC
  LIMIT 1
), parsed AS (
  SELECT
    trim(split_part(line, ':', 1)) AS route_text,
    (regexp_replace(trim(split_part(line, ':', 2)), '[^0-9]', '', 'g'))::bigint AS price
  FROM route_lines
), matches AS (
  SELECT b.booking_id, p.price
  FROM public.bookings b
  JOIN parsed p ON regexp_replace(lower(p.route_text), '[→—–\-\s]+', '->', 'g')
                 = regexp_replace(lower(trim(b.destination)), '[→—–\-\s]+', '->', 'g')
  WHERE b.fare IS NULL
)
UPDATE public.bookings
SET fare = matches.price
FROM matches
WHERE public.bookings.booking_id = matches.booking_id;

-- Verify affected rows
SELECT count(*) AS backfilled FROM public.bookings WHERE fare IS NOT NULL;