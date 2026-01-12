UPDATE events
  SET status = 'submitted'
  WHERE status = 'completed'
    AND event_date < '2026-01-01';