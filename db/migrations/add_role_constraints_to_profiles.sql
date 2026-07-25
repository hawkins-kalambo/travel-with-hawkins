DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role text;
  END IF;
END $$;

UPDATE public.profiles
SET role = COALESCE(NULLIF(role, ''), 'customer')
WHERE role IS NULL OR role = '';

ALTER TABLE public.profiles
ALTER COLUMN role SET DEFAULT 'customer';

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('super_admin','admin','viewer','ambassador','customer'));
