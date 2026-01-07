-- Add historical chapters for importing legacy data
INSERT INTO chapters (slug, name, description) VALUES
  ('niagara', 'Niagara', 'Historical chapter (inactive)'),
  ('other', 'Other', 'Miscellaneous events'),
  ('permanent', 'Permanent', 'Permanent rides')
ON CONFLICT (slug) DO NOTHING;
