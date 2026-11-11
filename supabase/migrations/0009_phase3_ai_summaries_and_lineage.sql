-- =============================================================================
-- Migration 0009: Phase 3 Milestone 3.2 — Guardrailed AI Assistance & Lineage
-- Covers F3-020 through F3-027 and Section 6.5 AI/ML Guardrails
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AI Generations & Source Traceability Ledger (F3-020..F3-027)
--    - Enforces tenant AI opt-out gate (F3-027): when tenants.ai_enabled = false,
--      LLM generation_mode = 'ai_guardrailed' is blocked at DB trigger level.
--    - Enforces D-003 prohibited surveillance key check on sanitized_prompt_payload.
--    - Enforces developer/human confirmation before sharing (status workflow).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (
    target_type IN (
      'daily_summary',
      'reviewer_digest',
      'gap_explanation',
      'task_mapping',
      'debug_investigation',
      'pattern_cluster'
    )
  ),
  target_id text NOT NULL,
  generation_mode text NOT NULL DEFAULT 'ai_guardrailed'
    CHECK (generation_mode IN ('ai_guardrailed', 'deterministic_template')),
  model_id text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'v1.0',
  sanitized_prompt_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  cited_event_ids text[] NOT NULL DEFAULT '{}',
  cited_artifact_ids text[] NOT NULL DEFAULT '{}',
  draft_markdown text NOT NULL,
  human_approved_markdown text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'edited_approved', 'discarded')),
  tokens_used int NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  approved_by_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_prohibited_ai_payload
    CHECK (NOT public.jsonb_contains_prohibited_surveillance_keys(sanitized_prompt_payload)),
  CONSTRAINT ai_citations_non_empty_for_llm
    CHECK (
      generation_mode = 'deterministic_template'
      OR cardinality(cited_event_ids) + cardinality(cited_artifact_ids) > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_generations_tenant_target
  ON public.ai_generations (tenant_id, target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_generations_user_status
  ON public.ai_generations (tenant_id, user_id, status, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Strict Tenant AI Opt-Out DB Gate (F3-027)
--    Prevents inserting 'ai_guardrailed' LLM generations when tenants.ai_enabled
--    is false. Deterministic templates ('deterministic_template', 0 tokens)
--    continue to function seamlessly.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_tenant_ai_opt_out_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ai_enabled boolean;
BEGIN
  IF NEW.generation_mode = 'ai_guardrailed' THEN
    SELECT ai_enabled INTO v_ai_enabled
    FROM public.tenants
    WHERE id = NEW.tenant_id;

    IF COALESCE(v_ai_enabled, false) = false THEN
      RAISE EXCEPTION 'Tenant (%) has AI assistance disabled (F3-027). Use deterministic_template mode instead.', NEW.tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_ai_opt_out_gate ON public.ai_generations;
CREATE TRIGGER trg_enforce_tenant_ai_opt_out_gate
  BEFORE INSERT ON public.ai_generations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tenant_ai_opt_out_gate();

-- -----------------------------------------------------------------------------
-- 3. Row Level Security (RLS) Policies for AI Generations
--    - Daily summaries and debug drafts remain private to the author until
--      status = 'edited_approved' (F3-020: developer confirms before sharing).
--    - Finance and Client Reviewer roles never see AI workstation drafts.
-- -----------------------------------------------------------------------------

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_generations_select_scoped ON public.ai_generations
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['finance', 'client_reviewer'])
    AND (
      user_id = (SELECT auth.uid())
      OR (
        status = 'edited_approved'
        AND public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'auditor'])
      )
      OR (
        target_type IN ('reviewer_digest', 'pattern_cluster', 'gap_explanation')
        AND public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'auditor'])
      )
    )
  );

CREATE POLICY ai_generations_insert_scoped ON public.ai_generations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['finance', 'client_reviewer'])
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager'])
    )
  );

CREATE POLICY ai_generations_update_confirm ON public.ai_generations
  FOR UPDATE TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager'])
    )
  )
  WITH CHECK (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager'])
    )
  );

