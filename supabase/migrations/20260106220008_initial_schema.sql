-- Randonneurs Ontario Database Schema
-- Initial migration

-- ============================================
-- 1. chapters
-- ============================================
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  founded_year INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. routes
-- ============================================
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  chapter_id UUID REFERENCES chapters(id),
  distance_km INT,
  collection TEXT,
  description TEXT,
  rwgps_id TEXT,
  cue_sheet_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_routes_chapter ON routes(chapter_id);
CREATE INDEX idx_routes_collection ON routes(collection);

-- ============================================
-- 3. events
-- ============================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  chapter_id UUID NOT NULL REFERENCES chapters(id),
  route_id UUID REFERENCES routes(id),
  name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('brevet', 'populaire', 'fleche', 'permanent')),
  distance_km INT NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME,
  start_location TEXT,
  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  external_register_url TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  season INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM event_date)) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(chapter_id, slug, event_date)
);

CREATE INDEX idx_events_chapter ON events(chapter_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_season ON events(season);
CREATE INDEX idx_events_type ON events(event_type);

-- ============================================
-- 4. riders
-- ============================================
CREATE TABLE riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  gender TEXT CHECK (gender IN ('M', 'F', 'X')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_riders_slug ON riders(slug);

-- ============================================
-- 5. registrations
-- ============================================
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id),
  registered_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  emergency_contact TEXT,
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled')),
  UNIQUE(event_id, rider_id)
);

CREATE INDEX idx_registrations_event ON registrations(event_id);
CREATE INDEX idx_registrations_rider ON registrations(rider_id);

-- ============================================
-- 6. results
-- ============================================
CREATE TABLE results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  rider_id UUID NOT NULL REFERENCES riders(id),
  finish_time INTERVAL,
  status TEXT DEFAULT 'finished' CHECK (status IN ('finished', 'dnf', 'dns', 'otl', 'dq')),
  note TEXT,
  team_name TEXT,
  season INT NOT NULL,
  distance_km INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, rider_id)
);

CREATE INDEX idx_results_event ON results(event_id);
CREATE INDEX idx_results_rider ON results(rider_id);
CREATE INDEX idx_results_season ON results(season);

-- ============================================
-- 7. awards
-- ============================================
CREATE TABLE awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  award_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 8. result_awards
-- ============================================
CREATE TABLE result_awards (
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  award_id UUID NOT NULL REFERENCES awards(id),
  PRIMARY KEY (result_id, award_id)
);

-- ============================================
-- 9. admins
-- ============================================
CREATE TABLE admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'chapter_admin')),
  chapter_id UUID REFERENCES chapters(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Seed data: chapters
-- ============================================
INSERT INTO chapters (slug, name, founded_year) VALUES
  ('toronto', 'Toronto', 1982),
  ('ottawa', 'Ottawa', 1999),
  ('simcoe', 'Simcoe-Muskoka', 2005),
  ('huron', 'Huron', 2010);

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_riders_updated_at BEFORE UPDATE ON riders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_results_updated_at BEFORE UPDATE ON results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_awards_updated_at BEFORE UPDATE ON awards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
