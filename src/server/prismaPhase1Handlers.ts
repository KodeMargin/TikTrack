/**
 * DevProof (TikTrack) - Prisma Phase 1 Server Handlers
 *
 * Implements full PostgreSQL persistence for Tenancy, RBAC, Policy Consents,
 * Projects/Tasks/Assignments, Work Sessions/Breaks/Segments, Timesheets,
 * Review Decisions, Disputes, Contracts/Rates, Invoices & Notifications.
 */

import { prisma, checkPrismaConnection } from '../lib/prisma.ts'
import { ensureSupabaseAuthUser } from './emailService.ts'
import { handleBootstrapPhase2Data } from './prismaPhase2Handlers.ts'
import { handleBootstrapPhase3Data } from './prismaPhase3Handlers.ts'
import { handleBootstrapPhase4Data } from './prismaPhase4Handlers.ts'
import { handleBootstrapRbacData } from './prismaRbacHandlers.ts'
import type { VerifiedServerActor } from './serverAuthGuard.ts'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(val: string | undefined | null): val is string {
  return Boolean(val && UUID_REGEX.test(val))
}

let jiraSchemaEnsured = false

async function ensureJiraWorkspaceSchema(): Promise<void> {
  if (jiraSchemaEnsured) return
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE public.projects
        ADD COLUMN IF NOT EXISTS board_config JSONB;
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.sprints (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  UUID NOT NULL,
        project_id UUID NOT NULL,
        name       TEXT NOT NULL,
        goal       TEXT,
        status     TEXT NOT NULL DEFAULT 'planned',
        start_date DATE,
        end_date   DATE,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_sprints_project
          FOREIGN KEY (project_id, tenant_id)
          REFERENCES public.projects(id, tenant_id)
          ON DELETE CASCADE
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_sprints_tenant_project_status
        ON public.sprints (tenant_id, project_id, status);
    `)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE public.tasks
        ADD COLUMN IF NOT EXISTS sprint_id    UUID REFERENCES public.sprints(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS issue_type   TEXT NOT NULL DEFAULT 'task',
        ADD COLUMN IF NOT EXISTS labels       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        ADD COLUMN IF NOT EXISTS story_points INTEGER,
        ADD COLUMN IF NOT EXISTS board_order  INTEGER NOT NULL DEFAULT 0;
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_tasks_sprint
        ON public.tasks (tenant_id, project_id, sprint_id);
    `)
    jiraSchemaEnsured = true
  } catch (err) {
    console.warn('[Prisma] ensureJiraWorkspaceSchema skipped/warn:', err instanceof Error ? err.message : String(err))
  }
}

export async function handleBootstrap(actor?: VerifiedServerActor) {
  const status = await checkPrismaConnection()
  if (!status.connected || (actor?.authEnforced && !actor.authenticated)) {
    return {
      status,
      tenants: [],
      members: [],
      projects: [],
      sprints: [],
      tasks: [],
      timesheetLines: [],
      contracts: [],
      invoices: [],
      notifications: [],
      planEntitlements: [],
      auditLogs: [],
    }
  }

  // Ensure Jira-grade workspace tables/columns exist idempotently
  await ensureJiraWorkspaceSchema()

  // First-run & auto-evolution seed: ensures RBAC tables, permission_modules,
  // permissions, and pre-defined system roles are saved in PostgreSQL.
  const rbac = await handleBootstrapRbacData()

  const [
    dbTenants,
    dbMemberships,
    dbProjects,
    dbSprints,
    dbTasks,
    dbTimesheetLines,
    dbContracts,
    dbInvoices,
    dbNotifications,
    dbEntitlements,
    dbAudits,
    phase2,
    phase3,
    phase4,
  ] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        settings: true,
        policyVersions: { orderBy: { effectiveFrom: 'desc' } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.membership.findMany({
      include: {
        user: {
          include: {
            policyConsents: {
              include: { policyVersion: true },
              orderBy: { consentedAt: 'desc' },
              take: 1,
            },
            projectMemberships: true,
          },
        },
        roleGrants: true,
      },
    }),
    prisma.project.findMany({
      include: { projectMembers: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.sprint.findMany({
      orderBy: [{ createdAt: 'asc' }],
    }),
    prisma.task.findMany({
      include: {
        assignments: true,
        notes: {
          include: { author: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ boardOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.timesheetLine.findMany({
      include: {
        timesheet: { include: { user: true } },
        appliedRateVersion: true,
        disputes: {
          include: {
            messages: {
              include: { author: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
      orderBy: { workDate: 'desc' },
    }),
    prisma.contract.findMany({
      include: {
        project: true,
        rateVersions: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.invoiceDraft.findMany({
      include: { project: true, lines: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.planEntitlement.findMany(),
    prisma.auditEntry.findMany({
      include: { actorUser: true },
      orderBy: { occurredAtUtc: 'desc' },
      take: 60,
    }),
    handleBootstrapPhase2Data(),
    handleBootstrapPhase3Data(),
    handleBootstrapPhase4Data(),
  ])

  const taskById = new Map(dbTasks.map((t) => [t.id, t]))

  const superAdminEmails = Array.from(
    new Set([
      ...(
        process.env.SUPER_ADMIN_EMAILS ||
        process.env.VITE_SUPER_ADMIN_EMAILS ||
        'iamartseeker@gmail.com'
      )
        .toLowerCase()
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
      'iamartseeker@gmail.com',
    ])
  )

  const scopeToTenantIds =
    actor?.authEnforced && !actor.isSuperAdmin ? actor.tenantIds : null
  const allowTenant = (tid: string | null | undefined) =>
    !scopeToTenantIds || (Boolean(tid) && scopeToTenantIds.has(tid as string))

  const scopedTenants = dbTenants.filter((t) => allowTenant(t.id))
  const scopedMemberships = dbMemberships.filter((m) => allowTenant(m.tenantId))
  const scopedProjects = dbProjects.filter((p) => allowTenant(p.tenantId))
  const scopedSprints = dbSprints.filter((s) => allowTenant(s.tenantId))
  const scopedTasks = dbTasks.filter((t) => allowTenant(t.tenantId))
  const scopedTimesheetLines = dbTimesheetLines.filter((l) => allowTenant(l.tenantId))
  const scopedContracts = dbContracts.filter((c) => allowTenant(c.tenantId))
  const scopedInvoices = dbInvoices.filter((inv) => allowTenant(inv.tenantId))
  const scopedNotifications = dbNotifications.filter((n) => allowTenant(n.tenantId))
  const scopedAudits = dbAudits.filter((a) => allowTenant(a.tenantId))

  const scopedPhase2 = scopeToTenantIds
    ? {
        activityRollups: phase2.activityRollups.filter((r) => allowTenant(r.tenantId)),
        evidenceArtifacts: phase2.evidenceArtifacts.filter((r) => allowTenant(r.tenantId)),
        sessionAnnotations: phase2.sessionAnnotations.filter((r) => allowTenant(r.tenantId)),
        ideMappings: phase2.ideMappings.filter((r) => allowTenant(r.tenantId)),
        integrations: phase2.integrations.filter((r) => allowTenant(r.tenantId)),
        webhookReceipts: phase2.webhookReceipts.filter((r) => allowTenant(r.tenantId)),
        devices: phase2.devices.filter((r) => allowTenant(r.tenantId)),
        privacyExclusions: phase2.privacyExclusions.filter((r) => allowTenant(r.tenantId)),
        privacyAuditBatches: phase2.privacyAuditBatches.filter((r) => allowTenant(r.tenantId)),
      }
    : phase2

  const scopedPhase3 = scopeToTenantIds
    ? {
        ruleSets: phase3.ruleSets.filter((r) => allowTenant(r.tenantId)),
        correlationEdges: phase3.correlationEdges.filter((r) => allowTenant(r.tenantId)),
        aiGenerations: phase3.aiGenerations.filter((r) => allowTenant(r.tenantId)),
        disputes: phase3.disputes.filter((r) => allowTenant(r.tenantId)),
      }
    : phase3

  const scopedPhase4 = scopeToTenantIds
    ? {
        subscriptions: phase4.subscriptions.filter((r) => allowTenant(r.tenantId)),
        saasInvoices: phase4.saasInvoices.filter((r) => allowTenant(r.tenantId)),
        usageRecords: phase4.usageRecords.filter((r) => allowTenant(r.tenantId)),
        apiKeys: phase4.apiKeys.filter((r) => allowTenant(r.tenantId)),
        webhookEndpoints: phase4.webhookEndpoints.filter((r) => allowTenant(r.tenantId)),
        webhookDeliveries: phase4.webhookDeliveries.filter((r) => allowTenant(r.tenantId)),
        connectors: phase4.connectors.filter((r) => allowTenant(r.tenantId)),
        calendarMeetings: phase4.calendarMeetings.filter((r) => allowTenant(r.tenantId)),
        portableReports: phase4.portableReports.filter((r) => allowTenant(r.tenantId)),
      }
    : phase4

  const scopedRbac = scopeToTenantIds
    ? {
        ...rbac,
        roles: rbac.roles.filter((r) => r.isSystemRole || allowTenant(r.tenantId)),
        tenantOwnerPermissions: Object.fromEntries(
          Object.entries(rbac.tenantOwnerPermissions).filter(([tid]) => allowTenant(tid))
        ),
        memberGrantsByMembershipId: Object.fromEntries(
          scopedMemberships
            .filter((m) => Boolean(rbac.memberGrantsByMembershipId[m.id]))
            .map((m) => [m.id, rbac.memberGrantsByMembershipId[m.id]])
        ),
      }
    : rbac

  return {
    status,
    tenants: scopedTenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      timezone: t.defaultTimezone,
      currency: t.defaultCurrency,
      planTier: t.planTier as 'starter' | 'team' | 'agency' | 'enterprise',
      aiEnabled: t.aiEnabled,
      roundingRule: (t.settings?.roundingRule ?? 'none') as
        | 'none'
        | 'nearest_5m'
        | 'nearest_6m'
        | 'nearest_15m',
      paidBreakMinutesPerDay: t.settings?.paidBreakAllowanceMinutes ?? 15,
      weeklyCapMinutes: t.settings?.weeklyCapMinutes ?? 2400,
      brandingConfig: (t.settings?.brandingConfig ?? {}) as Record<string, unknown>,
      policyVersion: t.policyVersions[0]?.versionCode ?? 'v1.0-2026-11',
      policyVersions: t.policyVersions.map((pv) => ({
        id: pv.id,
        versionCode: pv.versionCode,
        summaryMarkdown: pv.summaryMarkdown,
        effectiveFrom: pv.effectiveFrom.toISOString(),
      })),
    })),
    members: scopedMemberships.map((m) => {
      const isSuper = superAdminEmails.includes(m.user.email.toLowerCase().trim())
      return {
        id: m.userId,
        membershipId: m.id,
        tenantId: m.tenantId,
        name: m.user.fullName,
        email: m.user.email,
        role: (isSuper ? 'super_admin' : (m.roleGrants[0]?.role ?? 'developer')) as
          | 'super_admin'
          | 'tenant_owner'
          | 'project_manager'
          | 'developer'
          | 'finance'
          | 'client_reviewer'
          | 'auditor',
        status: m.status as 'active' | 'invited' | 'suspended' | 'revoked',
        mfaEnabled: true,
        consentedPolicyVersion:
          m.user.policyConsents[0]?.policyVersion.versionCode ?? null,
        assignedProjectIds: m.user.projectMemberships
          .filter((pm) => pm.tenantId === m.tenantId)
          .map((pm) => pm.projectId),
        customPermissions: scopedRbac.memberGrantsByMembershipId[m.id] ?? [],
      }
    }),
    projects: scopedProjects.map((p) => ({
      id: p.id,
      tenantId: p.tenantId,
      code: p.code,
      name: p.name,
      clientName: p.clientName,
      status: p.status as 'active' | 'paused' | 'archived',
      description: p.description ?? '',
      boardConfig: (p.boardConfig ?? undefined) as Record<string, unknown> | undefined,
      members: p.projectMembers.map((pm) => ({
        id: pm.id,
        tenantId: pm.tenantId,
        projectId: pm.projectId,
        userId: pm.userId,
        projectRole: pm.projectRole,
        addedAt: pm.addedAt.toISOString(),
      })),
    })),
    sprints: scopedSprints.map((s) => ({
      id: s.id,
      tenantId: s.tenantId,
      projectId: s.projectId,
      name: s.name,
      goal: s.goal ?? '',
      status: s.status as 'planned' | 'active' | 'completed',
      startDate: s.startDate ? s.startDate.toISOString().slice(0, 10) : null,
      endDate: s.endDate ? s.endDate.toISOString().slice(0, 10) : null,
      createdAt: s.createdAt.toISOString(),
    })),
    tasks: scopedTasks.map((t) => ({
      id: t.id,
      tenantId: t.tenantId,
      projectId: t.projectId,
      parentTaskId: t.parentTaskId ?? undefined,
      sprintId: t.sprintId ?? null,
      code: t.code,
      title: t.title,
      description: t.description ?? '',
      acceptanceCriteria: t.acceptanceCriteria,
      issueType: (t.issueType || 'task') as 'epic' | 'story' | 'task' | 'bug' | 'subtask',
      status: t.status as 'backlog' | 'active' | 'review' | 'done',
      priority: t.priority as 'low' | 'medium' | 'high' | 'urgent',
      labels: t.labels ?? [],
      storyPoints: t.storyPoints ?? null,
      boardOrder: t.boardOrder ?? 0,
      estimateMinutes: t.estimateMinutes,
      isBillable: t.isBillable,
      defaultWorkMode: t.defaultWorkMode,
      assignedMemberIds: t.assignments.map((a) => a.userId),
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '',
      attachments: Array.from(new Set(t.notes.flatMap((n) => n.attachmentPaths))),
      notes: t.notes.map((n) => ({
        id: n.id,
        taskId: n.taskId,
        authorId: n.authorId,
        authorName: n.author?.fullName ?? 'Team Member',
        contentMarkdown: n.contentMarkdown,
        attachmentPaths: n.attachmentPaths ?? [],
        createdAt: n.createdAt.toISOString(),
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    timesheetLines: scopedTimesheetLines.map((l) => {
      const task = taskById.get(l.taskId)
      return {
        id: l.id,
        timesheetId: l.timesheetId,
        timesheetStatus: l.timesheet.status,
        tenantId: l.tenantId,
        projectId: l.timesheet.projectId,
        taskId: l.taskId,
        taskCode: task?.code ?? 'TASK',
        taskTitle: task?.title ?? 'Project Task',
        developerId: l.timesheet.userId,
        developerName: l.timesheet.user.fullName,
        workDate: l.workDate.toISOString().slice(0, 10),
        startTime: '09:00',
        endTime: '10:30',
        workMode: l.workMode,
        provenance: l.provenance,
        elapsedMinutes: Number(l.elapsedMinutes),
        claimedMinutes: Number(l.claimedMinutes),
        observedMinutes: Number(l.observedMinutes),
        supportedMinutes: Number(l.supportedMinutes),
        approvedBillableMinutes: Number(l.approvedBillableMinutes),
        evidenceStatus:
          l.lineStatus === 'approved' || l.lineStatus === 'adjusted_approved'
            ? 'approved'
            : l.lineStatus === 'needs_clarification'
              ? 'needs_clarification'
              : l.lineStatus === 'disputed' || l.lineStatus === 'rejected'
                ? 'disputed'
                : 'observed',
        snapshotHourlyRate: Number(l.snapshotHourlyRate),
        rateLabel: l.appliedRateVersion.versionLabel,
        developerNote: l.developerNote,
        managerComment: l.reviewerComment ?? undefined,
        disputeMessages: l.disputes.flatMap((d) =>
          d.messages.map((msg) => ({
            author: msg.author.fullName,
            role: 'member',
            text: msg.messageMarkdown,
            timestamp: msg.createdAt.toISOString(),
          }))
        ),
        isLocked: l.isLocked,
      }
    }),
    contracts: scopedContracts.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      projectId: c.projectId,
      projectName: c.project.name,
      clientName: c.project.clientName,
      roundingRule: c.roundingRule,
      paidBreakAllowanceMinutesPerDay: c.paidBreakMinutesPerDay,
      weeklyCapMinutes: c.weeklyCapMinutes,
      deepWorkNoInputWindowMinutes: 90,
      idleClarificationThresholdMinutes: 15,
      rateVersions: c.rateVersions.map((rv) => ({
        id: rv.id,
        effectiveFrom: '2026-10-01',
        effectiveTo: null,
        hourlyRate: Number(rv.hourlyRate),
        currency: c.currency,
        label: rv.versionLabel,
      })),
    })),
    invoices: scopedInvoices.map((inv) => ({
      id: inv.id,
      tenantId: inv.tenantId,
      invoiceNumber: inv.invoiceNumber,
      projectId: inv.projectId,
      projectName: inv.project.name,
      clientName: inv.clientName,
      currency: inv.currency,
      periodLabel: 'Current Billing Period',
      totalApprovedMinutes: inv.lines.reduce(
        (sum, ln) => sum + Number(ln.approvedMinutes),
        0
      ),
      subtotalAmount: Number(inv.subtotalAmount),
      taxPercent: Number(inv.taxRatePercent),
      taxAmount: Number(inv.taxAmount),
      totalAmount: Number(inv.totalAmount),
      status: inv.status,
      referenceCreditForInvoiceId: inv.referenceCreditForInvoiceId ?? undefined,
      createdAt: inv.createdAt.toISOString(),
      lines: inv.lines.map((ln) => ({
        lineId: ln.timesheetLineId,
        workDate: ln.workDate.toISOString().slice(0, 10),
        taskCode: 'TASK',
        description: ln.description,
        approvedMinutes: Number(ln.approvedMinutes),
        hourlyRate: Number(ln.snapshotHourlyRate),
        amount: Number(ln.lineTotal),
      })),
    })),
    notifications: scopedNotifications.map((n) => ({
      id: n.id,
      tenantId: n.tenantId,
      recipientUserId: n.recipientUserId,
      type: n.notificationType,
      title: n.title,
      body: n.body,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
    planEntitlements: dbEntitlements,
    auditLogs: scopedAudits.map((a) => ({
      id: a.id,
      tenantId: a.tenantId,
      actorName: a.actorUser?.fullName ?? 'System',
      actorRole: 'tenant_owner',
      actionType: a.actionType,
      targetEntity: a.targetEntity,
      reason: a.reason ?? '',
      timestamp: a.occurredAtUtc.toISOString(),
    })),
    phase2: scopedPhase2,
    phase3: scopedPhase3,
    phase4: scopedPhase4,
    rbac: scopedRbac,
  }
}

export async function handleCreateTenant(body: {
  name: string
  slug: string
  timezone: string
  currency: string
  ownerName: string
  ownerEmail: string
}) {
  const baseSlug =
    body.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '') || `workspace-${crypto.randomUUID().slice(0, 6)}`
  const normalizedOwnerEmail = body.ownerEmail.toLowerCase().trim()

  // Reject duplicate workspace slugs cleanly instead of silently appending random suffixes
  const preExistingSlug = await prisma.tenant.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  })
  if (preExistingSlug) {
    return {
      ok: false as const,
      statusCode: 409,
      error: `Workspace slug "${baseSlug}" already exists. Please choose a different workspace URL slug.`,
    }
  }

  // Ensure the owner exists in Supabase Auth before inserting into `public.user_profiles`
  // (which references `auth.users(id)`).
  const preExistingProfile = await prisma.userProfile.findFirst({
    where: { email: { equals: normalizedOwnerEmail, mode: 'insensitive' } },
    select: { id: true },
  })
  const authOwner = !preExistingProfile
    ? await ensureSupabaseAuthUser({
      email: normalizedOwnerEmail,
      name: body.ownerName.trim() || normalizedOwnerEmail.split('@')[0],
      role: 'tenant_owner',
      tenantName: body.name,
    })
    : null

  const created = await prisma.$transaction(async (tx) => {
    const existingSlug = await tx.tenant.findUnique({
      where: { slug: baseSlug },
      select: { id: true },
    })
    if (existingSlug) {
      throw new Error(
        `SLUG_CONFLICT:Workspace slug "${baseSlug}" already exists. Please choose a different workspace URL slug.`
      )
    }
    const slug = baseSlug

    const existingUser =
      (authOwner?.userId
        ? await tx.userProfile.findUnique({ where: { id: authOwner.userId } })
        : null) ||
      (await tx.userProfile.findFirst({
        where: { email: { equals: normalizedOwnerEmail, mode: 'insensitive' } },
      }))

    const user = existingUser
      ? await tx.userProfile.update({
        where: { id: existingUser.id },
        data: {
          fullName: body.ownerName.trim(),
          defaultTimezone: body.timezone,
        },
      })
      : await tx.userProfile.create({
        data: {
          id: authOwner?.userId || crypto.randomUUID(),
          email: normalizedOwnerEmail,
          fullName: body.ownerName.trim(),
          defaultTimezone: body.timezone,
        },
      })

    const tenant = await tx.tenant.create({
      data: {
        name: body.name,
        slug,
        defaultTimezone: body.timezone,
        defaultCurrency: body.currency,
        planTier: 'starter',
        status: 'active',
      },
    })

    await tx.tenantSettings.create({
      data: {
        tenantId: tenant.id,
        roundingRule: 'none',
        paidBreakAllowanceMinutes: 15,
        weeklyCapMinutes: 2400,
      },
    })

    const policy = await tx.policyVersion.create({
      data: {
        tenantId: tenant.id,
        versionCode: 'v1.0-2026-11',
        summaryMarkdown: 'Privacy-first baseline policy.',
        publishedBy: user.id,
      },
    })

    await tx.policyConsent.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        policyVersionId: policy.id,
      },
    })

    const membership = await tx.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        status: 'active',
        joinedAt: new Date(),
      },
    })

    await tx.roleGrant.create({
      data: {
        tenantId: tenant.id,
        membershipId: membership.id,
        role: 'tenant_owner',
      },
    })

    await tx.auditEntry.create({
      data: {
        tenantId: tenant.id,
        actorUserId: user.id,
        actionType: 'TENANT_PROVISIONED',
        targetEntity: `tenants:${tenant.slug}`,
        targetId: tenant.id,
        reason: `Provisioned new workspace ${tenant.name}`,
      },
    })

    return { tenant, user }
  })

  return { ok: true, tenantId: created.tenant.id, ownerId: created.user.id, slug: created.tenant.slug }
}

export async function handleRecordSession(body: {
  tenantId: string
  userId: string
  projectId: string
  taskId: string
  workDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  breakMinutes: number
  workMode: string
  provenance: 'desktop_timer' | 'web_timer' | 'manual_entry'
  developerNote: string
  manualReason?: string
  hourlyRate: number
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId) || !isValidUuid(body.projectId) || !isValidUuid(body.taskId)) {
    return { ok: false, error: 'Non-UUID fixture IDs; seed Supabase to persist.' }
  }

  const startIso = `${body.workDate}T${body.startTime}:00Z`
  const endIso = `${body.workDate}T${body.endTime}:00Z`
  const netMinutes = Math.max(0, body.durationMinutes - (body.breakMinutes || 0))
  const isDeepWork = ['thinking', 'design', 'research', 'meeting'].includes(body.workMode)

  const result = await prisma.$transaction(async (tx) => {
    const policy = await tx.policyVersion.findFirst({
      where: { tenantId: body.tenantId },
      orderBy: { effectiveFrom: 'desc' },
    })
    if (!policy) {
      throw new Error('No active policy_version found for tenant.')
    }

    const session = await tx.workSession.create({
      data: {
        tenantId: body.tenantId,
        userId: body.userId,
        projectId: body.projectId,
        taskId: body.taskId,
        provenance: body.provenance,
        lifecycleState: 'completed',
        currentWorkMode: body.workMode,
        startedAtUtc: new Date(startIso),
        endedAtUtc: new Date(endIso),
        monotonicDurationMs: netMinutes * 60000,
        sessionNotes: body.developerNote,
        manualReason: body.manualReason ?? null,
        policyVersionId: policy.id,
      },
    })

    if (body.breakMinutes > 0) {
      await tx.break.create({
        data: {
          tenantId: body.tenantId,
          userId: body.userId,
          sessionId: session.id,
          breakType: 'unpaid',
          startedAtUtc: new Date(startIso),
          endedAtUtc: new Date(new Date(startIso).getTime() + body.breakMinutes * 60000),
        },
      })
    }

    // Ensure contract & rate version exist for timesheet
    let contract = await tx.contract.findFirst({
      where: { tenantId: body.tenantId, projectId: body.projectId },
      include: { rateVersions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!contract) {
      contract = await tx.contract.create({
        data: {
          tenantId: body.tenantId,
          projectId: body.projectId,
          title: 'Project Standard Contract',
          currency: 'USD',
        },
        include: { rateVersions: true },
      })
    }

    let rateVersionId = contract.rateVersions[0]?.id
    if (!rateVersionId) {
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public.contract_rate_versions (tenant_id, contract_id, version_label, effective_period, hourly_rate)
        VALUES (${body.tenantId}::uuid, ${contract.id}::uuid, 'Standard Rate', '[2026-01-01,)'::daterange, ${body.hourlyRate})
        RETURNING id
      `
      rateVersionId = inserted[0].id
    }

    // Insert canonical non-overlapping time_segment using raw SQL for tstzrange GiST enforcement
    const segRows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO public.time_segments (
        tenant_id, user_id, project_id, task_id, session_id, work_date,
        segment_range, work_mode, provenance, evidence_status,
        elapsed_minutes, claimed_minutes, observed_minutes, supported_minutes, developer_explanation
      )
      VALUES (
        ${body.tenantId}::uuid,
        ${body.userId}::uuid,
        ${body.projectId}::uuid,
        ${body.taskId}::uuid,
        ${session.id}::uuid,
        ${body.workDate}::date,
        tstzrange(${startIso}::timestamptz, ${endIso}::timestamptz, '[)'),
        ${body.workMode},
        ${body.provenance},
        ${body.provenance === 'manual_entry' ? 'needs_clarification' : isDeepWork ? 'context_added' : 'observed'},
        ${body.durationMinutes},
        ${netMinutes},
        ${isDeepWork || body.provenance === 'manual_entry' ? 0 : netMinutes},
        ${netMinutes},
        ${body.developerNote}
      )
      RETURNING id
    `
    const segmentId = segRows[0].id

    // Upsert weekly timesheet container
    const workDateObj = new Date(`${body.workDate}T00:00:00Z`)
    const day = workDateObj.getUTCDay() || 7
    const monday = new Date(workDateObj)
    monday.setUTCDate(workDateObj.getUTCDate() - (day - 1))
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)

    const timesheet = await tx.timesheet.upsert({
      where: {
        tenantId_userId_projectId_periodStart_periodEnd: {
          tenantId: body.tenantId,
          userId: body.userId,
          projectId: body.projectId,
          periodStart: monday,
          periodEnd: sunday,
        },
      },
      update: {},
      create: {
        tenantId: body.tenantId,
        userId: body.userId,
        projectId: body.projectId,
        contractId: contract.id,
        periodStart: monday,
        periodEnd: sunday,
        status: 'draft',
      },
    })

    const line = await tx.timesheetLine.create({
      data: {
        tenantId: body.tenantId,
        timesheetId: timesheet.id,
        segmentId,
        taskId: body.taskId,
        workDate: workDateObj,
        workMode: body.workMode,
        provenance: body.provenance,
        elapsedMinutes: body.durationMinutes,
        claimedMinutes: netMinutes,
        observedMinutes: isDeepWork || body.provenance === 'manual_entry' ? 0 : netMinutes,
        supportedMinutes: netMinutes,
        approvedBillableMinutes: 0,
        appliedRateVersionId: rateVersionId,
        snapshotHourlyRate: body.hourlyRate,
        lineStatus: body.provenance === 'manual_entry' ? 'needs_clarification' : 'pending_review',
        developerNote: body.developerNote,
      },
    })

    await tx.auditEntry.create({
      data: {
        tenantId: body.tenantId,
        actorUserId: body.userId,
        actionType: body.provenance === 'manual_entry' ? 'MANUAL_TIME_ENTRY_ADDED' : 'WORK_SESSION_RECORDED',
        targetEntity: `timesheet_lines:${line.id}`,
        targetId: line.id,
        reason: body.manualReason ?? `Recorded ${netMinutes}m in ${body.workMode} mode`,
      },
    })

    return { lineId: line.id, timesheetId: timesheet.id }
  })

  return { ok: true, ...result }
}

