-- =============================================================================
-- Migration 0011: Phase 4 - SaaS Subscriptions, Usage Metering & Entitlements
-- Covers F4-001 (Self-Service Trial & Checkout), F4-002 (Seat/Usage Metering),
-- F4-003 (Strict Separation of SaaS Billing vs Freelancer Work Invoices),
-- F4-004 (Graceful Usage Limit Handling - Never Drop Core Time Sessions)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend plan_entitlements with Phase 4 SaaS Quotas & Packaging Metadata
-- -----------------------------------------------------------------------------

ALTER TABLE public.plan_entitlements
  ADD COLUMN IF NOT EXISTS monthly_event_quota int NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS monthly_ai_token_quota int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_quota_mb int NOT NULL DEFAULT 512,
  ADD COLUMN IF NOT EXISTS api_rate_limit_per_min int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS outbound_webhooks_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_connectors_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_pm_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS white_label_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_monthly_price_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_seat_price_cents int NOT NULL DEFAULT 0;

UPDATE public.plan_entitlements
SET
  monthly_event_quota = CASE plan_tier
    WHEN 'starter' THEN 50000
    WHEN 'team' THEN 500000
    WHEN 'agency' THEN 2500000
    ELSE 25000000
  END,
  monthly_ai_token_quota = CASE plan_tier
    WHEN 'starter' THEN 0
    WHEN 'team' THEN 150000
    WHEN 'agency' THEN 750000
    ELSE 5000000
  END,
  storage_quota_mb = CASE plan_tier
    WHEN 'starter' THEN 512
    WHEN 'team' THEN 5120
    WHEN 'agency' THEN 25600
    ELSE 256000
  END,
  api_rate_limit_per_min = CASE plan_tier
    WHEN 'starter' THEN 30
    WHEN 'team' THEN 120
    WHEN 'agency' THEN 600
    ELSE 2400
  END,
  outbound_webhooks_enabled = (plan_tier IN ('team', 'agency', 'enterprise')),
  accounting_connectors_enabled = (plan_tier IN ('agency', 'enterprise')),
  external_pm_enabled = (plan_tier IN ('team', 'agency', 'enterprise')),
  white_label_enabled = (plan_tier IN ('agency', 'enterprise')),
  base_monthly_price_cents = CASE plan_tier
    WHEN 'starter' THEN 0
    WHEN 'team' THEN 4900
    WHEN 'agency' THEN 14900
    ELSE 49900
  END,
  per_seat_price_cents = CASE plan_tier
    WHEN 'starter' THEN 0
    WHEN 'team' THEN 1200
    WHEN 'agency' THEN 1800
    ELSE 2400
  END;

-- -----------------------------------------------------------------------------
-- 2. Extend webhook_receipts to support Stripe & Paddle SaaS billing webhooks
-- -----------------------------------------------------------------------------

ALTER TABLE public.webhook_receipts
  DROP CONSTRAINT IF EXISTS webhook_receipts_provider_check;

ALTER TABLE public.webhook_receipts
  ADD CONSTRAINT webhook_receipts_provider_check
  CHECK (provider IN ('github', 'gitlab', 'jira', 'linear', 'stripe', 'paddle'));

-- -----------------------------------------------------------------------------
-- 3. Subscription Accounts (F4-001)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_tier text NOT NULL DEFAULT 'starter'
    REFERENCES public.plan_entitlements(plan_tier),
  billing_provider text NOT NULL DEFAULT 'stripe'
    CHECK (billing_provider IN ('stripe', 'paddle', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'grace_period')),
  billing_cycle text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'annual')),
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  seat_limit_override int CHECK (seat_limit_override IS NULL OR seat_limit_override > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_accounts_provider_sub
  ON public.subscription_accounts (billing_provider, provider_subscription_id);

-- -----------------------------------------------------------------------------
-- 4. Platform SaaS Subscription Invoices (F4-003)
--    Strictly separate from freelancer/contractor work `invoice_drafts`.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.saas_subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_account_id uuid NOT NULL,
  invoice_number text NOT NULL,
  billing_period_label text NOT NULL,
  plan_tier text NOT NULL REFERENCES public.plan_entitlements(plan_tier),
  seats_billed int NOT NULL DEFAULT 1 CHECK (seats_billed >= 0),
  unit_price_cents int NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  subtotal_cents int NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents int NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents int NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'paid', 'void')),
  provider_invoice_id text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (subscription_account_id, tenant_id)
    REFERENCES public.subscription_accounts(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_saas_subscription_invoices_tenant
  ON public.saas_subscription_invoices (tenant_id, issued_at DESC);

-- -----------------------------------------------------------------------------
-- 5. Daily Usage Records & Nightly Aggregation Function (F4-002, F4-004)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_date date NOT NULL DEFAULT current_date,
  active_seats int NOT NULL DEFAULT 0 CHECK (active_seats >= 0),
  active_projects int NOT NULL DEFAULT 0 CHECK (active_projects >= 0),
  activity_events_count bigint NOT NULL DEFAULT 0 CHECK (activity_events_count >= 0),
  storage_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
  ai_tokens_used bigint NOT NULL DEFAULT 0 CHECK (ai_tokens_used >= 0),
  api_requests_count bigint NOT NULL DEFAULT 0 CHECK (api_requests_count >= 0),
  webhook_deliveries_count bigint NOT NULL DEFAULT 0 CHECK (webhook_deliveries_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_date
  ON public.usage_records (tenant_id, metric_date DESC);

CREATE OR REPLACE FUNCTION public.aggregate_daily_tenant_usage(target_date date DEFAULT current_date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_upserted int := 0;
BEGIN
  INSERT INTO public.usage_records (
    tenant_id,
    metric_date,
    active_seats,
    active_projects,
    activity_events_count,
    storage_bytes,
    ai_tokens_used,
    updated_at
  )
  SELECT
    t.id AS tenant_id,
    target_date AS metric_date,
    COALESCE((
      SELECT count(*)::int
      FROM public.memberships m
      WHERE m.tenant_id = t.id AND m.status = 'active'
    ), 0) AS active_seats,
    COALESCE((
      SELECT count(*)::int
      FROM public.projects p
      WHERE p.tenant_id = t.id AND p.status = 'active'
    ), 0) AS active_projects,
    COALESCE((
      SELECT count(*)::bigint
      FROM public.activity_events ae
      WHERE ae.tenant_id = t.id
        AND (ae.occurred_at_utc AT TIME ZONE 'UTC')::date = target_date
    ), 0) AS activity_events_count,
    0::bigint AS storage_bytes,
    COALESCE((
      SELECT sum(ag.tokens_used)::bigint
      FROM public.ai_generations ag
      WHERE ag.tenant_id = t.id
        AND (ag.created_at AT TIME ZONE 'UTC')::date = target_date
    ), 0) AS ai_tokens_used,
    now()
  FROM public.tenants t
  ON CONFLICT (tenant_id, metric_date) DO UPDATE SET
    active_seats = EXCLUDED.active_seats,
    active_projects = EXCLUDED.active_projects,
    activity_events_count = EXCLUDED.activity_events_count,
    ai_tokens_used = EXCLUDED.ai_tokens_used,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;
  RETURN v_upserted;
END;
$$;

-- Register nightly pg_cron job only if pg_cron extension is active
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'devproof-nightly-usage-metering',
      '15 0 * * *',
      $cron$SELECT public.aggregate_daily_tenant_usage(current_date - 1);$cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.subscription_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

-- Subscription accounts: owners, finance, and auditors can view; only owners manage
CREATE POLICY subscription_accounts_select ON public.subscription_accounts
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance', 'auditor'])
  );

CREATE POLICY subscription_accounts_manage ON public.subscription_accounts
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- SaaS subscription invoices: owners, finance, and auditors can view; owners manage
CREATE POLICY saas_subscription_invoices_select ON public.saas_subscription_invoices
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance', 'auditor'])
  );

CREATE POLICY saas_subscription_invoices_manage ON public.saas_subscription_invoices
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- Usage records: owners, project_managers, finance, and auditors can inspect metering
CREATE POLICY usage_records_select ON public.usage_records
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'finance', 'auditor'])
  );

