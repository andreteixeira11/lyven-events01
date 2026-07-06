-- RLS policies for event_seats and venue_seat_maps
-- Allows public read of seat maps and event seats; authenticated users can reserve/book.

ALTER TABLE venue_seat_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_seats ENABLE ROW LEVEL SECURITY;

-- venue_seat_maps: anyone can read the venue layout
CREATE POLICY "venue_seat_maps_read" ON venue_seat_maps
  FOR SELECT USING (true);

-- Allow service role / admin to insert/update (managed via service role key from app)
CREATE POLICY "venue_seat_maps_write" ON venue_seat_maps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- event_seats: anyone can read seat status for an event (needed to render the map)
CREATE POLICY "event_seats_read" ON event_seats
  FOR SELECT USING (true);

-- Authenticated users can reserve, release, and book seats
CREATE POLICY "event_seats_write" ON event_seats
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anonymous reads too (so unauthenticated browse works)
CREATE POLICY "event_seats_read_anon" ON event_seats
  FOR SELECT TO anon USING (true);

-- Allow inserts for initialization (authenticated or service role)
CREATE POLICY "event_seats_insert" ON event_seats
  FOR INSERT TO authenticated WITH CHECK (true);
