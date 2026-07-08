-- Add `fare` column to `bookings` if it doesn't exist.
-- Run this in Supabase SQL editor or psql connected to your DB.

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS fare bigint;

-- Optional: add an index if you query by fare frequently
-- CREATE INDEX IF NOT EXISTS bookings_fare_idx ON public.bookings(fare);