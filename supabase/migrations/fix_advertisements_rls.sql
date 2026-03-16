-- Fix advertisements RLS: Allow all authenticated users to see active ads
-- Normal users need to see active ads on the home page, search, and event detail pages

-- Drop existing select policies
DROP POLICY IF EXISTS "advertisements_select_own_promoter" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_select" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_select_active" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_select_anon" ON public.advertisements;

-- All authenticated users can see active ads; promoters can see their own (active or not); admins see all
CREATE POLICY "advertisements_select" ON public.advertisements FOR SELECT TO authenticated
  USING (
    is_active = true
    OR promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );

-- Anon users can also see active ads
CREATE POLICY "advertisements_select_anon" ON public.advertisements FOR SELECT TO anon
  USING (is_active = true);
