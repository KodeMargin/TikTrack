import type {
  EvidenceCorrelationEdgeRecord,
  TaskEffortVarianceSummary,
} from '../../types/domain.types.ts'

export interface CorrelationTaskInput {
  id: string
  projectId: string
  code: string
  title: string
  status: string
  estimateMinutes: number
  acceptanceCriteria: string
}

export interface CorrelationLineInput {
  id: string
  projectId: string
  taskId: string
  taskCode: string
  workDate: string
  startTime: string
  endTime: string
  workMode: string
  provenance: string
  claimedMinutes: number
  supportedMinutes: number
  approvedBillableMinutes: number
  evidenceStatus: string
  developerNote: string
}

export interface CorrelationRollupInput {
  id: string
  projectId: string
  taskId: string
  workDate: string
  appCategory: string
  concurrentSources: string[]
  isObservationGap: boolean
  reconciliationChoice?: string
}

export interface CorrelationArtifactInput {
  id: string
  projectId: string
  taskId: string
  taskCode: string
  sourceType: string
  externalId: string
  summaryTitle: string
  linkType: 'contemporaneous' | 'retrospective_outcome' | 'manual_attached'
  linkConfidence: number
  linkRationale: string
}

export interface CorrelationAnnotationInput {
  id: string
  projectId: string
  taskId: string
  annotationType: string
  title: string
}

/**
 * F3-004 & F3-008: Evidence Correlation Graph & Outcome Association
 * Connects Timesheet Line / Session -> Task -> IDE/Desktop Signals -> Evidence Artifacts -> Annotations -> Review Outcome.
 */
export function buildEvidenceCorrelationGraph(
  tenantId: string,
  tasks: CorrelationTaskInput[],
  lines: CorrelationLineInput[],
  rollups: CorrelationRollupInput[],
  artifacts: CorrelationArtifactInput[],
  annotations: CorrelationAnnotationInput[]
): EvidenceCorrelationEdgeRecord[] {
  const edges: EvidenceCorrelationEdgeRecord[] = []
  const taskById = new Map(tasks.map((t) => [t.id, t]))

  for (const line of lines) {
    const task = taskById.get(line.taskId)
    edges.push({
      id: `edge-line-task-${line.id}`,
      tenantId,
      projectId: line.projectId,
      sourceNodeType: 'segment',
      sourceNodeId: line.id,
      sourceLabel: `${line.workDate} ${line.startTime}–${line.endTime} (${line.workMode})`,
      targetNodeType: 'task',
      targetNodeId: line.taskId,
      targetLabel: task ? `${task.code} · ${task.title}` : line.taskCode,
      edgeType: 'attributed_to',
      confidence: 0.96,
      rationale: `Claimed ${line.claimedMinutes}m (${line.provenance}) attributed to ${line.taskCode}.`,
    })

    if (line.evidenceStatus === 'approved') {
      edges.push({
        id: `edge-line-review-${line.id}`,
        tenantId,
        projectId: line.projectId,
        sourceNodeType: 'segment',
        sourceNodeId: line.id,
        sourceLabel: `${line.taskCode} (${line.approvedBillableMinutes}m approved)`,
        targetNodeType: 'review',
        targetNodeId: `review-${line.id}`,
        targetLabel: 'Human Commercial Approval',
        edgeType: 'outcome_associated',
        confidence: 1,
        rationale: 'Authorized reviewer accepted time under contract terms.',
      })
    }
  }

  for (const rollup of rollups) {
    const task = taskById.get(rollup.taskId)
    edges.push({
      id: `edge-rollup-task-${rollup.id}`,
      tenantId,
      projectId: rollup.projectId,
      sourceNodeType: 'ide_event',
      sourceNodeId: rollup.id,
      sourceLabel: rollup.isObservationGap
        ? `Unobserved Gap (${rollup.reconciliationChoice ?? 'pending'})`
        : `${rollup.appCategory} (${rollup.concurrentSources.join('+')})`,
      targetNodeType: 'task',
      targetNodeId: rollup.taskId,
      targetLabel: task ? `${task.code} · ${task.title}` : rollup.taskId,
      edgeType: rollup.isObservationGap ? 'contextualized_by' : 'corroborated_by',
      confidence: rollup.isObservationGap ? 0.75 : 0.89,
      rationale: rollup.isObservationGap
        ? `Interval reconciled as ${rollup.reconciliationChoice ?? 'awaiting context'}.`
        : `Coarse ${rollup.appCategory} signal observed across ${rollup.concurrentSources.join(', ')}.`,
    })
  }

  for (const art of artifacts) {
    const task = taskById.get(art.taskId)
    edges.push({
      id: `edge-artifact-task-${art.id}`,
      tenantId,
      projectId: art.projectId,
      sourceNodeType: 'artifact',
      sourceNodeId: art.id,
      sourceLabel: `${art.sourceType}: ${art.summaryTitle}`,
      targetNodeType: 'task',
      targetNodeId: art.taskId,
      targetLabel: task ? `${task.code} · ${task.title}` : art.taskCode,
      edgeType:
        art.linkType === 'retrospective_outcome'
          ? 'retrospective_outcome_of'
          : 'corroborated_by',
      confidence: art.linkConfidence,
      rationale: art.linkRationale || `Linked artifact ${art.externalId} (${art.linkType}).`,
    })

    if (
      task &&
      (art.sourceType === 'github_pr' ||
        art.sourceType === 'github_review' ||
        art.sourceType === 'github_ci' ||
        art.sourceType === 'vscode_test')
    ) {
      edges.push({
        id: `edge-outcome-${art.id}`,
        tenantId,
        projectId: art.projectId,
        sourceNodeType: 'artifact',
        sourceNodeId: art.id,
        sourceLabel: art.summaryTitle,
        targetNodeType: 'review',
        targetNodeId: `criteria-${task.id}`,
        targetLabel: `${task.code} Acceptance Criteria (${task.status})`,
        edgeType: 'outcome_associated',
        confidence: art.linkConfidence,
        rationale: `Deliverable linked to ${task.code}: ${task.acceptanceCriteria.slice(0, 90)}`,
      })
    }
  }

  for (const ann of annotations) {
    const task = taskById.get(ann.taskId)
    edges.push({
      id: `edge-ann-task-${ann.id}`,
      tenantId,
      projectId: ann.projectId,
      sourceNodeType: 'annotation',
      sourceNodeId: ann.id,
      sourceLabel: `${ann.annotationType}: ${ann.title}`,
      targetNodeType: 'task',
      targetNodeId: ann.taskId,
      targetLabel: task ? `${task.code} · ${task.title}` : ann.taskId,
      edgeType: 'contextualized_by',
      confidence: 0.92,
      rationale: 'Developer-authored investigation or thinking context attached to task.',
    })
  }

  return edges
}

/**
 * F3-009: Historical Effort Variance
 * Compares task estimate vs. actual claimed/supported/approved hours with uncertainty
 * and neutral engineering reason codes (never "low-performing developer").
 */
export function computeTaskEffortVariances(
  tasks: CorrelationTaskInput[],
  lines: CorrelationLineInput[],
  artifacts: CorrelationArtifactInput[],
  estimateVarianceAlertPercent = 125
): TaskEffortVarianceSummary[] {
  return tasks.map((task) => {
    const taskLines = lines.filter((l) => l.taskId === task.id)
    const taskArtifacts = artifacts.filter((a) => a.taskId === task.id)

    const claimedMinutes = taskLines.reduce((sum, l) => sum + l.claimedMinutes, 0)
    const supportedMinutes = taskLines.reduce((sum, l) => sum + l.supportedMinutes, 0)
    const approvedMinutes = taskLines.reduce((sum, l) => sum + l.approvedBillableMinutes, 0)
    const varianceMinutes = claimedMinutes - task.estimateMinutes
    const variancePercent =
      task.estimateMinutes > 0 ? Math.round((claimedMinutes / task.estimateMinutes) * 100) : 0

    const reasonCodes: string[] = []
    if (taskLines.some((l) => l.workMode === 'debugging')) {
      reasonCodes.push('DEEP_DEBUGGING_UNCERTAINTY')
    }
    if (taskLines.some((l) => l.workMode === 'research' || l.workMode === 'thinking')) {
      reasonCodes.push('ARCHITECTURAL_DISCOVERY')
    }
    if (taskArtifacts.some((a) => a.sourceType === 'github_review')) {
      reasonCodes.push('REVIEW_ITERATION')
    }
    if (variancePercent >= estimateVarianceAlertPercent && reasonCodes.length === 0) {
      reasonCodes.push('SCOPE_COMPLEXITY_VARIANCE')
    }
    if (reasonCodes.length === 0) {
      reasonCodes.push('WITHIN_ESTIMATE_BAND')
    }

    return {
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      estimateMinutes: task.estimateMinutes,
      claimedMinutes,
      supportedMinutes,
      approvedMinutes,
      varianceMinutes,
      variancePercent,
      reasonCodes,
      linkedDeliverableCount: taskArtifacts.length,
      acceptanceCriteriaSummary: task.acceptanceCriteria,
    }
  })
}
