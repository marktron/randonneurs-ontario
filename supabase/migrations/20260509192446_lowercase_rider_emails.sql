-- Lowercase existing rider emails so case-insensitive lookups can rely on
-- consistent storage. Application code now normalizes on write, but legacy
-- rows may still hold mixed-case values (e.g. "rider@Example.com") which
-- caused registration to miss the existing rider and create a duplicate.

UPDATE public.riders
SET email = lower(email)
WHERE email IS NOT NULL
  AND email <> lower(email);
