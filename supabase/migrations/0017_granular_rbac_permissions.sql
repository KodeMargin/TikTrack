-- =============================================================================
-- Migration 0017: Granular RBAC - Permission Catalog, Roles, Role Permissions,
-- Tenant Owner Permission Policy (Super Admin governed) & Member Permission Grants
--
-- Idempotent: every statement uses IF NOT EXISTS so it is safe to re-run.
-- The application also executes this file automatically on first start
-- (see prisma/seeds/permissions.seed.ts) before seeding the permission catalog.
-- NOTE: keep statements free of DO-blocks / functions - the runtime splits on ';'.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.permission_modules (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  key text PRIMARY KEY,
  module_id text NOT NULL REFERENCES public.permission_modules(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_super_admin_only boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_module_sort
  ON public.permissions (module_id, sort_order);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system_role boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant ON public.roles (tenant_id);

-- System roles have tenant_id NULL; NULLs are distinct in UNIQUE, so enforce separately
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_system_code
  ON public.roles (code) WHERE tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.tenant_owner_permission_policies (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_owner_permissions (
  tenant_id uuid NOT NULL REFERENCES public.tenant_owner_permission_policies(tenant_id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.member_permission_grants (
  membership_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, permission_key),
  FOREIGN KEY (membership_id, tenant_id)
    REFERENCES public.memberships(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_permission_grants_tenant
  ON public.member_permission_grants (tenant_id);

CREATE TABLE IF NOT EXISTS public.system_seed_runs (
  seed_key text PRIMARY KEY,
  version int NOT NULL DEFAULT 1,
  checksum text NOT NULL,
  run_count int NOT NULL DEFAULT 1,
  first_applied_at timestamptz NOT NULL DEFAULT now(),
  last_applied_at timestamptz NOT NULL DEFAULT now()
);

-- Server-side only (Prisma uses the postgres role which bypasses RLS)
ALTER TABLE public.permission_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_owner_permission_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_owner_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_seed_runs ENABLE ROW LEVEL SECURITY;

