-- =============================================================================
-- Migration 0002: Projects, Task Hierarchy, Assignments, Work Modes & Storage
-- Covers Phase 1 Milestone 1.2: F1-010 through F1-016
-- =============================================================================

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9-]+$'),
  name text NOT NULL,
  description text,
  client_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  evidence_policy_override jsonb,
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (id, tenant_id)
);

CREATE INDEX idx_projects_tenant_status
  ON public.projects (tenant_id, status);

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  project_role text NOT NULL CHECK (project_role IN ('manager', 'contributor', 'viewer', 'client_reviewer')),
  added_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, tenant_id) REFERENCES public.projects(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, project_id, user_id)
);

CREATE INDEX idx_project_members_lookup
  ON public.project_members (tenant_id, project_id, user_id, project_role);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  parent_task_id uuid,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  acceptance_criteria text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'active', 'review', 'done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  estimate_minutes int NOT NULL DEFAULT 120 CHECK (estimate_minutes >= 0),
  is_billable boolean NOT NULL DEFAULT true,
  default_work_mode text NOT NULL DEFAULT 'coding' CHECK (
    default_work_mode IN (
      'coding',
      'debugging',
      'thinking',
      'research',
      'testing',
      'review',
      'meeting',
      'design'
    )
  ),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, tenant_id) REFERENCES public.projects(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, code),
  UNIQUE (id, tenant_id, project_id)
);

CREATE INDEX idx_tasks_tenant_project_status
  ON public.tasks (tenant_id, project_id, status);

CREATE TABLE public.task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.user_profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, tenant_id, project_id) REFERENCES public.tasks(id, tenant_id, project_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, task_id, user_id)
);

CREATE INDEX idx_task_assignments_user
  ON public.task_assignments (tenant_id, user_id, task_id);

CREATE TABLE public.task_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  content_markdown text NOT NULL,
  attachment_paths text[] NOT NULL DEFAULT '{}',
  external_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, tenant_id, project_id) REFERENCES public.tasks(id, tenant_id, project_id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- Project-Scoped Authorization Helper Functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_has_project_access(
  target_tenant_id uuid,
  target_project_id uuid,
  allowed_project_roles text[] DEFAULT ARRAY['manager', 'contributor', 'viewer', 'client_reviewer']
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    public.user_is_active_tenant_member(target_tenant_id)
    AND (
      public.user_has_tenant_role(target_tenant_id, ARRAY['tenant_owner', 'finance', 'auditor'])
      OR EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.tenant_id = target_tenant_id
          AND pm.project_id = target_project_id
          AND pm.user_id = (SELECT auth.uid())
          AND pm.project_role = ANY(allowed_project_roles)
      )
    );
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS & Policies for Projects & Tasks
-- -----------------------------------------------------------------------------

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_scoped ON public.projects
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, id));

CREATE POLICY projects_manage_owner_or_pm ON public.projects
  FOR ALL TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager'])
  )
  WITH CHECK (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager'])
  );

CREATE POLICY project_members_select_scoped ON public.project_members
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

CREATE POLICY project_members_manage_pm ON public.project_members
  FOR ALL TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner'])
    OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
  )
  WITH CHECK (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner'])
    OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
  );

CREATE POLICY tasks_select_scoped ON public.tasks
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

CREATE POLICY tasks_manage_pm_or_contributor ON public.tasks
  FOR ALL TO authenticated
  USING (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
  )
  WITH CHECK (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
  );

CREATE POLICY task_assignments_select_scoped ON public.task_assignments
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

CREATE POLICY task_assignments_manage_pm ON public.task_assignments
  FOR ALL TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner'])
    OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
  )
  WITH CHECK (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner'])
    OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
  );

CREATE POLICY task_notes_select_scoped ON public.task_notes
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

CREATE POLICY task_notes_insert_contributor ON public.task_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
  );

