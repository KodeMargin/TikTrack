-- =============================================================================
-- Migration 0005: Phase 1 Completion Fixes
-- 1. Task hierarchy self-referencing FK (F1-011)
-- 2. Private Storage buckets & scoped RLS (F1-015, F1-046, Section 12.4)
-- 3. Finance-safe billing summary view (Section 12.4)
-- 4. Notifications table & RLS (F1-048)
-- 5. Basic plan entitlements table (F1-006)
-- =============================================================================

-- 1. Task Hierarchy Self-Referencing Foreign Key (F1-011)
ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_parent_task
  FOREIGN KEY (parent_task_id, tenant_id, project_id)
  REFERENCES public.tasks(id, tenant_id, project_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task
  ON public.tasks (tenant_id, project_id, parent_task_id);

-- 2. Plan Entitlements (F1-006)
CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  plan_tier text PRIMARY KEY CHECK (plan_tier IN ('starter', 'team', 'agency', 'enterprise')),
  max_seats int NOT NULL,
  max_active_projects int NOT NULL,
  retention_days int NOT NULL,
  github_ide_enabled boolean NOT NULL DEFAULT false,
  client_portal_enabled boolean NOT NULL DEFAULT false,
  ai_assistance_available boolean NOT NULL DEFAULT false
);

INSERT INTO public.plan_entitlements (
  plan_tier, max_seats, max_active_projects, retention_days, github_ide_enabled, client_portal_enabled, ai_assistance_available
)
VALUES
  ('starter', 5, 3, 90, false, false, false),
  ('team', 25, 25, 365, true, false, true),
  ('agency', 100, 100, 730, true, true, true),
  ('enterprise', 10000, 10000, 2555, true, true, true)
ON CONFLICT (plan_tier) DO NOTHING;

ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_entitlements_select_authenticated ON public.plan_entitlements
  FOR SELECT TO authenticated
  USING (true);

-- 3. Notifications Table (F1-048)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (
    notification_type IN (
      'missing_timesheet',
      'clarification_requested',
      'clarification_replied',
      'timesheet_approved',
      'timesheet_adjusted',
      'dispute_opened',
      'invoice_locked'
    )
  ),
  title text NOT NULL,
  body text NOT NULL,
  target_entity text,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (tenant_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

CREATE POLICY notifications_update_own_read ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  )
  WITH CHECK (
    recipient_user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- 4. Finance-Safe Billing View (Section 12.4: Finance sees approved hours/rates, not raw workstation notes/telemetry)
CREATE OR REPLACE VIEW public.finance_approved_billing_v
WITH (security_invoker = true) AS
SELECT
  tl.id AS timesheet_line_id,
  tl.tenant_id,
  ts.project_id,
  p.code AS project_code,
  p.name AS project_name,
  p.client_name,
  ts.user_id AS developer_user_id,
  up.full_name AS developer_name,
  tl.task_id,
  tk.code AS task_code,
  tk.title AS task_title,
  tl.work_date,
  tl.approved_billable_minutes,
  tl.snapshot_hourly_rate,
  tl.snapshot_currency,
  tl.line_amount,
  tl.line_status,
  tl.is_locked
FROM public.timesheet_lines tl
JOIN public.timesheets ts
  ON ts.id = tl.timesheet_id AND ts.tenant_id = tl.tenant_id
JOIN public.projects p
  ON p.id = ts.project_id AND p.tenant_id = ts.tenant_id
JOIN public.tasks tk
  ON tk.id = tl.task_id AND tk.tenant_id = tl.tenant_id
JOIN public.user_profiles up
  ON up.id = ts.user_id
WHERE tl.line_status IN ('approved', 'adjusted_approved')
  AND public.user_has_tenant_role(tl.tenant_id, ARRAY['tenant_owner', 'finance', 'auditor']);

-- 5. Private Storage Buckets & Tenant-Scoped RLS (F1-015, F1-046, Section 12.4)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('task-attachments', 'task-attachments', false),
  ('invoice-exports', 'invoice-exports', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {tenant_id}/{project_id}/{filename}
CREATE POLICY storage_task_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND public.user_has_project_access(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );

CREATE POLICY storage_task_attachments_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND public.user_has_project_access(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid,
      ARRAY['manager', 'contributor']
    )
  );

CREATE POLICY storage_invoice_exports_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-exports'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.user_has_tenant_role(
      (storage.foldername(name))[1]::uuid,
      ARRAY['tenant_owner', 'finance', 'auditor']
    )
  );

