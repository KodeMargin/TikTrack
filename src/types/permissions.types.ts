/**
 * DevProof (TikTrack) - Granular Permissions & Role-Based Access Control (RBAC) System
 *
 * Provides fine-grained action-level permissions across all system modules,
 * support for pre-defined system roles, tenant-level custom roles,
 * granular member overrides, and universal dynamic Super Admin authorization.
 */

export type PermissionModuleId =
  | 'tasks'
  | 'projects'
  | 'timer'
  | 'timesheets'
  | 'payments'
  | 'billing'
  | 'reports'
  | 'team'
  | 'roles'
  | 'timeline'
  | 'verification'
  | 'disputes'
  | 'integrations'
  | 'compliance'
  | 'superadmin'

export interface PermissionModule {
  id: PermissionModuleId
  name: string
  description: string
  icon: string
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: 'tasks',
    name: 'Tasks Management',
    description: 'Fine-grained control over task creation, editing, assignment, status and acceptance sign-offs.',
    icon: '📋',
  },
  {
    id: 'projects',
    name: 'Projects & Workspaces',
    description: 'Permissions for provisioning, updating and archiving client projects.',
    icon: '📁',
  },
  {
    id: 'timer',
    name: 'Focus Timer & Sessions',
    description: 'Live time tracking, break intervals and manual session registration.',
    icon: '⏱️',
  },
  {
    id: 'timesheets',
    name: 'Timesheets & Approvals',
    description: 'Timesheet submissions, line-item approvals, rejections and locking periods.',
    icon: '📅',
  },
  {
    id: 'payments',
    name: 'Developer Payments & Payouts',
    description: 'Developer pay rates, payout schedules, disbursement tracking and read-only earnings statements.',
    icon: '💸',
  },
  {
    id: 'billing',
    name: 'Contracts & Billing',
    description: 'Rate card management, draft invoice generation and credit note adjustments.',
    icon: '💳',
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Interactive dashboards, utilization, profitability, delivery, governance analytics and structured PDF/Excel exports.',
    icon: '📊',
  },
  {
    id: 'team',
    name: 'Team & Member Management',
    description: 'Inviting members, managing seats, status toggling and account revocations.',
    icon: '👥',
  },
  {
    id: 'roles',
    name: 'Roles & Permissions',
    description: 'Authoring custom roles, assigning permissions and configuring access policies.',
    icon: '🛡️',
  },
  {
    id: 'timeline',
    name: 'Activity Timeline & Evidence',
    description: 'Viewing digital activity timelines, gap annotations and privacy exclusion scopes.',
    icon: '🔍',
  },
  {
    id: 'verification',
    name: 'AI Verification & Rules',
    description: 'Configuring heuristic verification rules and approving AI digest generations.',
    icon: '🤖',
  },
  {
    id: 'disputes',
    name: 'Disputes & Appeals',
    description: 'Initiating, reviewing and resolving client-developer billing disputes.',
    icon: '⚖️',
  },
  {
    id: 'integrations',
    name: 'Integrations & API Ecosystem',
    description: 'Connecting IDE plugins, desktop agents, git webhooks and developer API keys.',
    icon: '🔌',
  },
  {
    id: 'compliance',
    name: 'Enterprise Compliance & Audit',
    description: 'Immutable security audit exports, SSO/SAML, legal holds and retention policies.',
    icon: '📜',
  },
  {
    id: 'superadmin',
    name: 'Super Admin Platform Privileges',
    description: 'Platform-level tenant orchestration, owner permission governance and master access.',
    icon: '👑',
  },
]

export interface GranularPermissionDef {
  key: string
  module: PermissionModuleId
  label: string
  description: string
  isSuperAdminOnly?: boolean
}

export const GRANULAR_PERMISSIONS: GranularPermissionDef[] = [
  // --- TASKS (Podima granular level) ---
  {
    key: 'task:create',
    module: 'tasks',
    label: 'Create Tasks',
    description: 'Can create new work tasks within assigned projects.',
  },
  {
    key: 'task:view',
    module: 'tasks',
    label: 'View Tasks',
    description: 'Can inspect task backlogs, details and estimates.',
  },
  {
    key: 'task:edit',
    module: 'tasks',
    label: 'Edit Task Specifications',
    description: 'Can update task titles, estimates, work modes and acceptance criteria.',
  },
  {
    key: 'task:delete',
    module: 'tasks',
    label: 'Delete Tasks',
    description: 'Can permanently remove unassigned or obsolete tasks.',
  },
  {
    key: 'task:assign',
    module: 'tasks',
    label: 'Assign Members to Tasks',
    description: 'Can allocate tasks to team developers or managers.',
  },
  {
    key: 'task:status_change',
    module: 'tasks',
    label: 'Update Task Progress & Status',
    description: 'Can transition task status between Backlog, Active, Review and Done.',
  },
  {
    key: 'task:approve',
    module: 'tasks',
    label: 'Approve & Sign-off Task Completion',
    description: 'Can certify that completed tasks satisfy acceptance criteria.',
  },

  // --- PROJECTS ---
  {
    key: 'project:create',
    module: 'projects',
    label: 'Create Projects',
    description: 'Can provision new client projects and workspaces.',
  },
  {
    key: 'project:view',
    module: 'projects',
    label: 'View Projects',
    description: 'Can view project lists, clients and overall progress.',
  },
  {
    key: 'project:edit',
    module: 'projects',
    label: 'Edit Projects',
    description: 'Can update project codes, names, clients and descriptions.',
  },
  {
    key: 'project:delete',
    module: 'projects',
    label: 'Archive & Delete Projects',
    description: 'Can pause, archive or delete project repositories.',
  },

  // --- TIMER & WORK SESSIONS ---
  {
    key: 'timer:start_stop',
    module: 'timer',
    label: 'Start / Stop Work Timer',
    description: 'Can launch live tracked work sessions and log breaks.',
  },
  {
    key: 'timer:manual_entry',
    module: 'timer',
    label: 'Manual Time Registration',
    description: 'Can submit retroactive or manual time adjustments.',
  },
  {
    key: 'timer:view_own',
    module: 'timer',
    label: 'View Own Sessions',
    description: 'Can inspect own active and historical timer sessions.',
  },
  {
    key: 'timer:view_team',
    module: 'timer',
    label: 'View Team Sessions',
    description: 'Can monitor real-time active sessions across the entire team.',
  },
  {
    key: 'timer:edit',
    module: 'timer',
    label: 'Edit Session Durations',
    description: 'Can adjust timestamps and context notes on recorded sessions.',
  },

  // --- TIMESHEETS & APPROVALS ---
  {
    key: 'timesheet:view_own',
    module: 'timesheets',
    label: 'View Own Timesheets',
    description: 'Can review own timesheet draft lines and hours.',
  },
  {
    key: 'timesheet:view_team',
    module: 'timesheets',
    label: 'View Team Timesheets',
    description: 'Can inspect all team timesheets across projects.',
  },
  {
    key: 'timesheet:submit',
    module: 'timesheets',
    label: 'Submit Timesheets',
    description: 'Can submit completed timesheets for peer or client review.',
  },
  {
    key: 'timesheet:approve',
    module: 'timesheets',
    label: 'Approve Timesheet Hours',
    description: 'Can formally approve submitted billable and unbillable hours.',
  },
  {
    key: 'timesheet:reject',
    module: 'timesheets',
    label: 'Reject & Request Clarification',
    description: 'Can flag timesheet lines requiring evidence or clarification.',
  },
  {
    key: 'timesheet:lock',
    module: 'timesheets',
    label: 'Lock Accounting Periods',
    description: 'Can lock timesheet billing cycles to make them immutable.',
  },

  // --- DEVELOPER PAYMENTS & PAYOUTS ---
  {
    key: 'payment:view_own',
    module: 'payments',
    label: 'View Own Payments (Read-Only)',
    description: 'Can view own configured pay rate, payout schedule, accrued earnings and payout history in read-only mode.',
  },
  {
    key: 'payment:view_team',
    module: 'payments',
    label: 'View Team Payments',
    description: 'Can inspect payment configurations, accrued payroll and payout history across all workspace members.',
  },
  {
    key: 'payment:configure',
    module: 'payments',
    label: 'Configure Developer Payments',
    description: 'Can configure developer hourly/retainer pay rates, payout schedules, payment methods and tax withholding.',
  },
  {
    key: 'payment:record_payout',
    module: 'payments',
    label: 'Record & Mark Payouts Paid',
    description: 'Can create payout disbursements and update payout statuses (Scheduled, Processing, Paid).',
  },

  // --- CONTRACTS & BILLING ---
  {
    key: 'billing:view',
    module: 'billing',
    label: 'View Financial Records',
    description: 'Can inspect invoices, rate cards and accrued billing totals.',
  },
  {
    key: 'billing:manage_rates',
    module: 'billing',
    label: 'Manage Effective-Dated Rate Cards',
    description: 'Can create and modify historical hourly billing rates.',
  },
  {
    key: 'invoice:create_draft',
    module: 'billing',
    label: 'Generate Invoice Drafts',
    description: 'Can compile approved timesheets into formal invoice drafts.',
  },
  {
    key: 'invoice:lock_finalize',
    module: 'billing',
    label: 'Lock & Finalize Invoices',
    description: 'Can seal finalized invoices and trigger client payment requests.',
  },
  {
    key: 'invoice:credit_adjust',
    module: 'billing',
    label: 'Issue Credit Adjustments',
    description: 'Can issue credit notes and refund rebills against locked periods.',
  },

  // --- REPORTS & ANALYTICS ---
  {
    key: 'report:view_own',
    module: 'reports',
    label: 'View Own Reports',
    description: 'Can view personal time, deep-work, delivery and earnings analytics.',
  },
  {
    key: 'report:view_team',
    module: 'reports',
    label: 'View Tenant & Team Reports',
    description: 'Can view workspace-wide executive, utilization, deep-work, sprint delivery and governance reports.',
  },
  {
    key: 'report:view_financials',
    module: 'reports',
    label: 'View Financial & Profitability Reports',
    description: 'Can view client billing revenue, developer payout costs, gross profit margins and invoice aging analytics.',
  },
  {
    key: 'report:export_pdf',
    module: 'reports',
    label: 'Export Reports (PDF)',
    description: 'Can generate and download clean structured PDF documents for accessible reports.',
  },
  {
    key: 'report:export_excel',
    module: 'reports',
    label: 'Export Reports (Excel)',
    description: 'Can generate and download formatted multi-sheet Excel (.xlsx) workbooks for accessible reports.',
  },
  {
    key: 'report:create_saved',
    module: 'reports',
    label: 'Build & Save Custom Reports',
    description: 'Can use the custom pivot report builder and save reusable report views.',
  },
  {
    key: 'report:ai_insights',
    module: 'reports',
    label: 'AI Report Executive Briefs',
    description: 'Can generate guardrailed AI executive summaries from aggregated report metrics.',
  },

  // --- TEAM MEMBERS ---
  {
    key: 'member:view',
    module: 'team',
    label: 'View Team Members',
    description: 'Can inspect workspace roster, membership statuses and emails.',
  },
  {
    key: 'member:invite',
    module: 'team',
    label: 'Invite Team Members',
    description: 'Can send workspace invitations and generate login credentials.',
  },
  {
    key: 'member:edit_role',
    module: 'team',
    label: 'Assign Roles & Permissions',
    description: 'Can promote, demote or reassign member roles and override permissions.',
  },
  {
    key: 'member:status_toggle',
    module: 'team',
    label: 'Activate / Suspend Members',
    description: 'Can toggle member status between active, suspended and revoked.',
  },
  {
    key: 'member:delete',
    module: 'team',
    label: 'Delete Team Members',
    description: 'Can permanently remove members and cascade associated assignments.',
  },

  // --- ROLES & PERMISSIONS ---
  {
    key: 'role:view',
    module: 'roles',
    label: 'View Role Matrices',
    description: 'Can view configured system and custom roles and assigned permissions.',
  },
  {
    key: 'role:create',
    module: 'roles',
    label: 'Create Custom Roles',
    description: 'Can define new custom roles with customized granular permissions.',
  },
  {
    key: 'role:edit',
    module: 'roles',
    label: 'Edit Custom Roles',
    description: 'Can modify permissions and descriptions for existing custom roles.',
  },
  {
    key: 'role:delete',
    module: 'roles',
    label: 'Delete Custom Roles',
    description: 'Can remove non-system roles that are no longer needed.',
  },

  // --- TIMELINE & EVIDENCE ---
  {
    key: 'timeline:view_own',
    module: 'timeline',
    label: 'View Own Activity Timeline',
    description: 'Can review own minute-by-minute activity rollups and apps.',
  },
  {
    key: 'timeline:view_team',
    module: 'timeline',
    label: 'View Team Activity Timeline',
    description: 'Can audit activity timeline and rollups for all team members.',
  },
  {
    key: 'evidence:annotate',
    module: 'timeline',
    label: 'Add Session Annotations',
    description: 'Can attach explanatory notes and justifications to timeline gaps.',
  },
  {
    key: 'privacy:manage_rules',
    module: 'timeline',
    label: 'Configure Privacy Exclusions',
    description: 'Can manage client-side privacy exclusions and redaction rules.',
  },

  // --- AI VERIFICATION ---
  {
    key: 'verification:view',
    module: 'verification',
    label: 'View Verification Insights',
    description: 'Can view corroborated evidence scores and anomaly indicators.',
  },
  {
    key: 'verification:manage_rules',
    module: 'verification',
    label: 'Manage Verification Rule Sets',
    description: 'Can configure deterministic rules for multi-source evidence verification.',
  },
  {
    key: 'verification:approve_drafts',
    module: 'verification',
    label: 'Approve AI Work Summaries',
    description: 'Can sign off on automated work summary digests and sprint reports.',
  },

  // --- DISPUTES ---
  {
    key: 'dispute:open',
    module: 'disputes',
    label: 'Raise Disputes & Appeals',
    description: 'Can flag discrepancies in hours or evidence for formal review.',
  },
  {
    key: 'dispute:view',
    module: 'disputes',
    label: 'View Dispute Cases',
    description: 'Can inspect open dispute threads, logs and arbitration messages.',
  },
  {
    key: 'dispute:resolve',
    module: 'disputes',
    label: 'Resolve Disputes',
    description: 'Can adjudicate, adjust billed amounts and close dispute cases.',
  },
  {
    key: 'dispute:escalate',
    module: 'disputes',
    label: 'Escalate Disputes',
    description: 'Can elevate unresolved disputes to senior leadership or external auditors.',
  },

  // --- INTEGRATIONS & ECOSYSTEM ---
  {
    key: 'integration:view',
    module: 'integrations',
    label: 'View Connected Services',
    description: 'Can view connected git providers, IDE extensions and agent devices.',
  },
  {
    key: 'integration:manage',
    module: 'integrations',
    label: 'Configure Integrations & Webhooks',
    description: 'Can connect new repositories, webhooks, and issue API tokens.',
  },

  // --- COMPLIANCE & GOVERNANCE ---
  {
    key: 'compliance:view',
    module: 'compliance',
    label: 'View Compliance Policies',
    description: 'Can review published privacy policies, DPIA assessments and consents.',
  },
  {
    key: 'compliance:audit_export',
    module: 'compliance',
    label: 'Export Immutable Audit Ledgers',
    description: 'Can download cryptographically hashed security and access logs.',
  },
  {
    key: 'compliance:sso_manage',
    module: 'compliance',
    label: 'Configure SSO & SCIM',
    description: 'Can link enterprise SAML/OIDC identity providers and directory sync.',
  },
  {
    key: 'compliance:legal_hold',
    module: 'compliance',
    label: 'Manage Legal Holds',
    description: 'Can place or release litigation holds that freeze data retention purges.',
  },

  // --- SUPER ADMIN PLATFORM PRIVILEGES (Platform Level) ---
  {
    key: 'superadmin:cross_tenant_view',
    module: 'superadmin',
    label: 'Cross-Tenant Global Switcher',
    description: 'Can inspect, switch into and administer any workspace on the platform.',
    isSuperAdminOnly: true,
  },
  {
    key: 'superadmin:manage_tenant_owner_permissions',
    module: 'superadmin',
    label: 'Tenant Owner Permission Governance',
    description: 'Can restrict, customize or grant capabilities to Tenant Owners.',
    isSuperAdminOnly: true,
  },
  {
    key: 'superadmin:platform_plans_pricing',
    module: 'superadmin',
    label: 'SaaS Platform Plans & Pricing Engine',
    description: 'Can alter subscription tiers, seat limits and global feature flags.',
    isSuperAdminOnly: true,
  },
  {
    key: 'superadmin:system_health_audit',
    module: 'superadmin',
    label: 'Global Telemetry & Direct DB Audits',
    description: 'Master visibility into distributed background workers and audit chains.',
    isSuperAdminOnly: true,
  },
  {
    key: 'superadmin:platform_reports',
    module: 'superadmin',
    label: 'Platform & Cross-Tenant Reports',
    description: 'Can view and export platform SaaS revenue, tenant quota health and per-tenant operational reports across all workspaces.',
    isSuperAdminOnly: true,
  },
]

export interface CustomRole {
  id: string
  tenantId: string // 'system' or tenant UUID
  name: string
  code: string
  description: string
  isSystemRole: boolean
  permissions: string[]
  createdAt?: string
  updatedAt?: string
}

/**
 * All non-superadmin permissions available for tenant allocation.
 */
export const ALL_TENANT_PERMISSIONS: string[] = GRANULAR_PERMISSIONS.filter(
  (p) => !p.isSuperAdminOnly
).map((p) => p.key)

/**
 * Default base permissions for Tenant Owners.
 * Note: Super Admin can customize these per tenant!
 */
export const DEFAULT_TENANT_OWNER_PERMISSIONS: string[] = [...ALL_TENANT_PERMISSIONS]

/**
 * Pre-defined system roles shipped with every workspace.
 */
export const DEFAULT_PREDEFINED_ROLES: CustomRole[] = [
  {
    id: 'role-super-admin',
    tenantId: 'system',
    name: 'Super Admin',
    code: 'super_admin',
    description: 'Master platform administrator with automatic full access to all existing and future permissions, plus platform governance.',
    isSystemRole: true,
    // Note: In runtime, super_admin matches wildcard '*' dynamically so any new permission is auto-granted!
    permissions: GRANULAR_PERMISSIONS.map((p) => p.key),
  },
  {
    id: 'role-tenant-owner',
    tenantId: 'system',
    name: 'Tenant Owner',
    code: 'tenant_owner',
    description: 'Workspace owner with full authority over projects, tasks, billing, team invitations and custom roles.',
    isSystemRole: true,
    permissions: [...DEFAULT_TENANT_OWNER_PERMISSIONS],
  },
  {
    id: 'role-project-manager',
    tenantId: 'system',
    name: 'Project Manager',
    code: 'project_manager',
    description: 'Manages projects, creates & assigns tasks, approves timesheets, reviews activity timelines and handles disputes.',
    isSystemRole: true,
    permissions: [
      'task:create',
      'task:view',
      'task:edit',
      'task:delete',
      'task:assign',
      'task:status_change',
      'task:approve',
      'project:create',
      'project:view',
      'project:edit',
      'timer:start_stop',
      'timer:manual_entry',
      'timer:view_own',
      'timer:view_team',
      'timer:edit',
      'timesheet:view_own',
      'timesheet:view_team',
      'timesheet:submit',
      'timesheet:approve',
      'timesheet:reject',
      'payment:view_own',
      'member:view',
      'role:view',
      'timeline:view_own',
      'timeline:view_team',
      'evidence:annotate',
      'verification:view',
      'verification:manage_rules',
      'verification:approve_drafts',
      'dispute:view',
      'dispute:resolve',
      'integration:view',
      'report:view_own',
      'report:view_team',
      'report:export_pdf',
      'report:export_excel',
      'report:create_saved',
      'report:ai_insights',
    ],
  },
  {
    id: 'role-developer',
    tenantId: 'system',
    name: 'Developer',
    code: 'developer',
    description: 'Focuses on executing assigned tasks, logging work sessions, submitting timesheets and annotating evidence.',
    isSystemRole: true,
    permissions: [
      'task:view',
      'task:status_change',
      'project:view',
      'timer:start_stop',
      'timer:manual_entry',
      'timer:view_own',
      'timesheet:view_own',
      'timesheet:submit',
      'payment:view_own',
      'timeline:view_own',
      'evidence:annotate',
      'dispute:open',
      'dispute:view',
      'member:view',
      'integration:view',
      'report:view_own',
      'report:export_pdf',
      'report:export_excel',
      'report:create_saved',
      'report:ai_insights',
    ],
  },
  {
    id: 'role-finance',
    tenantId: 'system',
    name: 'Finance & Invoicing',
    code: 'finance',
    description: 'Oversees contract rate cards, approved timesheet accounting, invoice drafting, locking periods and credit notes.',
    isSystemRole: true,
    permissions: [
      'task:view',
      'project:view',
      'timesheet:view_own',
      'timesheet:view_team',
      'timesheet:lock',
      'payment:view_own',
      'payment:view_team',
      'payment:record_payout',
      'billing:view',
      'billing:manage_rates',
      'invoice:create_draft',
      'invoice:lock_finalize',
      'invoice:credit_adjust',
      'member:view',
      'report:view_own',
      'report:view_team',
      'report:view_financials',
      'report:export_pdf',
      'report:export_excel',
      'report:create_saved',
      'report:ai_insights',
    ],
  },
  {
    id: 'role-client-reviewer',
    tenantId: 'system',
    name: 'Client Reviewer',
    code: 'client_reviewer',
    description: 'External client stakeholder with visibility into project progress, timesheet approvals and raising billing disputes.',
    isSystemRole: true,
    permissions: [
      'task:view',
      'project:view',
      'timesheet:view_team',
      'timesheet:approve',
      'timesheet:reject',
      'payment:view_own',
      'dispute:open',
      'dispute:view',
      'timeline:view_team',
      'member:view',
      'report:view_team',
      'report:export_pdf',
      'report:export_excel',
    ],
  },
  {
    id: 'role-auditor',
    tenantId: 'system',
    name: 'Compliance Auditor',
    code: 'auditor',
    description: 'Independent compliance inspector with read-only access to immutable security ledgers, timelines and verification evidence.',
    isSystemRole: true,
    permissions: [
      'task:view',
      'project:view',
      'timesheet:view_team',
      'payment:view_own',
      'payment:view_team',
      'timeline:view_team',
      'verification:view',
      'compliance:view',
      'compliance:audit_export',
      'dispute:view',
      'member:view',
      'report:view_team',
      'report:export_pdf',
      'report:export_excel',
      'report:create_saved',
    ],
  },
]

