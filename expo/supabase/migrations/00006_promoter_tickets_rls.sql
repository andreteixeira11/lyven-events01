-- Allow event promoters to read tickets for their own events.
-- Without this, promoter analytics (revenue, buyers, per-type stats) returned
-- empty because tickets_select only allowed the buyer or admins.

CREATE POLICY "tickets_select_event_promoter"
  ON public.tickets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tickets.event_id
        AND e.promoter_id IN (
          SELECT pp.id FROM public.promoter_profiles pp
          WHERE pp.user_id = auth.uid()::text
        )
    )
  );
