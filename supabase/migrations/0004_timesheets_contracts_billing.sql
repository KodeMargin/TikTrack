-- =============================================================================
-- Migration 0004: Contracts, Effective-Dated Rates, Timesheets, Reviews & Invoices
-- Covers Phase 1 Milestone 1.4: F1-040 through F1-048
-- =============================================================================

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  developer_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  rounding_rule text NOT NULL DEFAULT 'none' CHECK (rounding_rule IN ('none', 'nearest_5m', 'nearest_6m', 'nearest_15m')),
  weekly_cap_minutes int NOT NULL DEFAULT 2400 CHECK (weekly_cap_minutes > 0),
  paid_break_minutes_per_day int NOT NULL DEFAULT 15 CHECK (paid_break_minutes_per_day >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, tenant_id) REFERENCES public.projects(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (id, tenant_id)
);

-- Effective-Dated Rate Versions with GiST Non-Overlapping Date Constraint (F1-044)
CREATE TABLE public.contract_rate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  version_label text NOT NULL,
  effective_period daterange NOT NULL,
  hourly_rate numeric(10,2) NOT NULL CHECK (hourly_rate >= 0),
  overtime_hourly_rate numeric(10,2) CHECK (overtime_hourly_rate IS NULL OR overtime_hourly_rate >= 0),
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (contract_id, tenant_id) REFERENCES public.contracts(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (id, tenant_id),
  CONSTRAINT no_overlapping_rate_versions_per_contract
    EXCLUDE USING gist (
      tenant_id WITH =,
      contract_id WITH =,
      effective_period WITH &&
    )
);

CREATE INDEX idx_contract_rate_versions_lookup
  ON public.contract_rate_versions (tenant_id, contract_id);

-- -----------------------------------------------------------------------------
-- Timesheets & Five-Time-Concept Lines (F1-040, F1-041)
-- -----------------------------------------------------------------------------

CREATE TABLE public.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'submitted',
      'needs_clarification',
      'partially_approved',
      'approved',
      'locked',
      'disputed'
    )
  ),
  developer_summary_note text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  approved_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, tenant_id) REFERENCES public.projects(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (contract_id, tenant_id) REFERENCES public.contracts(id, tenant_id) ON DELETE RESTRICT,
  CHECK (period_end >= period_start),
  UNIQUE (tenant_id, user_id, project_id, period_start, period_end),
  UNIQUE (id, tenant_id)
);

CREATE TABLE public.timesheet_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  timesheet_id uuid NOT NULL,
  segment_id uuid REFERENCES public.time_segments(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL,
  work_date date NOT NULL,
  work_mode text NOT NULL,
  provenance text NOT NULL,
  -- Five Separate Time Concepts (F1-041)
  elapsed_minutes numeric(6,2) NOT NULL CHECK (elapsed_minutes >= 0),
  claimed_minutes numeric(6,2) NOT NULL CHECK (claimed_minutes >= 0),
  observed_minutes numeric(6,2) NOT NULL DEFAULT 0 CHECK (observed_minutes >= 0),
  supported_minutes numeric(6,2) NOT NULL DEFAULT 0 CHECK (supported_minutes >= 0),
  approved_billable_minutes numeric(6,2) NOT NULL DEFAULT 0 CHECK (approved_billable_minutes >= 0),
  -- Historical Effective-Dated Rate Snapshot (Acceptance Scenario 6)
  applied_rate_version_id uuid NOT NULL,
  snapshot_hourly_rate numeric(10,2) NOT NULL CHECK (snapshot_hourly_rate >= 0),
  snapshot_currency text NOT NULL DEFAULT 'USD',
  line_amount numeric(12,2) GENERATED ALWAYS AS (
    round((approved_billable_minutes / 60.0) * snapshot_hourly_rate, 2)
  ) STORED,
  line_status text NOT NULL DEFAULT 'pending_review' CHECK (
    line_status IN (
      'pending_review',
      'needs_clarification',
      'clarification_provided',
      'approved',
      'adjusted_approved',
      'rejected',
      'disputed'
    )
  ),
  developer_note text NOT NULL DEFAULT '',
  reviewer_comment text,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (timesheet_id, tenant_id) REFERENCES public.timesheets(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (applied_rate_version_id, tenant_id) REFERENCES public.contract_rate_versions(id, tenant_id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id)
);

CREATE INDEX idx_timesheet_lines_timesheet
  ON public.timesheet_lines (tenant_id, timesheet_id, work_date);

-- -----------------------------------------------------------------------------
-- Immutable Manager Review Decisions & Dispute Conversations (F1-042, F1-043)
-- -----------------------------------------------------------------------------

CREATE TABLE public.review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  timesheet_id uuid NOT NULL,
  timesheet_line_id uuid NOT NULL,
  reviewer_user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  decision_type text NOT NULL CHECK (
    decision_type IN ('approve', 'ask_clarification', 'adjust_with_reason', 'reject', 'dispute')
  ),
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 5),
  previous_approved_minutes numeric(6,2) NOT NULL,
  new_approved_minutes numeric(6,2) NOT NULL,
  policy_version_id uuid,
  decided_at_utc timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (timesheet_id, tenant_id) REFERENCES public.timesheets(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (timesheet_line_id, tenant_id) REFERENCES public.timesheet_lines(id, tenant_id) ON DELETE RESTRICT
);

REVOKE UPDATE, DELETE ON public.review_decisions FROM PUBLIC, authenticated;

CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  timesheet_id uuid NOT NULL,
  timesheet_line_id uuid NOT NULL,
  opened_by_user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'awaiting_developer', 'awaiting_manager', 'resolved_accepted', 'resolved_adjusted', 'resolved_upheld')
  ),
  disputed_minutes numeric(6,2) NOT NULL CHECK (disputed_minutes >= 0),
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 10),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (timesheet_id, tenant_id) REFERENCES public.timesheets(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (timesheet_line_id, tenant_id) REFERENCES public.timesheet_lines(id, tenant_id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id)
);

CREATE TABLE public.dispute_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  dispute_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  message_markdown text NOT NULL CHECK (char_length(trim(message_markdown)) >= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (dispute_id, tenant_id) REFERENCES public.disputes(id, tenant_id) ON DELETE CASCADE
);

REVOKE UPDATE, DELETE ON public.dispute_messages FROM PUBLIC, authenticated;

-- -----------------------------------------------------------------------------
-- Invoice Drafts & Immutable Locked Invoice Lines (F1-045, F1-046, F1-047)
-- -----------------------------------------------------------------------------

CREATE TABLE public.invoice_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  timesheet_id uuid NOT NULL,
  invoice_number text NOT NULL,
  client_name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  subtotal_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized_locked', 'credited_adjusted')),
  reference_credit_for_invoice_id uuid REFERENCES public.invoice_drafts(id),
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, tenant_id) REFERENCES public.projects(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (timesheet_id, tenant_id) REFERENCES public.timesheets(id, tenant_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, invoice_number),
  UNIQUE (id, tenant_id)
);

CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  timesheet_line_id uuid NOT NULL,
  description text NOT NULL,
  work_date date NOT NULL,
  approved_minutes numeric(6,2) NOT NULL,
  approved_hours numeric(8,2) GENERATED ALWAYS AS (round(approved_minutes / 60.0, 2)) STORED,
  snapshot_hourly_rate numeric(10,2) NOT NULL,
  line_total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (invoice_id, tenant_id) REFERENCES public.invoice_drafts(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (timesheet_line_id, tenant_id) REFERENCES public.timesheet_lines(id, tenant_id) ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- Approval Locking Trigger (F1-047: Closed billing periods immutable)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_locked_timesheet_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.is_locked = true AND (
    NEW.approved_billable_minutes <> OLD.approved_billable_minutes
    OR NEW.snapshot_hourly_rate <> OLD.snapshot_hourly_rate
    OR NEW.claimed_minutes <> OLD.claimed_minutes
  ) THEN
    RAISE EXCEPTION 'Locked timesheet line (%) cannot be mutated in place. Issue a credit/adjustment line instead (F1-047).', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_locked_timesheet_line_mutation
  BEFORE UPDATE ON public.timesheet_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_timesheet_line_mutation();

-- -----------------------------------------------------------------------------
-- Enable RLS & Policies for Commercial & Review Tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_rate_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select_scoped ON public.contracts
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      developer_user_id = (SELECT auth.uid())
      OR developer_user_id IS NULL
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance', 'project_manager', 'auditor'])
    )
  );

CREATE POLICY contract_rate_versions_select_scoped ON public.contract_rate_versions
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY timesheets_select_scoped ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance', 'auditor'])
      OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
      OR (
        status IN ('approved', 'locked')
        AND public.user_has_project_access(tenant_id, project_id, ARRAY['client_reviewer'])
      )
    )
  );

CREATE POLICY timesheet_lines_select_scoped ON public.timesheet_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.timesheets ts
      WHERE ts.id = public.timesheet_lines.timesheet_id
        AND ts.tenant_id = public.timesheet_lines.tenant_id
    )
  );

CREATE POLICY review_decisions_select_scoped ON public.review_decisions
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY disputes_select_scoped ON public.disputes
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY dispute_messages_select_scoped ON public.dispute_messages
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY invoice_drafts_select_scoped ON public.invoice_drafts
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance', 'project_manager', 'auditor'])
      OR (
        status = 'finalized_locked'
        AND public.user_has_project_access(tenant_id, project_id, ARRAY['client_reviewer'])
      )
    )
  );

CREATE POLICY invoice_lines_select_scoped ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoice_drafts inv
      WHERE inv.id = public.invoice_lines.invoice_id
        AND inv.tenant_id = public.invoice_lines.tenant_id
    )
  );

