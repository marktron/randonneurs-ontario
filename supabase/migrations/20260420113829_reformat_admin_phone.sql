-- Reformat existing admins.phone values.
-- Phones were stored as free-text; now admin-update paths normalize to XXX-XXX-XXXX.
-- Rewrite any value that parses as a 10-digit North American number or an
-- 11-digit number starting with 1 into the same canonical format.

UPDATE public.admins
SET phone = (
  SELECT
    CASE
      WHEN length(d) = 10 THEN
        substr(d, 1, 3) || '-' || substr(d, 4, 3) || '-' || substr(d, 7, 4)
      WHEN length(d) = 11 AND substr(d, 1, 1) = '1' THEN
        substr(d, 2, 3) || '-' || substr(d, 5, 3) || '-' || substr(d, 8, 4)
      ELSE phone
    END
  FROM (SELECT regexp_replace(phone, '\D', '', 'g') AS d) AS digits
)
WHERE phone IS NOT NULL
  AND phone <> ''
  AND (
    regexp_replace(phone, '\D', '', 'g') ~ '^[0-9]{10}$'
    OR regexp_replace(phone, '\D', '', 'g') ~ '^1[0-9]{10}$'
  );
