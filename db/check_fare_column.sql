-- Check whether `fare` column exists on `bookings` and show its type
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'fare';

-- Quick sample of bookings showing fare
SELECT booking_id, destination, fare, payment_status, receipt_number
FROM public.bookings
ORDER BY created_at DESC
LIMIT 10;