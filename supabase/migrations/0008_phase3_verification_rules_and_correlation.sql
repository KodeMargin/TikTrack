-- =============================================================================
-- Migration 0008: Phase 3 Milestone 3.1 - Versioned Verification Rules Engine
-- & Evidence Correlation Graph
-- Covers F3-001 through F3-010 and Rules R-01 through R-08
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Versioned Verification Rule Sets (F3-001, F3-007)
--    Tenant-configurable rule sets with effective dates; historical segments
--    retain the rule_set_id under which they were evaluated (no silent retroactive
--    rewrites).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.verification_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_number int NOT NULL CHECK (version_number >= 1),
  version_label text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'superseded')),
  rules_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  simulation_summary jsonb,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version_number),
  UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_verification_rule_sets_tenant_effective
  ON public.verification_rule_sets (tenant_id, status, effective_from DESC);

-- -----------------------------------------------------------------------------
-- 2. Segment Rule Evaluations (F3-002, F3-005, F3-006, F3-010, R-01..R-08)
--    Records deterministic rule evaluations per canonical time segment.
--    Never stores automatic "fraud" labels or automated pay deductions.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.segment_rule_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  time_segment_id uuid NOT NULL REFERENCES public.time_segments(id) ON DELETE CASCADE,
  rule_set_id uuid NOT NULL,
  rule_code text NOT NULL CHECK (
    rule_code IN ('R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07', 'R-08')
  ),
  triggered boolean NOT NULL DEFAULT true,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'clarification', 'warning')),
  title text NOT NULL,
  trigger_description text NOT NULL,
  suggested_action text NOT NULL,
  prohibited_inference text NOT NULL,
  explanation_prompt text,
  developer_response text,
  resolved_at_utc timestamptz,
  evaluated_at_utc timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (rule_set_id, tenant_id)
    REFERENCES public.verification_rule_sets(id, tenant_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, time_segment_id, rule_set_id, rule_code)
);

CREATE INDEX IF NOT EXISTS idx_segment_rule_evals_segment
  ON public.segment_rule_evaluations (tenant_id, time_segment_id, evaluated_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_segment_rule_evals_unresolved
  ON public.segment_rule_evaluations (tenant_id, rule_code, severity)
  WHERE resolved_at_utc IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Evidence Correlation Graph Edges (F3-004, F3-008, F3-009)
--    Explicit directed edges: Session -> Segment -> Task -> IDE Event -> Artifact
--    -> Annotation -> Review/Outcome.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.evidence_correlation_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  source_node_type text NOT NULL CHECK (
    source_node_type IN ('session', 'segment', 'task', 'ide_event', 'artifact', 'annotation', 'review')
  ),
  source_node_id text NOT NULL,
  target_node_type text NOT NULL CHECK (
    target_node_type IN ('session', 'segment', 'task', 'ide_event', 'artifact', 'annotation', 'review')
  ),
  target_node_id text NOT NULL,
  edge_type text NOT NULL CHECK (
    edge_type IN (
      'attributed_to',
      'corroborated_by',
      'contextualized_by',
      'retrospective_outcome_of',
      'variance_flagged',
      'outcome_associated'
    )
  ),
  confidence numeric(3, 2) NOT NULL DEFAULT 0.90 CHECK (confidence >= 0 AND confidence <= 1),
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, source_node_type, source_node_id, target_node_type, target_node_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_evidence_correlation_edges_project
  ON public.evidence_correlation_edges (tenant_id, project_id, edge_type);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.verification_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_rule_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_correlation_edges ENABLE ROW LEVEL SECURITY;

-- Rule sets: Active tenant members can read active/superseded rules; Owners/Managers manage
CREATE POLICY verification_rule_sets_select ON public.verification_rule_sets
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY verification_rule_sets_manage ON public.verification_rule_sets
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager']));

-- Segment rule evaluations: Developer sees own segments; Managers/Owners/Auditors see tenant;
-- Finance and Client Reviewer roles are excluded from raw segment-level evaluations.
CREATE POLICY segment_rule_evaluations_select ON public.segment_rule_evaluations
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'auditor'])
    OR EXISTS (
      SELECT 1
      FROM public.time_segments ts
      WHERE ts.id = segment_rule_evaluations.time_segment_id
        AND ts.tenant_id = segment_rule_evaluations.tenant_id
        AND ts.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY segment_rule_evaluations_write ON public.segment_rule_evaluations
  FOR ALL TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager'])
    OR EXISTS (
      SELECT 1
      FROM public.time_segments ts
      WHERE ts.id = segment_rule_evaluations.time_segment_id
        AND ts.tenant_id = segment_rule_evaluations.tenant_id
        AND ts.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager'])
    OR EXISTS (
      SELECT 1
      FROM public.time_segments ts
      WHERE ts.id = segment_rule_evaluations.time_segment_id
        AND ts.tenant_id = segment_rule_evaluations.tenant_id
        AND ts.user_id = (SELECT auth.uid())
    )
  );

-- Evidence correlation edges: Project contributors/managers & auditors can inspect;
-- Finance and Client Reviewer excluded from raw correlation telemetry.
CREATE POLICY evidence_correlation_edges_select ON public.evidence_correlation_edges
  FOR SELECT TO authenticated
  USING (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE POLICY evidence_correlation_edges_write ON public.evidence_correlation_edges
  FOR ALL TO authenticated
  USING (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner'])
  )
  WITH CHECK (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner'])
  );

