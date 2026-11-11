-- =============================================================================
-- pgTAP Test Suite: Phase 2 Developer-Specific Evidence Collection & Webhooks
-- Covers Section 5.5 Phase 2 Acceptance Scenarios & D-003 Privacy Guardrails
-- =============================================================================

BEGIN;
SELECT plan(10);

-- 1. Seed Tenant, Developer, Finance User, Project, Task, Device & Session
INSERT INTO auth.users (id, email)
VALUES
  ('77777777-7777-4777-8777-777777777701', 'dev.phase2@northstar.dev'),
  ('77777777-7777-4777-8777-777777777702', 'finance.phase2@northstar.dev')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_profiles (id, email, full_name)
VALUES
  ('77777777-7777-4777-8777-777777777701', 'dev.phase2@northstar.dev', 'Aria Chen'),
  ('77777777-7777-4777-8777-777777777702', 'finance.phase2@northstar.dev', 'Elena Finance')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenants (id, name, slug, default_currency)
VALUES
  ('88888888-8888-4888-8888-888888888801', 'Northstar Phase 2', 'northstar-p2', 'USD');

INSERT INTO public.memberships (id, tenant_id, user_id, status)
VALUES
  ('99999999-9999-4999-8999-999999999901', '88888888-8888-4888-8888-888888888801', '77777777-7777-4777-8777-777777777701', 'active'),
  ('99999999-9999-4999-8999-999999999902', '88888888-8888-4888-8888-888888888801', '77777777-7777-4777-8777-777777777702', 'active');

INSERT INTO public.role_grants (tenant_id, membership_id, role)
VALUES
  ('88888888-8888-4888-8888-888888888801', '99999999-9999-4999-8999-999999999901', 'developer'),
  ('88888888-8888-4888-8888-888888888801', '99999999-9999-4999-8999-999999999902', 'finance');

INSERT INTO public.policy_versions (id, tenant_id, version_code, summary_markdown)
VALUES
  ('aaaaaaaa-8888-4888-8888-888888888801', '88888888-8888-4888-8888-888888888801', 'v2.0', 'Phase 2 telemetry policy');

INSERT INTO public.devices (id, tenant_id, user_id, device_name, os_platform, agent_version, device_fingerprint_hash)
VALUES
  ('dddddddd-8888-4888-8888-888888888801', '88888888-8888-4888-8888-888888888801', '77777777-7777-4777-8777-777777777701', 'MacBook Pro M4', 'macos', '0.2.0', 'fp_hash_m4');

INSERT INTO public.projects (id, tenant_id, code, name, client_name)
VALUES
  ('bbbbbbbb-8888-4888-8888-888888888801', '88888888-8888-4888-8888-888888888801', 'CORE', 'Core Ledger', 'Acme Corp');

INSERT INTO public.project_members (tenant_id, project_id, user_id, project_role)
VALUES
  ('88888888-8888-4888-8888-888888888801', 'bbbbbbbb-8888-4888-8888-888888888801', '77777777-7777-4777-8777-777777777701', 'contributor');

INSERT INTO public.tasks (id, tenant_id, project_id, code, title, estimate_minutes)
VALUES
  ('cccccccc-8888-4888-8888-888888888801', '88888888-8888-4888-8888-888888888801', 'bbbbbbbb-8888-4888-8888-888888888801', 'DEV-204', 'Race Condition Investigation', 240);

INSERT INTO public.work_sessions (id, tenant_id, user_id, device_id, project_id, task_id, provenance, lifecycle_state, current_work_mode, policy_version_id)
VALUES
  ('eeeeeeee-8888-4888-8888-888888888801', '88888888-8888-4888-8888-888888888801', '77777777-7777-4777-8777-777777777701', 'dddddddd-8888-4888-8888-888888888801', 'bbbbbbbb-8888-4888-8888-888888888801', 'cccccccc-8888-4888-8888-888888888801', 'desktop_timer', 'completed', 'debugging', 'aaaaaaaa-8888-4888-8888-888888888801');

-- 2. Verify D-003 DB Guardrail Rejects Prohibited Surveillance Keys in activity_events
SELECT throws_ok(
  $$
    INSERT INTO public.activity_events (
      event_id, schema_version, tenant_id, user_id, device_id, session_id,
      source, event_type, occurred_at_utc, monotonic_elapsed_ms, consent_policy_version, metadata
    )
    VALUES (
      '12121212-1212-4212-8212-121212121201', 1,
      '88888888-8888-4888-8888-888888888801',
      '77777777-7777-4777-8777-777777777701',
      'dddddddd-8888-4888-8888-888888888801',
      'eeeeeeee-8888-4888-8888-888888888801',
      'desktop', 'activity_rollup_1m', now(), 60000, 'v2.0',
      '{"app_category": "ide", "keystrokes": "const secret = 123"}'::jsonb
    )
  $$,
  '23514',
  'activity_events check constraint blocks prohibited surveillance key (keystrokes)'
);

-- 3. Verify Valid Coarse Activity Event & VS Code Debug Event Succeed
SELECT lives_ok(
  $$
    INSERT INTO public.activity_events (
      event_id, schema_version, tenant_id, user_id, device_id, session_id,
      source, event_type, occurred_at_utc, monotonic_elapsed_ms, consent_policy_version, metadata
    )
    VALUES (
      '12121212-1212-4212-8212-121212121202', 1,
      '88888888-8888-4888-8888-888888888801',
      '77777777-7777-4777-8777-777777777701',
      'dddddddd-8888-4888-8888-888888888801',
      'eeeeeeee-8888-4888-8888-888888888801',
      'vscode', 'vscode_debug_session', '2026-11-11T10:15:00Z', 900000, 'v2.0',
      '{"debug_type": "pwa-node", "breakpoints_hit": 14, "duration_seconds": 1800}'::jsonb
    )
  $$,
  'Valid coarse VS Code debug telemetry event is accepted'
);

-- 4. Verify Idempotent Event Replay (Same event_id inserted again is blocked/deduplicated)
SELECT throws_ok(
  $$
    INSERT INTO public.activity_events (
      event_id, schema_version, tenant_id, user_id, device_id, session_id,
      source, event_type, occurred_at_utc, monotonic_elapsed_ms, consent_policy_version, metadata
    )
    VALUES (
      '12121212-1212-4212-8212-121212121202', 1,
      '88888888-8888-4888-8888-888888888801',
      '77777777-7777-4777-8777-777777777701',
      'dddddddd-8888-4888-8888-888888888801',
      'eeeeeeee-8888-4888-8888-888888888801',
      'vscode', 'vscode_debug_session', '2026-11-11T10:15:00Z', 900000, 'v2.0',
      '{"debug_type": "pwa-node"}'::jsonb
    )
  $$,
  '23505',
  'Duplicate event_id within tenant is rejected by unique index idx_activity_events_idempotent_event_id'
);

-- 5. Verify GitHub Webhook Replay Deduplication (Section 5.5: Same webhook received 3 times -> 1 artifact)
SELECT public.ingest_webhook_evidence_idempotent(
  '88888888-8888-4888-8888-888888888801',
  'bbbbbbbb-8888-4888-8888-888888888801',
  'cccccccc-8888-4888-8888-888888888801',
  'github',
  'gh-delivery-replay-001',
  'push',
  true,
  'sha256_abc123',
  'github_commit',
  'commit_sha_9f8e7d6',
  '2026-11-11T12:00:00Z',
  '77777777-7777-4777-8777-777777777701',
  'fix(DEV-204): resolve connection pool lock under retry',
  '{"branch": "fix/DEV-204-pool-lock", "files_changed": 3}'::jsonb,
  'contemporaneous',
  'Matched DEV-204 in commit message and branch'
);

SELECT public.ingest_webhook_evidence_idempotent(
  '88888888-8888-4888-8888-888888888801',
  'bbbbbbbb-8888-4888-8888-888888888801',
  'cccccccc-8888-4888-8888-888888888801',
  'github',
  'gh-delivery-replay-001',
  'push',
  true,
  'sha256_abc123',
  'github_commit',
  'commit_sha_9f8e7d6',
  '2026-11-11T12:00:00Z',
  '77777777-7777-4777-8777-777777777701',
  'fix(DEV-204): resolve connection pool lock under retry',
  '{"branch": "fix/DEV-204-pool-lock", "files_changed": 3}'::jsonb,
  'contemporaneous',
  'Matched DEV-204 in commit message and branch'
);

SELECT public.ingest_webhook_evidence_idempotent(
  '88888888-8888-4888-8888-888888888801',
  'bbbbbbbb-8888-4888-8888-888888888801',
  'cccccccc-8888-4888-8888-888888888801',
  'github',
  'gh-delivery-replay-001',
  'push',
  true,
  'sha256_abc123',
  'github_commit',
  'commit_sha_9f8e7d6',
  '2026-11-11T12:00:00Z',
  '77777777-7777-4777-8777-777777777701',
  'fix(DEV-204): resolve connection pool lock under retry',
  '{"branch": "fix/DEV-204-pool-lock", "files_changed": 3}'::jsonb,
  'contemporaneous',
  'Matched DEV-204 in commit message and branch'
);

SELECT results_eq(
  $$
    SELECT count(*)::int
    FROM public.evidence_artifacts
    WHERE tenant_id = '88888888-8888-4888-8888-888888888801'
      AND external_id = 'commit_sha_9f8e7d6'
  $$,
  ARRAY[1],
  'Same GitHub webhook received 3 times creates exactly 1 canonical evidence_artifact'
);

SELECT results_eq(
  $$
    SELECT delivery_attempt_count
    FROM public.webhook_receipts
    WHERE provider = 'github' AND delivery_id = 'gh-delivery-replay-001'
  $$,
  ARRAY[3],
  'webhook_receipts tracks all 3 delivery attempts on the single deduplicated receipt'
);

-- 6. Verify RLS: Developer can query their own activity_events for Local Privacy Audit View (F2-035)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "77777777-7777-4777-8777-777777777701", "role": "authenticated"}';

SELECT results_eq(
  $$
    SELECT count(*)::int
    FROM public.activity_events
    WHERE tenant_id = '88888888-8888-4888-8888-888888888801'
  $$,
  ARRAY[1],
  'Developer can inspect their own raw activity_events in Local Privacy Audit View (F2-035)'
);

SELECT results_eq(
  $$
    SELECT count(*)::int
    FROM public.evidence_artifacts
    WHERE tenant_id = '88888888-8888-4888-8888-888888888801'
  $$,
  ARRAY[1],
  'Developer assigned to project can view linked evidence_artifacts'
);

-- 7. Verify RLS Negative Test: Finance Role Cannot Query Raw activity_events or evidence_artifacts
SET LOCAL "request.jwt.claims" = '{"sub": "77777777-7777-4777-8777-777777777702", "role": "authenticated"}';

SELECT results_eq(
  $$
    SELECT count(*)::int
    FROM public.activity_events
    WHERE tenant_id = '88888888-8888-4888-8888-888888888801'
  $$,
  ARRAY[0],
  'Finance role receives 0 rows when querying raw workstation activity_events'
);

SELECT results_eq(
  $$
    SELECT count(*)::int
    FROM public.evidence_artifacts
    WHERE tenant_id = '88888888-8888-4888-8888-888888888801'
  $$,
  ARRAY[0],
  'Finance role receives 0 rows when querying code/debug evidence_artifacts'
);

SELECT * FROM finish();
ROLLBACK;

