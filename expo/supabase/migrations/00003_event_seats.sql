-- Lyven: Seat reservation system for venues with numbered seats
-- Enables seat selection for events at Teatro Baltazar Dias and similar venues

-- 20. venue_seat_maps
-- Defines the physical layout of a venue (independent of any specific event)
CREATE TABLE IF NOT EXISTS venue_seat_maps (
  id TEXT PRIMARY KEY,
  venue_name TEXT NOT NULL,
  -- JSON describing sections, rows, and seats geometry
  -- [{ id, name, rows: [{ id, label, seats: [{ id, label, x, y, status }] }] }]
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 21. event_seats
-- Per-event seat instances: each seat for each event with booking state
CREATE TABLE IF NOT EXISTS event_seats (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_map_id TEXT NOT NULL REFERENCES venue_seat_maps(id) ON DELETE CASCADE,
  -- e.g. "plateia-A-1" — composite key for lookups
  seat_label TEXT NOT NULL,
  -- e.g. "Plateia", "Balcão", "Camarote Central"
  section TEXT NOT NULL,
  -- e.g. "A", "B", "1"
  row_label TEXT NOT NULL,
  -- e.g. "1", "12"
  seat_number TEXT NOT NULL,
  -- numeric position for ordering
  sort_index INTEGER NOT NULL DEFAULT 0,
  -- 'available' | 'selected' | 'booked' | 'reserved' | 'blocked'
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','selected','booked','reserved','blocked')),
  -- optional ticket type association (e.g. Plateia, Balcão)
  ticket_type_id TEXT,
  -- user that holds a temporary reservation
  reserved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reserved_until TIMESTAMPTZ,
  -- user that completed the purchase
  booked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  booked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, seat_label)
);

CREATE INDEX IF NOT EXISTS idx_event_seats_event_id ON event_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_event_seats_status ON event_seats(status);
CREATE INDEX IF NOT EXISTS idx_event_seats_seat_label ON event_seats(seat_label);
CREATE INDEX IF NOT EXISTS idx_event_seats_reserved_by ON event_seats(reserved_by);
