import type { ProjectForecastSummary } from '../../types/domain.types.ts'

export interface ForecastProjectInput {
  id: string
  code: string
  name: string
  clientName: string
}

export interface ForecastTaskInput {
  id: string
  projectId: string
  estimateMinutes: number
  status: string
  isBillable: boolean
}

export interface ForecastLineInput {
  projectId: string
  taskId: string
  claimedMinutes: number
  approvedBillableMinutes: number
  snapshotHourlyRate: number
  evidenceStatus: string
}

/**
 * F4-011: Advanced Forecasting
 * Computes estimate accuracy, unreviewed billing exposure, approved spend,
 * and projected remaining backlog burn per project.
 */
export function computeProjectForecasts(input: {
  projects: ForecastProjectInput[]
  tasks: ForecastTaskInput[]
  timesheetLines: ForecastLineInput[]
  defaultHourlyRate?: number
}): ProjectForecastSummary[] {
  const fallbackRate = input.defaultHourlyRate ?? 125

  return input.projects.map((project) => {
    const projTasks = input.tasks.filter((t) => t.projectId === project.id)
    const projLines = input.timesheetLines.filter((l) => l.projectId === project.id)

    const estimatedMinutes = projTasks.reduce((sum, t) => sum + t.estimateMinutes, 0)
    const claimedMinutes = projLines.reduce((sum, l) => sum + l.claimedMinutes, 0)
    const approvedMinutes = projLines.reduce((sum, l) => sum + l.approvedBillableMinutes, 0)

    const unreviewedLines = projLines.filter(
      (l) => l.evidenceStatus !== 'approved' && l.approvedBillableMinutes === 0
    )
    const unreviewedExposureMinutes = unreviewedLines.reduce(
      (sum, l) => sum + l.claimedMinutes,
      0
    )
    const unreviewedExposureAmount = unreviewedLines.reduce(
      (sum, l) => sum + (l.claimedMinutes / 60) * l.snapshotHourlyRate,
      0
    )

    const approvedSpendAmount = projLines.reduce(
      (sum, l) => sum + (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate,
      0
    )

    const remainingOpenMinutes = projTasks
      .filter((t) => t.status !== 'done' && t.isBillable)
      .reduce((sum, t) => {
        const loggedOnTask = projLines
          .filter((l) => l.taskId === t.id)
          .reduce((s, l) => s + Math.max(l.approvedBillableMinutes, l.claimedMinutes), 0)
        return sum + Math.max(0, t.estimateMinutes - loggedOnTask)
      }, 0)

    const avgRate =
      projLines.length > 0
        ? projLines.reduce((s, l) => s + l.snapshotHourlyRate, 0) / projLines.length
        : fallbackRate

    const projectedRemainingCost = (remainingOpenMinutes / 60) * avgRate

    const estimateAccuracyPercent =
      estimatedMinutes > 0 && claimedMinutes > 0
        ? Math.max(
            0,
            Math.round(
              (1 - Math.abs(claimedMinutes - estimatedMinutes) / estimatedMinutes) * 100
            )
          )
        : 100

    const riskLevel: ProjectForecastSummary['riskLevel'] =
      estimatedMinutes > 0 && claimedMinutes > estimatedMinutes * 1.15
        ? 'over_estimate'
        : unreviewedExposureMinutes > 120 ||
            (estimatedMinutes > 0 && claimedMinutes > estimatedMinutes * 0.9)
          ? 'watch'
          : 'on_track'

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      clientName: project.clientName,
      estimatedMinutes,
      approvedMinutes,
      claimedMinutes,
      unreviewedExposureMinutes,
      unreviewedExposureAmount: Number(unreviewedExposureAmount.toFixed(2)),
      approvedSpendAmount: Number(approvedSpendAmount.toFixed(2)),
      projectedRemainingCost: Number(projectedRemainingCost.toFixed(2)),
      estimateAccuracyPercent,
      riskLevel,
    }
  })
}

