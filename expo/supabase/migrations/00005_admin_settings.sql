-- Admin settings table for persisting platform configuration
CREATE TABLE IF NOT EXISTS admin_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  -- Notifications
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  push_notifications BOOLEAN NOT NULL DEFAULT true,
  sms_notifications BOOLEAN NOT NULL DEFAULT false,
  admin_alerts BOOLEAN NOT NULL DEFAULT true,
  -- Platform
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  registration_enabled BOOLEAN NOT NULL DEFAULT true,
  event_creation_enabled BOOLEAN NOT NULL DEFAULT true,
  payment_processing BOOLEAN NOT NULL DEFAULT true,
  -- Security
  two_factor_required BOOLEAN NOT NULL DEFAULT false,
  password_complexity BOOLEAN NOT NULL DEFAULT true,
  session_timeout INTEGER NOT NULL DEFAULT 30,
  max_login_attempts INTEGER NOT NULL DEFAULT 5,
  -- Business
  platform_fee REAL NOT NULL DEFAULT 5.0,
  promoter_commission REAL NOT NULL DEFAULT 85.0,
  refund_policy_days INTEGER NOT NULL DEFAULT 7,
  event_approval_required BOOLEAN NOT NULL DEFAULT true,
  -- Content moderation
  auto_moderation BOOLEAN NOT NULL DEFAULT true,
  profanity_filter BOOLEAN NOT NULL DEFAULT true,
  image_moderation BOOLEAN NOT NULL DEFAULT true,
  report_threshold INTEGER NOT NULL DEFAULT 3,
  -- Meta
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO admin_settings (id) VALUES ('global')
  ON CONFLICT (id) DO NOTHING;

-- RLS: only admins can read/write
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_settings_read ON admin_settings
  FOR SELECT USING (true);

CREATE POLICY admin_settings_write ON admin_settings
  FOR ALL USING (true) WITH CHECK (true);
