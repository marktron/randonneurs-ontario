-- Digital brevet card: per-event controls and rider check-ins.
-- See docs/digital-brevet-card.md.
--
-- Access model: riders reach these tables only through server actions using
-- the service-role client (capability-token flows, same as registration
-- management / result submission). The anon role gets no access at all —
-- RLS is enabled with admin-only policies, and blanket grants are revoked.

-- =============================================
-- Section 1: event_controls
-- =============================================
CREATE TABLE event_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  distance_km NUMERIC(6,1) NOT NULL CHECK (distance_km >= 0),
  -- Nullable coordinates: a control without a verified location supports
  -- manual check-in only. Open/close times are never stored; they are
  -- computed from distance_km + the event start (lib/brmTimes.ts).
  lat DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  -- Generous default while RWGPS control coordinates remain unaudited.
  radius_m INTEGER NOT NULL DEFAULT 500 CHECK (radius_m > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, position)
);

CREATE INDEX idx_event_controls_event ON event_controls(event_id);

CREATE TRIGGER set_event_controls_updated_at
  BEFORE UPDATE ON event_controls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Section 2: control_checkins
-- =============================================
CREATE TABLE control_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id UUID NOT NULL REFERENCES event_controls(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  -- Device clock at tap time (may predate received_at when synced from the
  -- offline outbox).
  checked_in_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL CHECK (method IN ('gps', 'manual', 'admin')),
  lat DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  accuracy_m NUMERIC CHECK (accuracy_m >= 0),
  distance_to_control_m NUMERIC CHECK (distance_to_control_m >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One check-in per rider per control; doubles as the idempotency key for
  -- offline-outbox retries.
  UNIQUE (registration_id, control_id)
);

CREATE INDEX idx_control_checkins_control ON control_checkins(control_id);
CREATE INDEX idx_control_checkins_registration ON control_checkins(registration_id);

CREATE TRIGGER set_control_checkins_updated_at
  BEFORE UPDATE ON control_checkins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Section 3: RLS + grants (no anon access)
-- =============================================
ALTER TABLE event_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_controls_select_admin" ON event_controls
  FOR SELECT USING (is_admin());

CREATE POLICY "event_controls_insert_admin" ON event_controls
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "event_controls_update_admin" ON event_controls
  FOR UPDATE USING (is_admin());

CREATE POLICY "event_controls_delete_admin" ON event_controls
  FOR DELETE USING (is_admin());

CREATE POLICY "control_checkins_select_admin" ON control_checkins
  FOR SELECT USING (is_admin());

CREATE POLICY "control_checkins_insert_admin" ON control_checkins
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "control_checkins_update_admin" ON control_checkins
  FOR UPDATE USING (is_admin());

CREATE POLICY "control_checkins_delete_admin" ON control_checkins
  FOR DELETE USING (is_admin());

-- Belt and suspenders: even with RLS, keep the anon role's default grants
-- off these tables entirely (they carry rider location data).
REVOKE ALL ON event_controls FROM anon;
REVOKE ALL ON control_checkins FROM anon;
