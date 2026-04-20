-- Reformat existing emergency_contact_phone values from "(XXX) XXX-XXXX" to "XXX-XXX-XXXX".
-- New writes already go through normalizePhone() which produces the new format.

UPDATE public.riders
SET emergency_contact_phone = regexp_replace(
  emergency_contact_phone,
  '^\(([0-9]{3})\)\s*([0-9]{3})-([0-9]{4})$',
  '\1-\2-\3'
)
WHERE emergency_contact_phone ~ '^\([0-9]{3}\)\s*[0-9]{3}-[0-9]{4}$';
