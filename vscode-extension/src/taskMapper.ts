/**
 * DevProof VS Code Extension - IDE Project-Task Mapper (F2-010, F2-011)
 *
 * Extracts task codes (e.g. DEV-104) from Git branch names and workspace folders
 * as non-binding suggestions. The developer can explicitly confirm or override
 * the mapping at any time.
 */

export interface WorkspaceTaskMappingSuggestion {
  workspaceIdentifier: string
  repoFullName: string
  branchName: string
  suggestedTaskCode: string | null
  confidenceScore: number
  rationale: string
  confirmedByUser: boolean
  overriddenTaskCode: string | null
}

const TASK_CODE_REGEX = /\b([A-Z]{2,8}-\d{2,6})\b/i

export function suggestTaskMappingFromGitContext(
  workspaceFolderName: string,
  gitRemoteUrl: string,
  branchName: string,
  userOverrideTaskCode?: string | null
): WorkspaceTaskMappingSuggestion {
  const repoFullName = normalizeGitRemoteToRepoName(gitRemoteUrl, workspaceFolderName)

  if (userOverrideTaskCode && userOverrideTaskCode.trim().length > 0) {
    const cleanOverride = userOverrideTaskCode.trim().toUpperCase()
    return {
      workspaceIdentifier: `vscode://${workspaceFolderName}`,
      repoFullName,
      branchName,
      suggestedTaskCode: cleanOverride,
      confidenceScore: 1.0,
      rationale: `Explicitly overridden and confirmed by developer (${cleanOverride})`,
      confirmedByUser: true,
      overriddenTaskCode: cleanOverride,
    }
  }

  const branchMatch = branchName.match(TASK_CODE_REGEX)
  if (branchMatch) {
    const taskCode = branchMatch[1].toUpperCase()
    return {
      workspaceIdentifier: `vscode://${workspaceFolderName}`,
      repoFullName,
      branchName,
      suggestedTaskCode: taskCode,
      confidenceScore: 0.94,
      rationale: `Detected task key ${taskCode} in active Git branch "${branchName}"`,
      confirmedByUser: false,
      overriddenTaskCode: null,
    }
  }

  return {
    workspaceIdentifier: `vscode://${workspaceFolderName}`,
    repoFullName,
    branchName,
    suggestedTaskCode: null,
    confidenceScore: 0.4,
    rationale: `No task code pattern found in branch "${branchName}"; awaiting developer selection`,
    confirmedByUser: false,
    overriddenTaskCode: null,
  }
}

export function normalizeGitRemoteToRepoName(remoteUrl: string, fallbackName: string): string {
  const trimmed = remoteUrl.trim().replace(/\.git$/i, '')
  const sshMatch = trimmed.match(/[:/]([^/:]+\/[^/:]+)$/)
  if (sshMatch) {
    return sshMatch[1]
  }
  return fallbackName
}

/**
 * F2-016: Classifies terminal command executables into coarse engineering categories.
 * Never records command arguments, environment variables, secrets, or terminal output.
 */
export function classifyTerminalCommandCategory(
  rawCommandExecutable: string
): 'build' | 'test' | 'version_control' | 'package_manager' | 'database' | 'other' {
  const exe = rawCommandExecutable.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (['vitest', 'jest', 'pytest', 'cargo-test', 'playwright', 'cypress'].includes(exe)) {
    return 'test'
  }
  if (['tsc', 'vite', 'webpack', 'esbuild', 'cargo', 'go', 'make', 'gradle'].includes(exe)) {
    return 'build'
  }
  if (['git', 'gh', 'glab'].includes(exe)) {
    return 'version_control'
  }
  if (['npm', 'pnpm', 'yarn', 'bun', 'pip', 'uv'].includes(exe)) {
    return 'package_manager'
  }
  if (['psql', 'prisma', 'supabase', 'sqlite3'].includes(exe)) {
    return 'database'
  }
  return 'other'
}

