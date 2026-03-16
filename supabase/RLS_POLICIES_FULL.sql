-- =============================================================================
-- RLS: Enable Row Level Security with Admin access
-- Run this entire script in Supabase Dashboard → SQL Editor → New query
-- Safe to re-run (drops existing policies first).
-- Admin users (user_type = 'admin') can access all data.
-- Uses is_admin() SECURITY DEFINER function to avoid infinite recursion.
-- =============================================================================

-- 0. Helper function: checks admin without triggering RLS on users table
CREATE OR REPLACE FUNCTION public.is_admin(check_uid text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = check_uid AND user_type = 'admin'
  );
$$;

-- 1. users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_select" ON public.users FOR SELECT TO authenticated
  USING (
    id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "users_update" ON public.users FOR UPDATE TO authenticated
  USING (
    id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 2. promoters
ALTER TABLE public.promoters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promoters_select_own" ON public.promoters;
DROP POLICY IF EXISTS "promoters_select" ON public.promoters;
DROP POLICY IF EXISTS "promoters_insert" ON public.promoters;
DROP POLICY IF EXISTS "promoters_update" ON public.promoters;
DROP POLICY IF EXISTS "promoters_delete" ON public.promoters;
CREATE POLICY "promoters_select" ON public.promoters FOR SELECT TO authenticated USING (true);
CREATE POLICY "promoters_insert" ON public.promoters FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()::text));
CREATE POLICY "promoters_update" ON public.promoters FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()::text));
CREATE POLICY "promoters_delete" ON public.promoters FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()::text));

-- 3. promoter_profiles
ALTER TABLE public.promoter_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promoter_profiles_select_own" ON public.promoter_profiles;
DROP POLICY IF EXISTS "promoter_profiles_update_own" ON public.promoter_profiles;
DROP POLICY IF EXISTS "promoter_profiles_select" ON public.promoter_profiles;
DROP POLICY IF EXISTS "promoter_profiles_update" ON public.promoter_profiles;
DROP POLICY IF EXISTS "promoter_profiles_delete" ON public.promoter_profiles;
DROP POLICY IF EXISTS "promoter_profiles_insert" ON public.promoter_profiles;
CREATE POLICY "promoter_profiles_select" ON public.promoter_profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "promoter_profiles_update" ON public.promoter_profiles FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "promoter_profiles_delete" ON public.promoter_profiles FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "promoter_profiles_insert" ON public.promoter_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

-- 4. promoter_auth
ALTER TABLE public.promoter_auth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promoter_auth_select_own" ON public.promoter_auth;
CREATE POLICY "promoter_auth_select_own" ON public.promoter_auth FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 5. events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_select_own_promoter" ON public.events;
DROP POLICY IF EXISTS "events_select" ON public.events;
DROP POLICY IF EXISTS "events_update" ON public.events;
DROP POLICY IF EXISTS "events_delete" ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
CREATE POLICY "events_select" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "events_update" ON public.events FOR UPDATE TO authenticated
  USING (
    promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "events_delete" ON public.events FOR DELETE TO authenticated
  USING (
    promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "events_insert" ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );

-- 6. tickets
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tickets_select_own" ON public.tickets;
DROP POLICY IF EXISTS "tickets_select" ON public.tickets;
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 7. advertisements
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advertisements_select_own_promoter" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_select" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_select_active" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_select_anon" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_update" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_delete" ON public.advertisements;
DROP POLICY IF EXISTS "advertisements_insert" ON public.advertisements;
-- All authenticated users can see active ads; promoters can see their own; admins see all
CREATE POLICY "advertisements_select" ON public.advertisements FOR SELECT TO authenticated
  USING (
    is_active = true
    OR promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );
-- Anon users can also see active ads
CREATE POLICY "advertisements_select_anon" ON public.advertisements FOR SELECT TO anon
  USING (is_active = true);
CREATE POLICY "advertisements_update" ON public.advertisements FOR UPDATE TO authenticated
  USING (
    promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "advertisements_delete" ON public.advertisements FOR DELETE TO authenticated
  USING (
    promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "advertisements_insert" ON public.advertisements FOR INSERT TO authenticated
  WITH CHECK (
    promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );

-- 8. following
ALTER TABLE public.following ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "following_select_own" ON public.following;
DROP POLICY IF EXISTS "following_select" ON public.following;
CREATE POLICY "following_select" ON public.following FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 9. event_statistics
ALTER TABLE public.event_statistics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_statistics_select_own_events" ON public.event_statistics;
DROP POLICY IF EXISTS "event_statistics_select" ON public.event_statistics;
CREATE POLICY "event_statistics_select" ON public.event_statistics FOR SELECT TO authenticated
  USING (
    event_id IN (SELECT e.id FROM public.events e WHERE e.promoter_id IN (SELECT id FROM public.promoter_profiles WHERE user_id = auth.uid()::text))
    OR public.is_admin(auth.uid()::text)
  );

-- 10. push_tokens
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_tokens_select_own" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_select" ON public.push_tokens;
CREATE POLICY "push_tokens_select" ON public.push_tokens FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 11. notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 12. verification_codes (service_role only)
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- 13. payment_methods
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_methods_select_own" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_select" ON public.payment_methods;
CREATE POLICY "payment_methods_select" ON public.payment_methods FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 14. event_views
ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_views_select_own" ON public.event_views;
DROP POLICY IF EXISTS "event_views_select" ON public.event_views;
CREATE POLICY "event_views_select" ON public.event_views FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 15. affiliates
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "affiliates_select_own" ON public.affiliates;
DROP POLICY IF EXISTS "affiliates_select" ON public.affiliates;
CREATE POLICY "affiliates_select" ON public.affiliates FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 16. affiliate_sales
ALTER TABLE public.affiliate_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "affiliate_sales_select_own" ON public.affiliate_sales;
DROP POLICY IF EXISTS "affiliate_sales_select" ON public.affiliate_sales;
CREATE POLICY "affiliate_sales_select" ON public.affiliate_sales FOR SELECT TO authenticated
  USING (
    affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()::text)
    OR public.is_admin(auth.uid()::text)
  );

-- 17. event_bundles (service_role only)
ALTER TABLE public.event_bundles ENABLE ROW LEVEL SECURITY;

-- 18. price_alerts
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "price_alerts_select_own" ON public.price_alerts;
DROP POLICY IF EXISTS "price_alerts_select" ON public.price_alerts;
CREATE POLICY "price_alerts_select" ON public.price_alerts FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );

-- 19. identity_verifications
ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "identity_verifications_select_own" ON public.identity_verifications;
DROP POLICY IF EXISTS "identity_verifications_select" ON public.identity_verifications;
CREATE POLICY "identity_verifications_select" ON public.identity_verifications FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.is_admin(auth.uid()::text)
  );
