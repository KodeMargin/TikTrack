-- =============================================================================
-- Migration 0010: Phase 3 Milestone 3.3 — Fair Dispute, Independent Escalation
-- & Partial Approval Workflow
-- Covers F3-030 through F3-035
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend disputes table for structured appeals & independent second review
-- -----------------------------------------------------------------------------

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS review_decision_id uuid REFERENCES public.review_decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_reviewer_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS requested_evidence_type text,
  ADD COLUMN IF NOT EXISTS resolution_summary text,
  ADD COLUMN IF NOT EXISTS adjusted_approved_minutes numeric(6,2),
  ADD COLUMN IF NOT EXISTS policy_version_id uuid,
  ADD COLUMN IF NOT EXISTS credit_invoice_id uuid REFERENCES public.invoice_drafts(id) ON DELETE SET NULL;

-- Replace status CHECK constraint to include 'escalated' (F3-033)
ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_status_check;
ALTER TABLE public.disputes
  ADD CONSTRAINT disputes_status_check CHECK (
    status IN (
      'open',
      'awaiting_developer',
      'awaiting_manager',
      'escalated',
      'resolved_accepted',
      'resolved_adjusted',
      'resolved_upheld'
    )
  );

-- Enforce independent second review (F3-033): escalated reviewer must differ from
-- the original assigned reviewer and the person who opened the dispute.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'disputes_independent_escalated_reviewer'
      AND conrelid = 'public.disputes'::regclass
  ) THEN
    ALTER TABLE public.disputes
      ADD CONSTRAINT disputes_independent_escalated_reviewer CHECK (
        escalated_reviewer_id IS NULL
        OR (
          escalated_reviewer_id IS DISTINCT FROM assigned_reviewer_id
          AND escalated_reviewer_id IS DISTINCT FROM opened_by_user_id
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_disputes_tenant_status
  ON public.disputes (tenant_id, status, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Extend dispute_messages for evidence attachments & before/after deltas
-- -----------------------------------------------------------------------------

ALTER TABLE public.dispute_messages
  ADD COLUMN IF NOT EXISTS attached_artifact_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'developer_appeal'
    CHECK (
      message_type IN (
        'clarification_request',
        'developer_appeal',
        'reviewer_note',
        'escalation',
        'resolution'
      )
    ),
  ADD COLUMN IF NOT EXISTS before_minutes numeric(6,2),
  ADD COLUMN IF NOT EXISTS after_minutes numeric(6,2);

-- -----------------------------------------------------------------------------
-- 3. RLS Policies for Dispute Updates & Message Appends
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'disputes' AND policyname = 'disputes_insert_scoped'
  ) THEN
    CREATE POLICY disputes_insert_scoped ON public.disputes
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_is_active_tenant_member(tenant_id)
        AND NOT public.user_has_tenant_role(tenant_id, ARRAY['finance', 'client_reviewer'])
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'disputes' AND policyname = 'disputes_update_scoped'
  ) THEN
    CREATE POLICY disputes_update_scoped ON public.disputes
      FOR UPDATE TO authenticated
      USING (
        public.user_is_active_tenant_member(tenant_id)
        AND (
          opened_by_user_id = (SELECT auth.uid())
          OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'auditor'])
        )
      )
      WITH CHECK (
        public.user_is_active_tenant_member(tenant_id)
        AND (
          opened_by_user_id = (SELECT auth.uid())
          OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'auditor'])
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'dispute_messages' AND policyname = 'dispute_messages_insert_scoped'
  ) THEN
    CREATE POLICY dispute_messages_insert_scoped ON public.dispute_messages
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_is_active_tenant_member(tenant_id)
        AND author_user_id = (SELECT auth.uid())
        AND NOT public.user_has_tenant_role(tenant_id, ARRAY['finance', 'client_reviewer'])
      );
  END IF;
END $$;

