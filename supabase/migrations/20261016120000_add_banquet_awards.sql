-- Banquet awards: nine season-scoped awards and their historical winners.
-- Some winners have no rider profile (committees, non-members), so rider_awards
-- gains a name-only path via recipient_name.

ALTER TABLE rider_awards ALTER COLUMN rider_id DROP NOT NULL;
ALTER TABLE rider_awards ADD COLUMN IF NOT EXISTS recipient_name TEXT;

COMMENT ON COLUMN rider_awards.recipient_name IS
  'Display name for winners with no rider profile (committees, non-members). Used only when rider_id is NULL.';

ALTER TABLE rider_awards DROP CONSTRAINT IF EXISTS rider_awards_recipient_check;
ALTER TABLE rider_awards ADD CONSTRAINT rider_awards_recipient_check
  CHECK (rider_id IS NOT NULL OR recipient_name IS NOT NULL);

-- ============================================================================
-- Recipients RPC: season branch LEFT JOINs riders so name-only rows appear
-- ============================================================================

CREATE OR REPLACE FUNCTION get_award_recipients(p_award_slug TEXT)
RETURNS TABLE (
  rider_slug TEXT,
  rider_name TEXT,
  award_year INTEGER
) AS $$
BEGIN
  RETURN QUERY
  -- Season-scoped awards (from rider_awards)
  SELECT
    r.slug AS rider_slug,
    COALESCE(NULLIF(TRIM(CONCAT(r.first_name, ' ', r.last_name)), ''), ra.recipient_name) AS rider_name,
    ra.season AS award_year
  FROM rider_awards ra
  JOIN awards a ON ra.award_id = a.id
  LEFT JOIN riders r ON ra.rider_id = r.id
  WHERE a.slug = p_award_slug
    AND a.award_type = 'season'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name, ra.recipient_name, ra.season

  UNION ALL

  -- Result-scoped awards (from result_awards)
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.season AS award_year
  FROM result_awards rsa
  JOIN awards a ON rsa.award_id = a.id
  JOIN results res ON rsa.result_id = res.id
  JOIN riders r ON res.rider_id = r.id
  WHERE a.slug = p_award_slug
    AND a.award_type = 'result'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name, res.season

  ORDER BY award_year DESC, rider_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Awards
-- ============================================================================

INSERT INTO awards (slug, title, description, award_type) VALUES
  ('mike-barry-jock-wadley', 'Mike Barry/Jock Wadley Award', 'For a rider who stood out this year, or over several. The winner completed a Super Randonneur series and the hardest ride on the calendar in the award year. They also helped on rides or helped other riders, and put real support behind the club.', 'season'),
  ('beryl-burton', 'Beryl Burton Award', 'For a woman who stood out this year, or over several. She supports the club, helps on rides, and helps other riders.', 'season'),
  ('coronation-cup', 'Coronation Cup', 'For a rider with at least one previous season in the club who kept showing up and got noticeably better. That means more kilometres than last season, or faster brevet finishes.', 'season'),
  ('jim-griffin-rookie-of-the-year', 'Jim Griffin Rookie of the Year', 'For a rider who joined the club or rode their first brevet this year, showed ability, and took an interest in the club and the people riding beside them.', 'season'),
  ('organiser-of-the-year', 'Organiser of the Year', 'For the person who organised and supported club rides this year, or over several, and looked after the riders while doing it.', 'season'),
  ('outstanding-performance', 'Outstanding Performance on a Brevet', 'For a rider who showed fortitude, courage, or generosity on a brevet beyond what the ride normally asks.', 'season'),
  ('dan-herbert', 'Dan Herbert Award', 'For a member who made the club better by mentoring other members.', 'season'),
  ('half-wheel', 'Half Wheel Award', 'For the rider who kept forcing the pace on brevets all season.', 'season'),
  ('special-recognition', 'Special Recognition Award', 'For a rider who completed something this year worth remembering.', 'season')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- Winners (unknown award slug aborts; unknown rider slug is skipped; idempotent)
-- ============================================================================

DO $$
DECLARE
  v_missing TEXT;
BEGIN
  CREATE TEMP TABLE _banquet_winners ON COMMIT DROP AS
  SELECT * FROM (VALUES
    ('mike-barry-jock-wadley', 2025, 'brenda-wiechers-maxwell', NULL, NULL),
    ('mike-barry-jock-wadley', 2024, 'brenda-wiechers-maxwell', NULL, NULL),
    ('mike-barry-jock-wadley', 2023, 'fred-chagnon', NULL, NULL),
    ('mike-barry-jock-wadley', 2022, 'brenda-wiechers-maxwell', NULL, NULL),
    ('mike-barry-jock-wadley', 2021, 'john-cumming', NULL, NULL),
    ('mike-barry-jock-wadley', 2019, 'charles-horslin', NULL, NULL),
    ('mike-barry-jock-wadley', 2018, 'carey-chappelle', NULL, NULL),
    ('mike-barry-jock-wadley', 2017, 'john-cumming', NULL, NULL),
    ('mike-barry-jock-wadley', 2016, 'bob-macleod', NULL, NULL),
    ('mike-barry-jock-wadley', 2015, 'kathy-brouse', NULL, NULL),
    ('mike-barry-jock-wadley', 2014, 'david-thompson', NULL, NULL),
    ('mike-barry-jock-wadley', 2013, 'liz-overduin', NULL, NULL),
    ('mike-barry-jock-wadley', 2012, 'stephen-jones', NULL, NULL),
    ('mike-barry-jock-wadley', 2011, 'carey-chappelle', NULL, NULL),
    ('mike-barry-jock-wadley', 2010, 'bob-kassel', NULL, NULL),
    ('mike-barry-jock-wadley', 2009, 'henk-bouhuyzen', NULL, NULL),
    ('mike-barry-jock-wadley', 2008, 'peter-grant', NULL, NULL),
    ('mike-barry-jock-wadley', 2007, 'vytas-janusauskas', NULL, NULL),
    ('mike-barry-jock-wadley', 2006, 'richard-felton', NULL, NULL),
    ('mike-barry-jock-wadley', 2005, 'vytas-janusauskas', NULL, NULL),
    ('mike-barry-jock-wadley', 2004, 'michael-lau', NULL, NULL),
    ('mike-barry-jock-wadley', 2003, 'jaye-haworth', NULL, NULL),
    ('mike-barry-jock-wadley', 2002, 'larry-strung', NULL, NULL),
    ('mike-barry-jock-wadley', 2001, 'ken-dobb', NULL, NULL),
    ('mike-barry-jock-wadley', 2000, 'daniel-beavon', NULL, NULL),
    ('mike-barry-jock-wadley', 1999, 'michael-lau', NULL, NULL),
    ('mike-barry-jock-wadley', 1998, 'martin-heath', NULL, NULL),
    ('mike-barry-jock-wadley', 1997, 'ken-dobb', NULL, NULL),
    ('mike-barry-jock-wadley', 1996, 'martin-heath', NULL, NULL),
    ('mike-barry-jock-wadley', 1995, 'rick-brown', NULL, NULL),
    ('beryl-burton', 2025, 'brenda-wiechers-maxwell', NULL, NULL),
    ('beryl-burton', 2024, 'brenda-wiechers-maxwell', NULL, NULL),
    ('beryl-burton', 2023, 'brenda-wiechers-maxwell', NULL, NULL),
    ('beryl-burton', 2022, 'brenda-wiechers-maxwell', NULL, NULL),
    ('beryl-burton', 2021, 'jungah-hong', NULL, NULL),
    ('beryl-burton', 2018, 'erin-marchak', NULL, NULL),
    ('beryl-burton', 2017, 'erin-marchak', NULL, NULL),
    ('beryl-burton', 2016, 'erin-marchak', NULL, NULL),
    ('beryl-burton', 2014, 'kathy-brouse', NULL, NULL),
    ('coronation-cup', 2025, 'karl-caris', NULL, NULL),
    ('coronation-cup', 2024, 'michael-charland', NULL, NULL),
    ('coronation-cup', 2023, 'fred-chagnon', NULL, NULL),
    ('coronation-cup', 2022, 'fred-chagnon', NULL, NULL),
    ('coronation-cup', 2021, 'fred-chagnon', NULL, NULL),
    ('coronation-cup', 2019, 'brenda-wiechers-maxwell', NULL, NULL),
    ('coronation-cup', 2018, 'erin-marchak', NULL, NULL),
    ('coronation-cup', 2017, 'david-hamilton', NULL, NULL),
    ('coronation-cup', 2016, 'charles-horslin', NULL, NULL),
    ('coronation-cup', 2014, 'bob-macleod', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2025, 'chad-szymanski', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2024, 'oleksandr-shyman', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2023, 'natalia-derbentseva', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2022, 'john-kieffer', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2021, 'david-cole', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2019, 'jungah-hong', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2018, 'matthew-mcfarlane', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2017, 'don-williams', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2016, 'joey-schwartz', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2015, 'jim-brand', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2014, 'tim-ormond', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2013, 'alexander-weber', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2012, 'mark-daniels', NULL, NULL),
    ('jim-griffin-rookie-of-the-year', 2011, 'vaune-davis', NULL, NULL),
    ('organiser-of-the-year', 2025, 'fred-chagnon', NULL, NULL),
    ('organiser-of-the-year', 2024, 'fred-chagnon', NULL, NULL),
    ('organiser-of-the-year', 2023, 'john-cumming', NULL, NULL),
    ('organiser-of-the-year', 2022, 'charles-horslin', NULL, NULL),
    ('organiser-of-the-year', 2021, 'vytas-janusauskas', NULL, NULL),
    ('organiser-of-the-year', 2019, 'tim-ocallahan', NULL, NULL),
    ('organiser-of-the-year', 2018, 'stephen-jones', NULL, NULL),
    ('organiser-of-the-year', 2017, NULL, 'Granite Anvil Organizing Committee', NULL),
    ('organiser-of-the-year', 2016, 'david-thompson', NULL, NULL),
    ('organiser-of-the-year', 2014, 'vytas-janusauskas', NULL, NULL),
    ('outstanding-performance', 2025, 'brenda-wiechers-maxwell', NULL, NULL),
    ('outstanding-performance', 2025, 'lorelei-norman', NULL, NULL),
    ('outstanding-performance', 2024, 'tiago-varella-cid', NULL, NULL),
    ('outstanding-performance', 2023, 'xinhua-luke-luo', NULL, NULL),
    ('outstanding-performance', 2022, 'brenda-wiechers-maxwell', NULL, NULL),
    ('outstanding-performance', 2021, 'remi-parent', NULL, NULL),
    ('outstanding-performance', 2019, 'matthew-mcfarlane', NULL, NULL),
    ('outstanding-performance', 2018, 'annette-patel', NULL, NULL),
    ('outstanding-performance', 2017, 'brian-brideau', NULL, 'Two Guys on Fat Bikes'),
    ('outstanding-performance', 2017, 'renato-alessandrini', NULL, 'Two Guys on Fat Bikes'),
    ('outstanding-performance', 2016, 'tim-ocallahan', NULL, NULL),
    ('outstanding-performance', 2014, 'ali-lalani', NULL, NULL),
    ('dan-herbert', 2025, 'fred-chagnon', NULL, NULL),
    ('dan-herbert', 2024, 'tim-ocallahan', NULL, NULL),
    ('dan-herbert', 2023, 'tim-ocallahan', NULL, NULL),
    ('dan-herbert', 2022, 'carey-chappelle', NULL, NULL),
    ('dan-herbert', 2021, 'carey-chappelle', NULL, NULL),
    ('dan-herbert', 2019, 'peter-grant', NULL, NULL),
    ('dan-herbert', 2018, 'tim-ocallahan', NULL, NULL),
    ('dan-herbert', 2017, 'tim-ocallahan', NULL, NULL),
    ('dan-herbert', 2016, 'tim-ocallahan', NULL, NULL),
    ('dan-herbert', 2015, 'sean-carr', NULL, NULL),
    ('dan-herbert', 2014, NULL, 'Brian Boulanger', NULL),
    ('dan-herbert', 2014, 'ben-merritt', NULL, NULL),
    ('dan-herbert', 2014, 'tim-ocallahan', NULL, NULL),
    ('dan-herbert', 2013, 'stan-shuralyov', NULL, NULL),
    ('dan-herbert', 2012, 'carey-chappelle', NULL, NULL),
    ('dan-herbert', 2011, 'kathy-brouse', NULL, NULL),
    ('half-wheel', 2025, 'brenda-wiechers-maxwell', NULL, NULL),
    ('half-wheel', 2024, 'ryan-brown', NULL, NULL),
    ('half-wheel', 2023, 'tiago-varella-cid', NULL, NULL),
    ('half-wheel', 2022, 'tim-ocallahan', NULL, NULL),
    ('half-wheel', 2021, 'tim-ocallahan', NULL, NULL),
    ('half-wheel', 2019, 'larry-optis', NULL, NULL),
    ('half-wheel', 2018, 'tim-ocallahan', NULL, NULL),
    ('half-wheel', 2017, 'jerzy-dziadon', NULL, NULL),
    ('half-wheel', 2016, 'jerzy-dziadon', NULL, NULL),
    ('half-wheel', 2014, 'martin-lacelle', NULL, NULL),
    ('special-recognition', 2025, 'greg-cooper', NULL, NULL),
    ('special-recognition', 2024, 'jungah-hong', NULL, NULL),
    ('special-recognition', 2023, 'vaune-davis', NULL, NULL),
    ('special-recognition', 2022, 'jungah-hong', NULL, NULL),
    ('special-recognition', 2022, 'michael-henderson', NULL, NULL),
    ('special-recognition', 2021, 'ben-merritt', NULL, NULL),
    ('special-recognition', 2019, 'brenda-wiechers-maxwell', NULL, NULL),
    ('special-recognition', 2018, 'brenda-wiechers-maxwell', NULL, NULL),
    ('special-recognition', 2018, 'liz-overduin', NULL, NULL),
    ('special-recognition', 2017, 'david-thompson', NULL, NULL),
    ('special-recognition', 2016, 'guy-quesnel', NULL, NULL),
    ('special-recognition', 2014, 'terry-payne', NULL, NULL)
  ) AS w(award_slug, season, rider_slug, recipient_name, note);

  SELECT string_agg(DISTINCT w.award_slug, ', ') INTO v_missing
  FROM _banquet_winners w
  LEFT JOIN awards a ON a.slug = w.award_slug
  WHERE a.id IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Banquet awards: unknown award slug(s): %', v_missing;
  END IF;

  -- Rider slugs are prod data. On a fresh database (CI, a new local stack)
  -- none of them exist, so unresolved winners are skipped with a warning
  -- rather than aborting the migration. Production ran this with every slug
  -- resolved, so the skip never applies there.
  SELECT string_agg(DISTINCT w.rider_slug, ', ') INTO v_missing
  FROM _banquet_winners w
  LEFT JOIN riders r ON r.slug = w.rider_slug
  WHERE w.rider_slug IS NOT NULL AND r.id IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE WARNING 'Banquet awards: skipping winners with unknown rider slug(s): %', v_missing;
  END IF;

  INSERT INTO rider_awards (rider_id, award_id, season, recipient_name, note)
  SELECT r.id, a.id, w.season, w.recipient_name, w.note
  FROM _banquet_winners w
  JOIN awards a ON a.slug = w.award_slug
  LEFT JOIN riders r ON r.slug = w.rider_slug
  WHERE (w.rider_slug IS NULL OR r.id IS NOT NULL)
    AND NOT EXISTS (
    SELECT 1 FROM rider_awards ra
    WHERE ra.award_id = a.id
      AND ra.season = w.season
      AND (
        (w.rider_slug IS NOT NULL AND ra.rider_id = r.id)
        OR (w.rider_slug IS NULL AND ra.rider_id IS NULL AND ra.recipient_name = w.recipient_name)
      )
  );
END $$;
