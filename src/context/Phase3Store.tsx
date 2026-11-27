/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  AiGenerationRecord,
  AiTargetType,
  DisputeRecord,
  DisputeStatus,
  EvidenceCorrelationEdgeRecord,
  PolicySimulationReport,
  RawTimeSliceInput,
  TaskEffortVarianceSummary,
  UnusualPatternAlert,
  VerificationRuleConfig,
  VerificationRuleSetRecord,
  WorkModeSuggestion,
} from '@/types/domain.types'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store } from '@/context/Phase2Store'
import { PHASE4_PLAN_CATALOG } from '@/lib/phase4/saasBilling'
import { notifyError } from '@/lib/notify'
import {
  DEFAULT_VERIFICATION_RULE_CONFIG,
  detectUnusualPatternAlerts,
  evaluateSegmentsWithRuleSet,
  simulateRuleSetImpact,
  suggestWorkModeFromSignals,
} from '@/lib/phase3/rulesEngine'
import {
  buildEvidenceCorrelationGraph,
  computeTaskEffortVariances,
} from '@/lib/phase3/correlationGraph'
import { generateGuardrailedAiDraft } from '@/lib/phase3/aiAssistant'
import {
  createAiGenerationViaPrisma,
  decideAiGenerationViaPrisma,
  fetchGeminiStatusViaApi,
  generateGeminiDraftViaApi,
  openDisputeViaPrisma,
  performDisputeActionViaPrisma,
  publishRuleSetViaPrisma,
  toggleTenantAiViaPrisma,
} from '@/lib/prismaApiClient'

interface Phase3StoreContextValue {
  aiEnabled: boolean
  aiServerStatus: { configured: boolean; model: string }
  toggleTenantAi: (enabled: boolean) => void
  ruleSets: VerificationRuleSetRecord[]
  activeRuleSet: VerificationRuleSetRecord
  simulateDraftRuleSet: (
    draftConfig: VerificationRuleConfig,
    draftLabel: string
  ) => PolicySimulationReport
  publishRuleSet: (
    versionLabel: string,
    rulesConfig: VerificationRuleConfig,
    simulationSummary?: PolicySimulationReport
  ) => { ok: boolean; message: string }
  workModeSuggestions: WorkModeSuggestion[]
  dismissWorkModeSuggestion: (id: string) => void
  correlationEdges: EvidenceCorrelationEdgeRecord[]
  taskVariances: TaskEffortVarianceSummary[]
  unusualPatternAlerts: UnusualPatternAlert[]
  aiGenerations: AiGenerationRecord[]
  generateAiDraft: (
    targetType: AiTargetType,
    targetId: string
  ) => Promise<{ ok: boolean; generation: AiGenerationRecord; message: string }>
  approveAiGeneration: (id: string, editedMarkdown: string) => void
  discardAiGeneration: (id: string) => void
  disputes: DisputeRecord[]
  openStructuredDispute: (input: {
    timesheetLineId: string
    disputedMinutes: number
    reason: string
    dueDate?: string
    requestedEvidenceType?: string
    assignedReviewerId?: string
    messageType?: 'clarification_request' | 'developer_appeal'
    attachedArtifactIds?: string[]
  }) => { ok: boolean; message: string }
  replyToStructuredDispute: (input: {
    disputeId: string
    messageMarkdown: string
    attachedArtifactIds?: string[]
  }) => { ok: boolean; message: string }
  escalateStructuredDispute: (input: {
    disputeId: string
    escalatedReviewerId: string
    reason: string
  }) => { ok: boolean; message: string }
  resolveStructuredDispute: (input: {
    disputeId: string
    resolutionStatus: 'resolved_accepted' | 'resolved_adjusted' | 'resolved_upheld'
    adjustedApprovedMinutes: number
    resolutionSummary: string
  }) => { ok: boolean; message: string }
}

const Phase3StoreContext = createContext<Phase3StoreContextValue | null>(null)

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n))
  if (Number.isNaN(h) || Number.isNaN(m)) return 540
  return h * 60 + m
}

export function Phase3StoreProvider({ children }: { children: ReactNode }) {
  const {
    activeTenant,
    activeUser,
    members,
    tasks,
    contractPolicy,
    timesheetLines,
    prismaStatus,
    phase3Bootstrap,
    resolveDisputeLineAdjust,
  } = usePhase1Store()
  const {
    activityRollups,
    evidenceArtifacts,
    sessionAnnotations,
    ideMappings,
    privacyAuditBatches,
  } = usePhase2Store()

  const [syncedBootstrap, setSyncedBootstrap] = useState(phase3Bootstrap)
  const [aiEnabledByTenant, setAiEnabledByTenant] = useState<Record<string, boolean>>({})
  const [allRuleSets, setAllRuleSets] = useState<VerificationRuleSetRecord[]>(
    () => phase3Bootstrap?.ruleSets ?? []
  )
  const [allAiGenerations, setAllAiGenerations] = useState<AiGenerationRecord[]>(
    () => phase3Bootstrap?.aiGenerations ?? []
  )
  const [allDisputes, setAllDisputes] = useState<DisputeRecord[]>(
    () => phase3Bootstrap?.disputes ?? []
  )
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(
    () => new Set()
  )
  const [aiServerStatus, setAiServerStatus] = useState<{
    configured: boolean
    model: string
  }>({ configured: false, model: 'gemini-2.5-flash' })

  useEffect(() => {
    let active = true
    void fetchGeminiStatusViaApi().then((st) => {
      if (active) setAiServerStatus(st)
    })
    return () => {
      active = false
    }
  }, [])

  if (phase3Bootstrap !== syncedBootstrap) {
    setSyncedBootstrap(phase3Bootstrap)
    setAllRuleSets(phase3Bootstrap?.ruleSets ?? [])
    setAllAiGenerations(phase3Bootstrap?.aiGenerations ?? [])
    setAllDisputes(phase3Bootstrap?.disputes ?? [])
  }

  const planAllowsAi =
    PHASE4_PLAN_CATALOG[activeTenant.planTier || 'starter'].aiAssistanceAvailable

  const aiEnabled =
    planAllowsAi &&
    (aiEnabledByTenant[activeTenant.id] ?? Boolean(activeTenant.aiEnabled))

  const tenantRuleSets = useMemo(() => {
    const existing = allRuleSets.filter((r) => r.tenantId === activeTenant.id)
    if (existing.length > 0) return existing
    const baseline: VerificationRuleSetRecord = {
      id: `rs-baseline-${activeTenant.id || 'local'}`,
      tenantId: activeTenant.id,
      versionNumber: 1,
      versionLabel: 'v1.0 Privacy-First Baseline',
      effectiveFrom: new Date('2026-11-01T00:00:00Z').toISOString(),
      status: 'active',
      rulesConfig: {
        ...DEFAULT_VERIFICATION_RULE_CONFIG,
        idleClarificationThresholdMinutes:
          contractPolicy.idleClarificationThresholdMinutes || 15,
        deepWorkNoInputWindowMinutes:
          contractPolicy.deepWorkNoInputWindowMinutes || 90,
      },
      createdByName: 'System Governance',
      createdAt: new Date('2026-11-01T00:00:00Z').toISOString(),
    }
    return [baseline]
  }, [allRuleSets, activeTenant.id, contractPolicy])

  const activeRuleSet =
    tenantRuleSets.find((r) => r.status === 'active') ?? tenantRuleSets[0]

  // Convert live timesheet lines + phase 2 rollups/artifacts into RawTimeSliceInput[]
  // for deterministic rule evaluation & policy simulation.
  const syntheticSlices: RawTimeSliceInput[] = useMemo(() => {
    return timesheetLines.map((line) => {
      const matchingArtifacts = evidenceArtifacts
        .filter((a) => a.taskId === line.taskId && a.workDate === line.workDate)
        .map((a) => ({
          id: a.id,
          sourceType:
            a.sourceType === 'github_commit' ||
              a.sourceType === 'github_pr' ||
              a.sourceType === 'github_review' ||
              a.sourceType === 'github_ci' ||
              a.sourceType === 'vscode_debug' ||
              a.sourceType === 'vscode_test' ||
              a.sourceType === 'vscode_workspace' ||
              a.sourceType === 'session_note'
              ? a.sourceType
              : ('session_note' as const),
          externalId: a.externalId,
          occurredAtUtc: a.occurredAtUtc,
          summaryTitle: a.summaryTitle,
          linkType: a.linkType,
          linkConfidence: a.linkConfidence,
          linkRationale: a.linkRationale,
        }))

      const startMin = parseTimeToMinutes(line.startTime)
      const endMin = Math.max(startMin + 5, parseTimeToMinutes(line.endTime))

      return {
        id: line.id,
        deviceId: 'dev-workspace',
        deviceName: line.provenance,
        workDate: line.workDate,
        startMinuteOfDay: startMin,
        endMinuteOfDay: endMin,
        workMode: line.workMode,
        provenance: line.provenance,
        appCategory:
          line.workMode === 'research'
            ? 'docs_browser'
            : line.workMode === 'meeting'
              ? 'communication'
              : line.observedMinutes > 0
                ? 'ide'
                : 'unobserved',
        hasInputSignal: line.observedMinutes > 0,
        developerNote: line.developerNote || undefined,
        artifacts: matchingArtifacts,
      }
    })
  }, [timesheetLines, evidenceArtifacts])

  const evaluatedSegments = useMemo(() => {
    const avgEstimate =
      tasks.length > 0
        ? Math.round(tasks.reduce((s, t) => s + t.estimateMinutes, 0) / tasks.length)
        : 240
    return evaluateSegmentsWithRuleSet(
      syntheticSlices,
      contractPolicy,
      avgEstimate,
      activeRuleSet.rulesConfig
    )
  }, [syntheticSlices, contractPolicy, tasks, activeRuleSet])

  const workModeSuggestions = useMemo(() => {
    return suggestWorkModeFromSignals(activityRollups, evidenceArtifacts).filter(
      (s) => !dismissedSuggestionIds.has(s.id)
    )
  }, [activityRollups, evidenceArtifacts, dismissedSuggestionIds])

  const correlationEdges = useMemo(() => {
    return buildEvidenceCorrelationGraph(
      activeTenant.id,
      tasks,
      timesheetLines,
      activityRollups,
      evidenceArtifacts,
      sessionAnnotations
    )
  }, [
    activeTenant.id,
    tasks,
    timesheetLines,
    activityRollups,
    evidenceArtifacts,
    sessionAnnotations,
  ])

  const taskVariances = useMemo(() => {
    return computeTaskEffortVariances(
      tasks,
      timesheetLines,
      evidenceArtifacts,
      activeRuleSet.rulesConfig.estimateVarianceAlertPercent
    )
  }, [tasks, timesheetLines, evidenceArtifacts, activeRuleSet])

  const unusualPatternAlerts = useMemo(() => {
    return detectUnusualPatternAlerts(
      evaluatedSegments,
      taskVariances,
      activeRuleSet.rulesConfig.estimateVarianceAlertPercent
    )
  }, [evaluatedSegments, taskVariances, activeRuleSet])

  function toggleTenantAi(enabled: boolean) {
    if (enabled && !planAllowsAi) {
      notifyError(
        `AI Evidence Assistance requires the Team plan or higher (currently on ${(activeTenant.planTier || 'starter').toUpperCase()}).`
      )
      return
    }
    setAiEnabledByTenant((prev) => ({ ...prev, [activeTenant.id]: enabled }))
    if (prismaStatus.connected && activeTenant.id) {
      void toggleTenantAiViaPrisma({
        tenantId: activeTenant.id,
        aiEnabled: enabled,
        actorUserId: activeUser.id,
      })
    }
  }

  function simulateDraftRuleSet(
    draftConfig: VerificationRuleConfig,
    draftLabel: string
  ): PolicySimulationReport {
    const avgEstimate =
      tasks.length > 0
        ? Math.round(tasks.reduce((s, t) => s + t.estimateMinutes, 0) / tasks.length)
        : 240
    return simulateRuleSetImpact(
      syntheticSlices,
      contractPolicy,
      avgEstimate,
      activeRuleSet.rulesConfig,
      draftConfig,
      draftLabel
    )
  }

  function publishRuleSet(
    versionLabel: string,
    rulesConfig: VerificationRuleConfig,
    simulationSummary?: PolicySimulationReport
  ): { ok: boolean; message: string } {
    if (!versionLabel.trim()) {
      return { ok: false, message: 'Provide a version label before publishing.' }
    }
    const nextVersion =
      Math.max(0, ...tenantRuleSets.map((r) => r.versionNumber)) + 1

    const newSet: VerificationRuleSetRecord = {
      id: `rs-${Date.now()}`,
      tenantId: activeTenant.id,
      versionNumber: nextVersion,
      versionLabel: versionLabel.trim(),
      effectiveFrom: new Date().toISOString(),
      status: 'active',
      rulesConfig,
      createdByName: activeUser.name,
      createdAt: new Date().toISOString(),
    }

    setAllRuleSets((prev) => [
      newSet,
      ...prev
        .filter((r) => r.tenantId === activeTenant.id)
        .map((r) => ({ ...r, status: 'superseded' as const })),
      ...prev.filter((r) => r.tenantId !== activeTenant.id),
    ])

    if (prismaStatus.connected && activeTenant.id) {
      void publishRuleSetViaPrisma({
        tenantId: activeTenant.id,
        versionNumber: nextVersion,
        versionLabel: versionLabel.trim(),
        rulesConfig: rulesConfig as unknown as Record<string, unknown>,
        simulationSummary: simulationSummary as unknown as Record<string, unknown>,
        createdBy: activeUser.id,
      })
    }

    return {
      ok: true,
      message: `Published Verification Rule Set v${nextVersion} (${versionLabel.trim()}) effective going forward; historical approved periods remain untouched.`,
    }
  }

  function dismissWorkModeSuggestion(id: string) {
    setDismissedSuggestionIds((prev) => new Set(prev).add(id))
  }

  async function generateAiDraft(
    targetType: AiTargetType,
    targetId: string
  ): Promise<{ ok: boolean; generation: AiGenerationRecord; message: string }> {
    const validEventIds = new Set<string>([
      ...activityRollups.map((r) => r.id),
      ...privacyAuditBatches.map((b) => b.batchId),
    ])
    const validArtifactIds = new Set<string>(evidenceArtifacts.map((a) => a.id))

    const targetTask = tasks.find((t) => t.id === targetId) ?? tasks[0]
    const matchingLines = targetTask
      ? timesheetLines.filter((l) => l.taskId === targetTask.id)
      : timesheetLines
    const matchingArtifacts = targetTask
      ? evidenceArtifacts.filter((a) => a.taskId === targetTask.id)
      : evidenceArtifacts
    const matchingRollups = targetTask
      ? activityRollups.filter((r) => r.taskId === targetTask.id)
      : activityRollups
    const matchingMapping = ideMappings.find(
      (m) => !targetTask || m.taskId === targetTask.id
    )

    const candidateEventIds = matchingRollups.slice(0, 4).map((r) => r.id)
    const candidateArtifactIds = matchingArtifacts.slice(0, 4).map((a) => a.id)

    const claimedMinutes = matchingLines.reduce((s, l) => s + l.claimedMinutes, 0)
    const supportedMinutes = matchingLines.reduce((s, l) => s + l.supportedMinutes, 0)
    const workModes = Array.from(new Set(matchingLines.map((l) => l.workMode)))
    const unresolvedCount = matchingLines.filter(
      (l) => l.evidenceStatus === 'needs_clarification' || l.evidenceStatus === 'disputed'
    ).length

    const baseGeneration = generateGuardrailedAiDraft({
      tenantId: activeTenant.id,
      aiEnabled,
      userId: activeUser.id,
      targetType,
      targetId: targetTask?.id ?? targetId,
      targetLabel: targetTask ? `${targetTask.code} · ${targetTask.title}` : 'Workspace',
      rawContextPayload: {
        tenant_id: activeTenant.id,
        target_type: targetType,
        task_code: targetTask?.code ?? 'WORKSPACE',
        task_title: targetTask?.title ?? 'Workspace Summary',
        work_modes: workModes,
        claimed_minutes: claimedMinutes,
        supported_minutes: supportedMinutes,
        artifact_summaries: matchingArtifacts.map((a) => a.summaryTitle),
        branch_name: matchingMapping?.branchName ?? 'main',
        repo_name: matchingMapping?.repoFullName ?? 'devproof/tiktrack',
        // Sanitizer strips private/blocked fields before any payload leaves the browser:
        keystrokes: 'stripped_by_sanitizer',
        window_title_raw: '/Users/dev/secret.env',
      },
      candidateEventIds,
      candidateArtifactIds,
      validTenantEventIds: validEventIds,
      validTenantArtifactIds: validArtifactIds,
      summaryContext: {
        taskCode: targetTask?.code,
        taskTitle: targetTask?.title,
        claimedMinutes,
        supportedMinutes,
        workModes,
        artifactTitles: matchingArtifacts.map((a) => a.summaryTitle),
        gapMinutes:
          matchingRollups.find((r) => r.isObservationGap)?.durationMinutes ?? 20,
        branchName: matchingMapping?.branchName,
        repoName: matchingMapping?.repoFullName,
        unresolvedCount,
        clusterCount: unusualPatternAlerts.length,
      },
    })

    let generation: AiGenerationRecord = baseGeneration
    let statusMessage: string

    if (aiEnabled) {
      const citedIds = [
        ...baseGeneration.citedEventIds.map((id) => `event:${id.slice(0, 8)}`),
        ...baseGeneration.citedArtifactIds.map((id) => `artifact:${id.slice(0, 8)}`),
      ]
      const geminiRes = await generateGeminiDraftViaApi({
        targetType,
        targetLabel: baseGeneration.targetLabel,
        sanitizedPayload: baseGeneration.sanitizedPromptPayload,
        citedIds,
      })

      if (geminiRes?.ok && geminiRes.draftMarkdown) {
        setAiServerStatus({ configured: true, model: geminiRes.modelId })
        generation = {
          ...baseGeneration,
          generationMode: 'ai_guardrailed',
          modelId: geminiRes.modelId,
          draftMarkdown: geminiRes.draftMarkdown,
          tokensUsed: geminiRes.tokensUsed ?? baseGeneration.tokensUsed,
        }
        statusMessage = `Generated live Gemini summary (${geminiRes.modelId}, ${generation.tokensUsed} tokens). Review & edit before approving.`
      } else {
        // Graceful fallback to deterministic template if GEMINI_API_KEY is missing or API failed
        if (geminiRes) {
          setAiServerStatus({
            configured: geminiRes.configured,
            model: geminiRes.modelId,
          })
        }
        generation = {
          ...baseGeneration,
          generationMode: 'deterministic_template',
          modelId: 'deterministic-template-v1',
          tokensUsed: 0,
        }
        statusMessage = geminiRes?.configured === false
          ? 'GEMINI_API_KEY not found in .env yet - generated using built-in template (0 tokens). Add GEMINI_API_KEY to .env and restart server to enable live Gemini.'
          : `Gemini unavailable (${geminiRes?.error ?? 'network error'}) - fell back to built-in template.`
      }
    } else {
      statusMessage =
        'AI Assistant is OFF - generated using built-in template (0 tokens).'
    }

    setAllAiGenerations((prev) => [generation, ...prev])

    if (prismaStatus.connected && activeTenant.id) {
      void createAiGenerationViaPrisma({
        tenantId: activeTenant.id,
        userId: activeUser.id,
        targetType: generation.targetType,
        targetId: generation.targetId,
        generationMode: generation.generationMode,
        modelId: generation.modelId,
        promptVersion: generation.promptVersion,
        sanitizedPromptPayload: generation.sanitizedPromptPayload,
        citedEventIds: generation.citedEventIds,
        citedArtifactIds: generation.citedArtifactIds,
        draftMarkdown: generation.draftMarkdown,
        tokensUsed: generation.tokensUsed,
      })
    }

    return {
      ok: true,
      generation,
      message: statusMessage,
    }
  }

  function approveAiGeneration(id: string, editedMarkdown: string) {
    setAllAiGenerations((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
            ...g,
            status: 'edited_approved',
            humanApprovedMarkdown: editedMarkdown,
            approvedByName: activeUser.name,
            approvedAt: new Date().toISOString(),
          }
          : g
      )
    )
    if (prismaStatus.connected) {
      void decideAiGenerationViaPrisma({
        generationId: id,
        status: 'edited_approved',
        humanApprovedMarkdown: editedMarkdown,
        approvedByUserId: activeUser.id,
      })
    }
  }

  function discardAiGeneration(id: string) {
    setAllAiGenerations((prev) =>
      prev.map((g) => (g.id === id ? { ...g, status: 'discarded' } : g))
    )
    if (prismaStatus.connected) {
      void decideAiGenerationViaPrisma({
        generationId: id,
        status: 'discarded',
      })
    }
  }

  function openStructuredDispute(input: {
    timesheetLineId: string
    disputedMinutes: number
    reason: string
    dueDate?: string
    requestedEvidenceType?: string
    assignedReviewerId?: string
    messageType?: 'clarification_request' | 'developer_appeal'
    attachedArtifactIds?: string[]
  }): { ok: boolean; message: string } {
    if (input.reason.trim().length < 10) {
      return {
        ok: false,
        message: 'Dispute or clarification request requires at least 10 characters.',
      }
    }
    const line = timesheetLines.find((l) => l.id === input.timesheetLineId)
    if (!line) return { ok: false, message: 'Timesheet line not found.' }

    const assignedReviewer =
      members.find((m) => m.id === input.assignedReviewerId) ??
      members.find((m) => m.role === 'project_manager' || m.role === 'tenant_owner')

    const initialStatus: DisputeStatus =
      input.messageType === 'clarification_request' ? 'awaiting_developer' : 'open'

    const newDispute: DisputeRecord = {
      id: `disp-${Date.now()}`,
      tenantId: activeTenant.id,
      timesheetId: line.timesheetId ?? `ts-${line.projectId}`,
      timesheetLineId: line.id,
      taskCode: line.taskCode,
      taskTitle: line.taskTitle,
      developerId: line.developerId,
      developerName: line.developerName,
      openedByUserId: activeUser.id,
      openedByName: activeUser.name,
      assignedReviewerId: assignedReviewer?.id,
      assignedReviewerName: assignedReviewer?.name,
      dueDate: input.dueDate || undefined,
      requestedEvidenceType: input.requestedEvidenceType || undefined,
      status: initialStatus,
      disputedMinutes: input.disputedMinutes,
      reason: input.reason.trim(),
      policyVersionCode: activeTenant.policyVersion,
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: `dmsg-${Date.now()}`,
          authorUserId: activeUser.id,
          authorName: activeUser.name,
          authorRole: activeUser.role,
          messageType: input.messageType ?? 'developer_appeal',
          messageMarkdown: input.reason.trim(),
          attachedArtifactIds: input.attachedArtifactIds ?? [],
          createdAt: new Date().toISOString(),
        },
      ],
    }

    setAllDisputes((prev) => [newDispute, ...prev])

    if (prismaStatus.connected && line.timesheetId) {
      void openDisputeViaPrisma({
        tenantId: activeTenant.id,
        timesheetId: line.timesheetId,
        timesheetLineId: line.id,
        openedByUserId: activeUser.id,
        assignedReviewerId: assignedReviewer?.id,
        dueDate: input.dueDate,
        requestedEvidenceType: input.requestedEvidenceType,
        disputedMinutes: input.disputedMinutes,
        reason: input.reason.trim(),
        messageType: input.messageType,
        attachedArtifactIds: input.attachedArtifactIds,
      })
    }

    return {
      ok: true,
      message: `Opened structured ${input.messageType === 'clarification_request' ? 'clarification request' : 'appeal'} on ${line.taskCode} (${input.disputedMinutes}m).`,
    }
  }

  function replyToStructuredDispute(input: {
    disputeId: string
    messageMarkdown: string
    attachedArtifactIds?: string[]
  }): { ok: boolean; message: string } {
    if (input.messageMarkdown.trim().length < 3) {
      return { ok: false, message: 'Reply message must be at least 3 characters.' }
    }
    const target = allDisputes.find((d) => d.id === input.disputeId)
    if (!target) return { ok: false, message: 'Dispute not found.' }

    const isDeveloperReply = activeUser.role === 'developer'
    const nextStatus: DisputeStatus = isDeveloperReply
      ? 'awaiting_manager'
      : 'awaiting_developer'

    setAllDisputes((prev) =>
      prev.map((d) =>
        d.id === input.disputeId
          ? {
            ...d,
            status: d.status === 'escalated' ? 'escalated' : nextStatus,
            messages: [
              ...d.messages,
              {
                id: `dmsg-${Date.now()}`,
                authorUserId: activeUser.id,
                authorName: activeUser.name,
                authorRole: activeUser.role,
                messageType: isDeveloperReply ? 'developer_appeal' : 'reviewer_note',
                messageMarkdown: input.messageMarkdown.trim(),
                attachedArtifactIds: input.attachedArtifactIds ?? [],
                createdAt: new Date().toISOString(),
              },
            ],
          }
          : d
      )
    )

    if (prismaStatus.connected) {
      void performDisputeActionViaPrisma({
        action: 'reply',
        tenantId: activeTenant.id,
        disputeId: input.disputeId,
        actorUserId: activeUser.id,
        messageMarkdown: input.messageMarkdown.trim(),
        attachedArtifactIds: input.attachedArtifactIds,
      })
    }

    return { ok: true, message: 'Appended immutable response to dispute thread.' }
  }

  function escalateStructuredDispute(input: {
    disputeId: string
    escalatedReviewerId: string
    reason: string
  }): { ok: boolean; message: string } {
    const target = allDisputes.find((d) => d.id === input.disputeId)
    if (!target) return { ok: false, message: 'Dispute not found.' }

    if (
      !input.escalatedReviewerId ||
      input.escalatedReviewerId === target.assignedReviewerId ||
      input.escalatedReviewerId === target.openedByUserId
    ) {
      return {
        ok: false,
        message:
          'Independent Second Review (F3-033) requires choosing a reviewer distinct from the original reviewer and appellant.',
      }
    }

    if (input.reason.trim().length < 5) {
      return { ok: false, message: 'Escalation reason (>= 5 chars) is required.' }
    }

    const secondReviewer = members.find((m) => m.id === input.escalatedReviewerId)

    setAllDisputes((prev) =>
      prev.map((d) =>
        d.id === input.disputeId
          ? {
            ...d,
            status: 'escalated',
            escalatedReviewerId: input.escalatedReviewerId,
            escalatedReviewerName: secondReviewer?.name ?? 'Second Reviewer',
            escalationReason: input.reason.trim(),
            messages: [
              ...d.messages,
              {
                id: `dmsg-${Date.now()}`,
                authorUserId: activeUser.id,
                authorName: activeUser.name,
                authorRole: activeUser.role,
                messageType: 'escalation',
                messageMarkdown: `Escalated to independent second reviewer (${secondReviewer?.name ?? 'Reviewer'}): ${input.reason.trim()}`,
                attachedArtifactIds: [],
                createdAt: new Date().toISOString(),
              },
            ],
          }
          : d
      )
    )

    if (prismaStatus.connected) {
      void performDisputeActionViaPrisma({
        action: 'escalate',
        tenantId: activeTenant.id,
        disputeId: input.disputeId,
        actorUserId: activeUser.id,
        escalatedReviewerId: input.escalatedReviewerId,
        messageMarkdown: input.reason.trim(),
      })
    }

    return {
      ok: true,
      message: `Dispute escalated to independent second reviewer ${secondReviewer?.name ?? ''}.`,
    }
  }

  function resolveStructuredDispute(input: {
    disputeId: string
    resolutionStatus: 'resolved_accepted' | 'resolved_adjusted' | 'resolved_upheld'
    adjustedApprovedMinutes: number
    resolutionSummary: string
  }): { ok: boolean; message: string } {
    if (input.resolutionSummary.trim().length < 5) {
      return { ok: false, message: 'Resolution summary (>= 5 chars) is required.' }
    }
    const target = allDisputes.find((d) => d.id === input.disputeId)
    if (!target) return { ok: false, message: 'Dispute not found.' }

    const lineAdjustRes = resolveDisputeLineAdjust(
      target.timesheetLineId,
      input.adjustedApprovedMinutes,
      input.resolutionSummary.trim()
    )

    setAllDisputes((prev) =>
      prev.map((d) =>
        d.id === input.disputeId
          ? {
            ...d,
            status: input.resolutionStatus,
            adjustedApprovedMinutes: input.adjustedApprovedMinutes,
            resolutionSummary: input.resolutionSummary.trim(),
            creditInvoiceId: lineAdjustRes.createdCreditInvoiceId,
            resolvedAt: new Date().toISOString(),
            messages: [
              ...d.messages,
              {
                id: `dmsg-${Date.now()}`,
                authorUserId: activeUser.id,
                authorName: activeUser.name,
                authorRole: activeUser.role,
                messageType: 'resolution',
                messageMarkdown: `${input.resolutionStatus.toUpperCase()}: ${input.resolutionSummary.trim()}`,
                attachedArtifactIds: [],
                beforeMinutes: d.disputedMinutes,
                afterMinutes: input.adjustedApprovedMinutes,
                createdAt: new Date().toISOString(),
              },
            ],
          }
          : d
      )
    )

    if (prismaStatus.connected) {
      void performDisputeActionViaPrisma({
        action: 'resolve',
        tenantId: activeTenant.id,
        disputeId: input.disputeId,
        actorUserId: activeUser.id,
        resolutionStatus: input.resolutionStatus,
        adjustedApprovedMinutes: input.adjustedApprovedMinutes,
        resolutionSummary: input.resolutionSummary.trim(),
      })
    }

    return {
      ok: true,
      message: `Dispute resolved (${input.resolutionStatus}). ${lineAdjustRes.message}`,
    }
  }

  return (
    <Phase3StoreContext.Provider
      value={{
        aiEnabled,
        aiServerStatus,
        toggleTenantAi,
        ruleSets: tenantRuleSets,
        activeRuleSet,
        simulateDraftRuleSet,
        publishRuleSet,
        workModeSuggestions,
        dismissWorkModeSuggestion,
        correlationEdges,
        taskVariances,
        unusualPatternAlerts,
        aiGenerations: allAiGenerations.filter((g) => g.tenantId === activeTenant.id),
        generateAiDraft,
        approveAiGeneration,
        discardAiGeneration,
        disputes: allDisputes.filter((d) => d.tenantId === activeTenant.id),
        openStructuredDispute,
        replyToStructuredDispute,
        escalateStructuredDispute,
        resolveStructuredDispute,
      }}
    >
      {children}
    </Phase3StoreContext.Provider>
  )
}

export function usePhase3Store() {
  const ctx = useContext(Phase3StoreContext)
  if (!ctx) {
    throw new Error('usePhase3Store must be used inside Phase3StoreProvider')
  }
  return ctx
}

