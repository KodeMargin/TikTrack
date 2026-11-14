import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase5Store } from '@/context/Phase5Store'
import { useTheme } from '@/context/ThemeContext'
import {
  formatMinutesLocalized,
  getEnterpriseLocaleStrings,
  SUPPORTED_LOCALES,
} from '@/lib/phase5/accessibilityAndI18n'
import { evaluateDrAndLoadReadiness } from '@/lib/phase5/fleetAndWarehouse'
import type {
  DrExerciseRecord,
  FailoverRegion,
  FleetChannel,
  FleetPlatform,
  IsolationTier,
  LegalHoldRecord,
  ResidencyRegion,
  RetentionPolicyRecord,
  SecurityAssessmentRecord,
  SiemFormat,
  SiemProvider,
  SsoProviderRecord,
  SsoProviderType,
  SupportedLocale,
  WarehouseSink,
} from '@/types/domain.types'

type EnterpriseTab =
  | 'sso-scim'
  | 'governance'
  | 'retention-holds'
  | 'residency-siem'
  | 'fleet-warehouse'
  | 'dr-security'
  | 'accessibility'

export function EnterpriseComplianceView() {
  const { activeTenant, activeUser, members, timesheetLines } = usePhase1Store()
  const { locale, highContrast } = useTheme()
  const strings = getEnterpriseLocaleStrings(locale)

  const {
    ssoProviders,
    scimEvents,
    policyChangeRequests,
    sensitiveAccessLogs,
    legalHolds,
    retentionPolicies,
    retentionJobs,
    privacyRequests,
    residencyConfig,
    siemDestinations,
    siemBatches,
    fleetReleases,
    warehouseExports,
    drExercises,
    securityAssessments,
    securityScore,
    accessibilityConfig,
    lastWorkerBatch,
    configureSsoProvider,
    simulateScimProvisioning,
    proposePolicyChange,
    decidePolicyChangeSecond,
    placeLegalHold,
    releaseLegalHold,
    saveRetentionPolicy,
    runRetentionSweep,
    submitPrivacyRequest,
    saveResidencyConfig,
    testResidencyTransfer,
    createSiemDestination,
    dispatchSiemExportBatch,
    publishFleetRelease,
    triggerWarehouseExport,
    runDetachableQueueWorkerBatch,
    recordDrExercise,
    addSecurityAssessment,
    saveAccessibilityConfig,
  } = usePhase5Store()

  const [tab, setTab] = useState<EnterpriseTab>('sso-scim')
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // SSO & SCIM state
  const [ssoType, setSsoType] = useState<SsoProviderType>('saml')
  const [ssoName, setSsoName] = useState('Okta Enterprise IdP')
  const [ssoDomain, setSsoDomain] = useState('acme.dev')
  const [ssoIssuer, setSsoIssuer] = useState('https://okta.acme.dev/app/devproof')
  const [ssoUrl, setSsoUrl] = useState('https://okta.acme.dev/sso/saml')
  const [ssoFingerprint, setSsoFingerprint] = useState('SHA256:9A:4B:12:EF:88:7C')
  const [ssoClientId, setSsoClientId] = useState('')
  const [ssoEnforce, setSsoEnforce] = useState(true)
  const [ssoJitRole, setSsoJitRole] = useState<SsoProviderRecord['jitDefaultRole']>('developer')
  const [scimEnabled, setScimEnabled] = useState(true)
  const [revealedScimToken, setRevealedScimToken] = useState<string | null>(null)
  const [scimEmail, setScimEmail] = useState('new.engineer@acme.dev')
  const [scimExtId, setScimExtId] = useState('okta-u-1042')
  const [scimAction, setScimAction] = useState<'user_create' | 'user_update' | 'user_deactivate' | 'group_sync'>('user_create')
  const [scimRole, setScimRole] = useState('developer')

  // Two-person Governance state
  const [propVersion, setPropVersion] = useState('v2.2-2026-11')
  const [propSummary, setPropSummary] = useState(
    'Enable coarse IDE Git branch matching for repository task correlation (zero raw code capture).'
  )
  const [propExpands, setPropExpands] = useState(true)
  const [secondApproverId, setSecondApproverId] = useState(
    () => members.find((m) => m.id !== activeUser.id)?.id ?? activeUser.id
  )

  // Legal Hold & Retention state
  const [holdScope, setHoldScope] = useState<LegalHoldRecord['scopeType']>('timesheet')
  const [holdTarget, setHoldTarget] = useState(() => timesheetLines[0]?.id ?? activeTenant.id)
  const [holdReason, setHoldReason] = useState('Pending billing dispute review Q4-2026')
  const [retName, setRetName] = useState('Enterprise SOC2 90/365/2555')
  const [retRawDays, setRetRawDays] = useState(90)
  const [retRollupDays, setRetRollupDays] = useState(365)
  const [retEvidenceDays, setRetEvidenceDays] = useState(730)
  const [retAuditDays, setRetAuditDays] = useState(2555)
  const [retTier, setRetTier] = useState<RetentionPolicyRecord['archiveStorageTier']>('cold_s3')
  const [dsarType, setDsarType] = useState<'export' | 'correction' | 'erasure'>('export')

  // Residency & SIEM state
  const [primaryRegion, setPrimaryRegion] = useState<ResidencyRegion>(residencyConfig.primaryRegion)
  const [failoverRegion, setFailoverRegion] = useState<FailoverRegion>(residencyConfig.failoverRegion)
  const [residencyLocked, setResidencyLocked] = useState(residencyConfig.dataResidencyLocked)
  const [isolationTier, setIsolationTier] = useState<IsolationTier>(residencyConfig.isolationTier)
  const [kmsMode, setKmsMode] = useState<'platform_kms' | 'byok_kms'>(residencyConfig.encryptionKeyMode)
  const [kmsArnMasked, setKmsArnMasked] = useState(
    residencyConfig.kmsKeyArnMasked ?? 'arn:aws:kms:eu-central-1:****:key/91c2'
  )
  const [dedicatedWorker, setDedicatedWorker] = useState(residencyConfig.dedicatedWorkerPool)
  const [transferTarget, setTransferTarget] = useState<ResidencyRegion>('ap-southeast-1')
  const [siemName, setSiemName] = useState('Splunk SOC HEC')
  const [siemProvider, setSiemProvider] = useState<SiemProvider>('splunk')
  const [siemEndpoint, setSiemEndpoint] = useState('https://hec.soc.acme.dev/services/collector')
  const [siemFormat, setSiemFormat] = useState<SiemFormat>('cef')

  // Fleet & Warehouse state
  const [fleetVer, setFleetVer] = useState('1.5.0')
  const [fleetPlatform, setFleetPlatform] = useState<FleetPlatform>('macos_universal')
  const [fleetChannel, setFleetChannel] = useState<FleetChannel>('staged_25')
  const [fleetRollout, setFleetRollout] = useState(25)
  const [whSink, setWhSink] = useState<WarehouseSink>('parquet_object_storage')
  const [whPeriodStart, setWhPeriodStart] = useState('2026-10-01')
  const [whPeriodEnd, setWhPeriodEnd] = useState('2026-10-31')

  // DR & Security Assessment state
  const [drType, setDrType] = useState<DrExerciseRecord['exerciseType']>('load_test_1000_devs')
  const [drMeasuredRpo, setDrMeasuredRpo] = useState(4)
  const [drMeasuredRto, setDrMeasuredRto] = useState(19)
  const [drP95Ms, setDrP95Ms] = useState(182)
  const [drDevs, setDrDevs] = useState(1000)
  const [drFindings, setDrFindings] = useState(
    '1,000 concurrent simulated developers sustained >1M monthly summaries with CRUD p95 at 182ms.'
  )
  const [saName, setSaName] = useState('2026 Q4 Independent Pen Test & RLS Audit')
  const [saFirm, setSaFirm] = useState('TrailSec Assurance LLP')
  const [saType, setSaType] = useState<SecurityAssessmentRecord['assessmentType']>('penetration_test')
  const [saStatus, setSaStatus] = useState<SecurityAssessmentRecord['status']>('signed_off')
  const [saCritical, setSaCritical] = useState(0)
  const [saHigh, setSaHigh] = useState(1)
  const [saRemediated, setSaRemediated] = useState(1)

  // Accessibility & Locale state
  const [a11yLocale, setA11yLocale] = useState<SupportedLocale>(locale)
  const [a11yHighContrast, setA11yHighContrast] = useState(highContrast)
  const [a11yShortcuts, setA11yShortcuts] = useState(accessibilityConfig.keyboardShortcutsEnabled)
  const [a11yWcag, setA11yWcag] = useState<'AA' | 'AAA'>(accessibilityConfig.wcagTargetLevel)

  const totalApprovedMinutes = timesheetLines.reduce(
    (sum, l) => sum + l.approvedBillableMinutes,
    0
  )

  const tabs: Array<{ id: EnterpriseTab; label: string }> = [
    { id: 'sso-scim', label: 'SSO & SCIM' },
    { id: 'governance', label: '2-Person Governance' },
    { id: 'retention-holds', label: 'Retention & Legal Holds' },
    { id: 'residency-siem', label: 'Residency & SIEM' },
    { id: 'fleet-warehouse', label: 'Fleet & Warehouse' },
    { id: 'dr-security', label: 'DR, Load & Security' },
    { id: 'accessibility', label: 'Accessibility & Locale' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {strings.pageTitle}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 font-medium">
            Region: <strong>{residencyConfig.primaryRegion}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 font-medium">
            Approved Hours ({locale}):{' '}
            <strong>{formatMinutesLocalized(totalApprovedMinutes, locale)}h</strong>
          </span>
          <span
            className={`px-2.5 py-1 rounded-lg border font-semibold ${securityScore.enterpriseReady
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
              }`}
          >
            {securityScore.enterpriseReady ? 'Audit Signed Off' : 'Audit Pending Signoff'}
          </span>
        </div>
      </div>

      {banner && (
        <div
          role="status"
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between ${banner.kind === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
            }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Enterprise and compliance sections"
        className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-white/10 pb-2"
      >
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${active
                  ? 'bg-[#702fe3] text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:border-white/10 dark:hover:bg-white/10'
                }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* TAB 1: SSO & SCIM (F5-001) */}
      {tab === 'sso-scim' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">{strings.ssoHeading}</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-300">Protocol</span>
                <select
                  value={ssoType}
                  onChange={(e) => setSsoType(e.target.value as SsoProviderType)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="saml">SAML 2.0</option>
                  <option value="oidc">OIDC (OAuth 2.0)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-300">Verified Domain</span>
                <input
                  value={ssoDomain}
                  onChange={(e) => setSsoDomain(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="font-medium text-slate-600 dark:text-slate-300">Provider Name</span>
                <input
                  value={ssoName}
                  onChange={(e) => setSsoName(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="font-medium text-slate-600 dark:text-slate-300">Entity ID / OIDC Issuer URL</span>
                <input
                  value={ssoIssuer}
                  onChange={(e) => setSsoIssuer(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="font-medium text-slate-600 dark:text-slate-300">SSO Endpoint URL</span>
                <input
                  value={ssoUrl}
                  onChange={(e) => setSsoUrl(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              {ssoType === 'saml' ? (
                <label className="space-y-1 col-span-2">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    X.509 Certificate Fingerprint
                  </span>
                  <input
                    value={ssoFingerprint}
                    onChange={(e) => setSsoFingerprint(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent font-mono"
                  />
                </label>
              ) : (
                <label className="space-y-1 col-span-2">
                  <span className="font-medium text-slate-600 dark:text-slate-300">OIDC Client ID</span>
                  <input
                    value={ssoClientId}
                    onChange={(e) => setSsoClientId(e.target.value)}
                    placeholder="0oa8k2..."
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent font-mono"
                  />
                </label>
              )}
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-300">JIT Default Role</span>
                <select
                  value={ssoJitRole}
                  onChange={(e) =>
                    setSsoJitRole(e.target.value as SsoProviderRecord['jitDefaultRole'])
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="developer">developer</option>
                  <option value="project_manager">project_manager</option>
                  <option value="finance">finance</option>
                  <option value="auditor">auditor</option>
                </select>
              </label>
              <div className="flex flex-col justify-end gap-2">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ssoEnforce}
                    onChange={(e) => setSsoEnforce(e.target.checked)}
                  />
                  <span>Enforce domain SSO</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={scimEnabled}
                    onChange={(e) => setScimEnabled(e.target.checked)}
                  />
                  <span>Enable SCIM 2.0 sync</span>
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                void configureSsoProvider({
                  providerType: ssoType,
                  displayName: ssoName,
                  domain: ssoDomain,
                  entityIdOrIssuer: ssoIssuer,
                  ssoUrl,
                  certificateFingerprint: ssoFingerprint,
                  clientId: ssoClientId,
                  enforceSso: ssoEnforce,
                  jitDefaultRole: ssoJitRole,
                  scimEnabled,
                }).then((res) => {
                  setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
                  if (res.scimBearerToken) setRevealedScimToken(res.scimBearerToken)
                })
              }}
              className="px-4 py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold cursor-pointer"
            >
              Save & Activate SSO Provider
            </button>

            {revealedScimToken && (
              <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 text-xs space-y-1">
                <div className="font-semibold text-amber-800 dark:text-amber-300">
                  SCIM 2.0 Bearer Token
                </div>
                <code className="block break-all font-mono text-[11px]">{revealedScimToken}</code>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="text-xs font-semibold">Configured Identity Providers ({ssoProviders.length})</div>
              {ssoProviders.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">
                      {p.displayName} ({p.providerType.toUpperCase()})
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      Domain: {p.domain} • JIT: {p.jitDefaultRole} • SCIM:{' '}
                      {p.scimEnabled ? `Active (${p.scimTokenPrefix ?? 'hashed'})` : 'Off'}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 font-semibold">
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">SCIM 2.0 Directory Provisioning Events</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-300">SCIM Action</span>
                <select
                  value={scimAction}
                  onChange={(e) => setScimAction(e.target.value as typeof scimAction)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="user_create">user_create</option>
                  <option value="user_update">user_update</option>
                  <option value="user_deactivate">user_deactivate</option>
                  <option value="group_sync">group_sync</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-300">Target Role</span>
                <select
                  value={scimRole}
                  onChange={(e) => setScimRole(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="developer">developer</option>
                  <option value="project_manager">project_manager</option>
                  <option value="auditor">auditor</option>
                  <option value="finance">finance</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-300">External IdP ID</span>
                <input
                  value={scimExtId}
                  onChange={(e) => setScimExtId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-300">User Email</span>
                <input
                  value={scimEmail}
                  onChange={(e) => setScimEmail(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                const res = simulateScimProvisioning({
                  providerId: ssoProviders[0]?.id,
                  action: scimAction,
                  externalUserId: scimExtId,
                  email: scimEmail,
                  targetRole: scimRole,
                })
                setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
              }}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
            >
              Dispatch SCIM 2.0 Sync Event
            </button>

            <div className="space-y-2 max-h-72 overflow-y-auto pt-2 border-t border-slate-200 dark:border-white/10">
              {scimEvents.length === 0 ? (
                <p className="text-xs text-slate-500">No SCIM provisioning events recorded yet.</p>
              ) : (
                scimEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {ev.action} → {ev.email}
                      </div>
                      <div className="text-slate-500 font-mono text-[11px]">
                        {ev.externalUserId} • role={ev.targetRole} • {ev.correlationId}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 font-semibold">
                      {ev.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: Two-Person Policy Governance (F5-006) & Sensitive Access Logs (F5-002) */}
      {tab === 'governance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">{strings.governanceHeading}</h2>
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 text-[11px] font-semibold">
                {strings.twoPersonBadge}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-medium">Proposed Policy Version</span>
                <input
                  value={propVersion}
                  onChange={(e) => setPropVersion(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent font-mono"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-medium">Change Summary</span>
                <textarea
                  rows={2}
                  value={propSummary}
                  onChange={(e) => setPropSummary(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={propExpands}
                  onChange={(e) => setPropExpands(e.target.checked)}
                />
                <span>Expands collection scope</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                const res = proposePolicyChange({
                  proposedVersionCode: propVersion,
                  changeSummary: propSummary,
                  expandsCollectionScope: propExpands,
                  scopeDiff: { collect_ide_branch_context: true, never_collect_keystrokes: true },
                })
                setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
              }}
              className="px-4 py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold cursor-pointer"
            >
              Propose & Sign (1st Approval as {activeUser.name})
            </button>

            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">Policy Change Queue</span>
                <label className="flex items-center gap-1.5">
                  <span className="text-slate-500">2nd Approver:</span>
                  <select
                    value={secondApproverId}
                    onChange={(e) => setSecondApproverId(e.target.value)}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-white/15 bg-transparent"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {policyChangeRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-white/10 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono">{req.proposedVersionCode}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 font-semibold">
                      {req.status}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{req.changeSummary}</p>
                  <div className="text-[11px] text-slate-500">
                    1st Sig: {req.approvedByFirstName ?? req.approvedByFirst}
                    {req.approvedBySecondName ? ` • 2nd Sig: ${req.approvedBySecondName}` : ''}
                  </div>
                  {req.status === 'pending_second_approval' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const res = decidePolicyChangeSecond({
                            requestId: req.id,
                            secondApproverUserId: secondApproverId,
                            decision: 'approve',
                          })
                          setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
                        }}
                        className="px-3 py-1 rounded bg-emerald-600 text-white font-semibold cursor-pointer"
                      >
                        Co-Approve & Activate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const res = decidePolicyChangeSecond({
                            requestId: req.id,
                            secondApproverUserId: secondApproverId,
                            decision: 'reject',
                          })
                          setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
                        }}
                        className="px-3 py-1 rounded bg-rose-600 text-white font-semibold cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">Sensitive Access Logs</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {sensitiveAccessLogs.length === 0 ? (
                <p className="text-xs text-slate-500">No sensitive access log entries yet.</p>
              ) : (
                sensitiveAccessLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {log.actionCategory} • {log.resourceType}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {log.actorName ?? 'System'} • {log.correlationId} • {log.occurredAtUtc.slice(0, 19)}
                      </div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 font-mono">
                      {log.ipAddressMasked}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: Retention & Legal Holds (F5-002) */}
      {tab === 'retention-holds' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">Legal Holds</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-medium">Hold Scope</span>
                <select
                  value={holdScope}
                  onChange={(e) => setHoldScope(e.target.value as LegalHoldRecord['scopeType'])}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="timesheet">timesheet</option>
                  <option value="dispute">dispute</option>
                  <option value="project">project</option>
                  <option value="user">user</option>
                  <option value="tenant">tenant</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Target ID</span>
                <input
                  value={holdTarget}
                  onChange={(e) => setHoldTarget(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent font-mono"
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="font-medium">Legal Hold Reason</span>
                <input
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                const res = placeLegalHold({
                  scopeType: holdScope,
                  targetId: holdTarget,
                  reason: holdReason,
                })
                setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
              }}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
            >
              Place Active Legal Hold
            </button>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
              {legalHolds.map((h) => (
                <div
                  key={h.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">
                      [{h.scopeType}] {h.reason}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">target={h.targetId}</div>
                  </div>
                  {h.holdStatus === 'active' ? (
                    <button
                      type="button"
                      onClick={() => releaseLegalHold(h.id)}
                      className="px-2.5 py-1 rounded bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold cursor-pointer"
                    >
                      Release Hold
                    </button>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10">released</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">{strings.retentionHeading}</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1 col-span-2">
                <span className="font-medium">Retention Template Name</span>
                <input
                  value={retName}
                  onChange={(e) => setRetName(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Raw Activity (days)</span>
                <input
                  type="number"
                  value={retRawDays}
                  onChange={(e) => setRetRawDays(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Rollups (days)</span>
                <input
                  type="number"
                  value={retRollupDays}
                  onChange={(e) => setRetRollupDays(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Evidence Artifacts (days)</span>
                <input
                  type="number"
                  value={retEvidenceDays}
                  onChange={(e) => setRetEvidenceDays(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Audit Logs (days)</span>
                <input
                  type="number"
                  value={retAuditDays}
                  onChange={(e) => setRetAuditDays(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="font-medium">Archive Tier</span>
                <select
                  value={retTier}
                  onChange={(e) =>
                    setRetTier(e.target.value as RetentionPolicyRecord['archiveStorageTier'])
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="cold_s3">cold_s3</option>
                  <option value="gcs_archive">gcs_archive</option>
                  <option value="supabase_cold">supabase_cold</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const res = saveRetentionPolicy({
                    name: retName,
                    rawActivityDays: retRawDays,
                    rollupDays: retRollupDays,
                    evidenceArtifactDays: retEvidenceDays,
                    auditLogDays: retAuditDays,
                    archiveStorageTier: retTier,
                  })
                  setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
                }}
                className="px-3 py-2 rounded-lg bg-[#702fe3] text-white text-xs font-semibold cursor-pointer"
              >
                Save Retention Template
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = runRetentionSweep()
                  setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
                }}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                Run Retention Sweep
              </button>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold">DSAR Privacy Requests</span>
                <div className="flex items-center gap-2">
                  <select
                    value={dsarType}
                    onChange={(e) => setDsarType(e.target.value as typeof dsarType)}
                    className="px-2 py-1 rounded border border-slate-300 dark:border-white/15 bg-transparent"
                  >
                    <option value="export">export</option>
                    <option value="correction">correction</option>
                    <option value="erasure">erasure</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      void submitPrivacyRequest({
                        requestType: dsarType,
                        requesterUserId: activeUser.id,
                      }).then((res) =>
                        setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
                      )
                    }}
                    className="px-3 py-1 rounded bg-[#702fe3] text-white font-semibold cursor-pointer"
                  >
                    Submit DSAR
                  </button>
                </div>
              </div>

              {retentionPolicies.length > 0 && (
                <div className="text-[11px] text-slate-500">
                  Active template: {retentionPolicies[0].name} ({retentionPolicies[0].rawActivityDays}d raw)
                </div>
              )}

              {retentionJobs.slice(0, 3).map((j) => (
                <div
                  key={j.id}
                  className="p-2 rounded-lg border border-slate-200 dark:border-white/10 flex justify-between"
                >
                  <span>
                    {j.jobType} • scanned {j.scannedCount}, purged {j.purgedCount}, skipped hold{' '}
                    {j.skippedLegalHoldCount}
                  </span>
                  <span className="font-semibold">{j.status}</span>
                </div>
              ))}

              {privacyRequests.slice(0, 3).map((pr) => (
                <div
                  key={pr.id}
                  className="p-2 rounded-lg border border-slate-200 dark:border-white/10 flex justify-between"
                >
                  <span>
                    DSAR {pr.requestType} ({pr.requesterName ?? pr.requesterUserId})
                  </span>
                  <span className="font-semibold">{pr.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: Residency & SIEM (F5-003, F5-004, F5-005) */}
      {tab === 'residency-siem' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">{strings.residencyHeading}</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-medium">Primary Residency Region</span>
                <select
                  value={primaryRegion}
                  onChange={(e) => setPrimaryRegion(e.target.value as ResidencyRegion)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="us-east-1">us-east-1 (US East)</option>
                  <option value="eu-central-1">eu-central-1 (Frankfurt EU)</option>
                  <option value="uk-south-1">uk-south-1 (London UK)</option>
                  <option value="ap-southeast-1">ap-southeast-1 (Singapore APAC)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Failover Region</span>
                <select
                  value={failoverRegion}
                  onChange={(e) => setFailoverRegion(e.target.value as FailoverRegion)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="us-west-2">us-west-2</option>
                  <option value="eu-west-1">eu-west-1</option>
                  <option value="uk-west-1">uk-west-1</option>
                  <option value="ap-southeast-2">ap-southeast-2</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Tenant Isolation Tier</span>
                <select
                  value={isolationTier}
                  onChange={(e) => setIsolationTier(e.target.value as IsolationTier)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="shared_rls">shared_rls</option>
                  <option value="dedicated_schema">dedicated_schema</option>
                  <option value="dedicated_cluster">dedicated_cluster</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">KMS Key Mode</span>
                <select
                  value={kmsMode}
                  onChange={(e) => setKmsMode(e.target.value as 'platform_kms' | 'byok_kms')}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="platform_kms">platform_kms</option>
                  <option value="byok_kms">byok_kms (Customer Managed)</option>
                </select>
              </label>
              {kmsMode === 'byok_kms' && (
                <label className="space-y-1 col-span-2">
                  <span className="font-medium">Masked BYOK KMS ARN</span>
                  <input
                    value={kmsArnMasked}
                    onChange={(e) => setKmsArnMasked(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent font-mono"
                  />
                </label>
              )}
              <label className="inline-flex items-center gap-2 col-span-2">
                <input
                  type="checkbox"
                  checked={residencyLocked}
                  onChange={(e) => setResidencyLocked(e.target.checked)}
                />
                <span>Lock data residency strictly to primary region</span>
              </label>
              <label className="inline-flex items-center gap-2 col-span-2">
                <input
                  type="checkbox"
                  checked={dedicatedWorker}
                  onChange={(e) => setDedicatedWorker(e.target.checked)}
                />
                <span>Dedicated background queue worker pool</span>
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                const res = saveResidencyConfig({
                  primaryRegion,
                  failoverRegion,
                  dataResidencyLocked: residencyLocked,
                  isolationTier,
                  encryptionKeyMode: kmsMode,
                  kmsKeyArnMasked: kmsMode === 'byok_kms' ? kmsArnMasked : undefined,
                  dedicatedWorkerPool: dedicatedWorker,
                  egressAllowlistCidrs: ['198.51.100.0/24'],
                })
                setBanner({ kind: 'ok', text: res.message })
              }}
              className="px-4 py-2 rounded-lg bg-[#702fe3] text-white text-xs font-semibold cursor-pointer"
            >
              Save Residency & Isolation Policy
            </button>

            <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center gap-2 text-xs">
              <select
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value as ResidencyRegion)}
                className="px-2 py-1.5 rounded border border-slate-300 dark:border-white/15 bg-transparent"
              >
                <option value="us-east-1">us-east-1</option>
                <option value="eu-central-1">eu-central-1</option>
                <option value="uk-south-1">uk-south-1</option>
                <option value="ap-southeast-1">ap-southeast-1</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  const res = testResidencyTransfer(transferTarget)
                  setBanner({ kind: res.allowed ? 'ok' : 'err', text: res.message })
                }}
                className="px-3 py-1.5 rounded bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold cursor-pointer"
              >
                Test Cross-Region Replication Guard
              </button>
            </div>
          </section>

          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">SIEM Destinations & Batches</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-medium">Destination Name</span>
                <input
                  value={siemName}
                  onChange={(e) => setSiemName(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Provider</span>
                <select
                  value={siemProvider}
                  onChange={(e) => setSiemProvider(e.target.value as SiemProvider)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="splunk">splunk</option>
                  <option value="datadog">datadog</option>
                  <option value="sentinel">sentinel</option>
                  <option value="elastic">elastic</option>
                  <option value="syslog_tls">syslog_tls</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Format</span>
                <select
                  value={siemFormat}
                  onChange={(e) => setSiemFormat(e.target.value as SiemFormat)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="cef">CEF</option>
                  <option value="json_lines">JSON Lines</option>
                  <option value="ocsf">OCSF</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">HTTPS Collector Endpoint</span>
                <input
                  value={siemEndpoint}
                  onChange={(e) => setSiemEndpoint(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                void createSiemDestination({
                  name: siemName,
                  provider: siemProvider,
                  endpointUrl: siemEndpoint,
                  authToken: 'hec-token-placeholder',
                  format: siemFormat,
                  includeCategories: ['auth', 'policy', 'dispute', 'retention', 'export'],
                }).then((res) => setBanner({ kind: 'ok', text: res.message }))
              }}
              className="px-4 py-2 rounded-lg bg-[#702fe3] text-white text-xs font-semibold cursor-pointer"
            >
              Add SIEM Destination
            </button>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
              {siemDestinations.map((d) => (
                <div
                  key={d.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">
                      {d.name} ({d.provider} • {d.format.toUpperCase()})
                    </div>
                    <div className="text-[11px] text-slate-500">{d.endpointUrl}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void dispatchSiemExportBatch(d.id).then((res) =>
                        setBanner({ kind: res.ok ? 'ok' : 'err', text: res.message })
                      )
                    }}
                    className="px-3 py-1 rounded bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold cursor-pointer"
                  >
                    Export Sanitized Batch
                  </button>
                </div>
              ))}
              {siemBatches.slice(0, 3).map((b) => (
                <div
                  key={b.id}
                  className="p-2 rounded-lg border border-slate-200 dark:border-white/10 font-mono text-[11px] flex justify-between"
                >
                  <span>
                    {b.payloadFormat.toUpperCase()} • {b.eventCount} events • sha256:
                    {b.payloadDigestSha256.slice(0, 12)}...
                  </span>
                  <span className="text-emerald-600 font-semibold">{b.deliveryStatus}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 5: Fleet & Warehouse (F5-007, F5-008) */}
      {tab === 'fleet-warehouse' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">{strings.fleetHeading}</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-medium">Agent Version</span>
                <input
                  value={fleetVer}
                  onChange={(e) => setFleetVer(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Target Platform</span>
                <select
                  value={fleetPlatform}
                  onChange={(e) => setFleetPlatform(e.target.value as FleetPlatform)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="macos_universal">macOS Universal (.dmg)</option>
                  <option value="windows_x64">Windows x64 (.msi)</option>
                  <option value="windows_arm64">Windows ARM64 (.msi)</option>
                  <option value="vscode_vsix">VS Code Extension (.vsix)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Rollout Channel</span>
                <select
                  value={fleetChannel}
                  onChange={(e) => setFleetChannel(e.target.value as FleetChannel)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="canary">canary</option>
                  <option value="staged_25">staged_25</option>
                  <option value="stable">stable</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Rollout %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={fleetRollout}
                  onChange={(e) => setFleetRollout(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                void publishFleetRelease({
                  version: fleetVer,
                  platform: fleetPlatform,
                  channel: fleetChannel,
                  notarizationStatus: 'notarized',
                  rolloutPercentage: fleetRollout,
                  releaseNotes: 'Signed & notarized enterprise release with monotonic clock hardening.',
                }).then((res) => setBanner({ kind: 'ok', text: res.message }))
              }}
              className="px-4 py-2 rounded-lg bg-[#702fe3] text-white text-xs font-semibold cursor-pointer"
            >
              Publish Signed Fleet Release
            </button>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
              {fleetReleases.map((r) => (
                <div
                  key={r.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between"
                >
                  <div>
                    <div className="font-semibold">
                      v{r.version} ({r.platform}) • {r.rolloutPercentage}% rollout
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {r.codeSigningThumbprint} • {r.notarizationStatus}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 font-semibold">
                    {r.channel}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">Analytics Warehouse & Worker</h2>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <label className="space-y-1">
                <span className="font-medium">Warehouse Sink</span>
                <select
                  value={whSink}
                  onChange={(e) => setWhSink(e.target.value as WarehouseSink)}
                  className="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="parquet_object_storage">Parquet Object Store</option>
                  <option value="snowflake_external">Snowflake</option>
                  <option value="bigquery_load">BigQuery</option>
                  <option value="duckdb_cold">DuckDB Cold</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Start</span>
                <input
                  type="date"
                  value={whPeriodStart}
                  onChange={(e) => setWhPeriodStart(e.target.value)}
                  className="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">End</span>
                <input
                  type="date"
                  value={whPeriodEnd}
                  onChange={(e) => setWhPeriodEnd(e.target.value)}
                  className="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void triggerWarehouseExport({
                    targetSink: whSink,
                    periodStart: whPeriodStart,
                    periodEnd: whPeriodEnd,
                    rowCount: 12500,
                  }).then((res) => setBanner({ kind: 'ok', text: res.message }))
                }}
                className="px-3 py-2 rounded-lg bg-[#702fe3] text-white text-xs font-semibold cursor-pointer"
              >
                Offload Aggregates to Warehouse
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = runDetachableQueueWorkerBatch(true)
                  setBanner({
                    kind: 'ok',
                    text: `Detachable worker processed ${res.processedIds.length} msgs, routed ${res.deadLetterIds.length} to DLQ (p95 ${res.p95ProcessingMs}ms).`,
                  })
                }}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                Run Detachable Queue Worker Batch
              </button>
            </div>

            {lastWorkerBatch && (
              <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/30 dark:bg-indigo-500/10 text-xs font-mono">
                Worker Result: processed={lastWorkerBatch.processedIds.length} • retried=
                {lastWorkerBatch.retriedIds.length} • dlq={lastWorkerBatch.deadLetterIds.length} •
                p95={lastWorkerBatch.p95ProcessingMs}ms
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
              {warehouseExports.map((w) => (
                <div
                  key={w.id}
                  className="p-2 rounded-lg border border-slate-200 dark:border-white/10 font-mono text-[11px] flex justify-between"
                >
                  <span className="truncate max-w-xs">{w.objectPathUri}</span>
                  <span>
                    {w.rowCount} rows • {Math.round(w.compressedBytes / 1024)} KB
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 6: DR, Load & Security Assessments (F5-009, F5-011) */}
      {tab === 'dr-security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">{strings.drHeading}</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1 col-span-2">
                <span className="font-medium">Exercise Type</span>
                <select
                  value={drType}
                  onChange={(e) => setDrType(e.target.value as DrExerciseRecord['exerciseType'])}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="load_test_1000_devs">load_test_1000_devs (p95 &lt; 500ms)</option>
                  <option value="backup_restore_drill">backup_restore_drill</option>
                  <option value="region_failover_tabletop">region_failover_tabletop</option>
                  <option value="pen_test_remediation">pen_test_remediation</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Measured RPO (min)</span>
                <input
                  type="number"
                  value={drMeasuredRpo}
                  onChange={(e) => setDrMeasuredRpo(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Measured RTO (min)</span>
                <input
                  type="number"
                  value={drMeasuredRto}
                  onChange={(e) => setDrMeasuredRto(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">p95 Latency (ms)</span>
                <input
                  type="number"
                  value={drP95Ms}
                  onChange={(e) => setDrP95Ms(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Simulated Concurrent Devs</span>
                <input
                  type="number"
                  value={drDevs}
                  onChange={(e) => setDrDevs(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="font-medium">Findings Summary</span>
                <input
                  value={drFindings}
                  onChange={(e) => setDrFindings(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                const res = recordDrExercise({
                  exerciseType: drType,
                  targetRpoMinutes: 15,
                  measuredRpoMinutes: drMeasuredRpo,
                  targetRtoMinutes: 60,
                  measuredRtoMinutes: drMeasuredRto,
                  p95CrudMs: drP95Ms,
                  simulatedConcurrentDevs: drDevs,
                  findingsSummary: drFindings,
                })
                setBanner({ kind: res.passed ? 'ok' : 'err', text: res.message })
              }}
              className="px-4 py-2 rounded-lg bg-[#702fe3] text-white text-xs font-semibold cursor-pointer"
            >
              Record DR / Load Drill Result
            </button>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
              {drExercises.map((d) => {
                const evalRes = evaluateDrAndLoadReadiness(d)
                return (
                  <div
                    key={d.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between"
                  >
                    <div>
                      <div className="font-semibold">
                        {d.exerciseType} ({d.simulatedConcurrentDevs} devs)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        RPO {d.measuredRpoMinutes}m • RTO {d.measuredRtoMinutes}m • p95 {d.p95CrudMs}ms
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${evalRes.overallPass
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                        }`}
                    >
                      {evalRes.overallPass ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4">
            <h2 className="text-sm font-bold">Security Assessments</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1 col-span-2">
                <span className="font-medium">Assessment Title</span>
                <input
                  value={saName}
                  onChange={(e) => setSaName(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Assessor Firm</span>
                <input
                  value={saFirm}
                  onChange={(e) => setSaFirm(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium">Type</span>
                <select
                  value={saType}
                  onChange={(e) =>
                    setSaType(e.target.value as SecurityAssessmentRecord['assessmentType'])
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="penetration_test">penetration_test</option>
                  <option value="rls_isolation_audit">rls_isolation_audit</option>
                  <option value="sdlc_review">sdlc_review</option>
                  <option value="soc2_readiness">soc2_readiness</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="font-medium">Status</span>
                <select
                  value={saStatus}
                  onChange={(e) => setSaStatus(e.target.value as SecurityAssessmentRecord['status'])}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                >
                  <option value="signed_off">signed_off</option>
                  <option value="remediating">remediating</option>
                  <option value="in_progress">in_progress</option>
                  <option value="scheduled">scheduled</option>
                </select>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <label className="space-y-1">
                  <span className="font-medium">Crit</span>
                  <input
                    type="number"
                    value={saCritical}
                    onChange={(e) => setSaCritical(Number(e.target.value))}
                    className="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-medium">High</span>
                  <input
                    type="number"
                    value={saHigh}
                    onChange={(e) => setSaHigh(Number(e.target.value))}
                    className="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-medium">Fixed</span>
                  <input
                    type="number"
                    value={saRemediated}
                    onChange={(e) => setSaRemediated(Number(e.target.value))}
                    className="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
                  />
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void addSecurityAssessment({
                  assessmentName: saName,
                  assessorFirm: saFirm,
                  assessmentType: saType,
                  status: saStatus,
                  criticalFindings: saCritical,
                  highFindings: saHigh,
                  remediatedFindings: saRemediated,
                }).then((res) => setBanner({ kind: 'ok', text: res.message }))
              }}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
            >
              Record Assessment & Remediation
            </button>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
              {securityAssessments.map((s) => (
                <div
                  key={s.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 flex justify-between"
                >
                  <div>
                    <div className="font-semibold">{s.assessmentName}</div>
                    <div className="text-[11px] text-slate-500">
                      {s.assessorFirm} • Crit {s.criticalFindings}, High {s.highFindings}, Fixed{' '}
                      {s.remediatedFindings}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 font-semibold">
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 7: Accessibility & Localization (F5-010) */}
      {tab === 'accessibility' && (
        <section className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] space-y-4 max-w-2xl">
          <h2 className="text-sm font-bold">{strings.a11yHeading}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1">
              <span className="font-medium">Workspace Locale (i18n)</span>
              <select
                value={a11yLocale}
                onChange={(e) => setA11yLocale(e.target.value as SupportedLocale)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.label} - {loc.region}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">WCAG Target Level</span>
              <select
                value={a11yWcag}
                onChange={(e) => setA11yWcag(e.target.value as 'AA' | 'AAA')}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-white/15 bg-transparent"
              >
                <option value="AA">WCAG 2.1 AA</option>
                <option value="AAA">WCAG 2.1 AAA (High Contrast)</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={a11yHighContrast}
                onChange={(e) => setA11yHighContrast(e.target.checked)}
              />
              <span>Enable High-Contrast Focus & Ink Mode</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={a11yShortcuts}
                onChange={(e) => setA11yShortcuts(e.target.checked)}
              />
              <span>Enable Keyboard-Only Tab & Shortcut Navigation</span>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              saveAccessibilityConfig({
                defaultLocale: a11yLocale,
                highContrastMode: a11yHighContrast,
                keyboardShortcutsEnabled: a11yShortcuts,
                wcagTargetLevel: a11yWcag,
              })
              setBanner({
                kind: 'ok',
                text: `Applied locale ${a11yLocale} and WCAG ${a11yWcag} (${a11yHighContrast ? 'High Contrast ON' : 'Standard Contrast'}).`,
              })
            }}
            className="px-4 py-2 rounded-lg bg-[#702fe3] text-white text-xs font-semibold cursor-pointer"
          >
            Apply Accessibility & Localization Settings
          </button>
        </section>
      )}
    </div>
  )
}
