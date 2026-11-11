import type { SupportedLocale } from '../../types/domain.types.ts'

export const SUPPORTED_LOCALES: Array<{ code: SupportedLocale; label: string; region: string }> = [
  { code: 'en-US', label: 'English (US)', region: 'North America' },
  { code: 'en-GB', label: 'English (UK)', region: 'United Kingdom' },
  { code: 'de-DE', label: 'Deutsch (DE)', region: 'DACH / EU' },
  { code: 'fr-FR', label: 'Français (FR)', region: 'France / EU' },
  { code: 'ja-JP', label: '日本語 (JP)', region: 'Japan / APAC' },
]

export interface EnterpriseUiStrings {
  pageTitle: string
  pageSubtitle: string
  ssoHeading: string
  governanceHeading: string
  retentionHeading: string
  residencyHeading: string
  fleetHeading: string
  drHeading: string
  a11yHeading: string
  twoPersonBadge: string
}

const I18N_DICTIONARY: Record<SupportedLocale, EnterpriseUiStrings> = {
  'en-US': {
    pageTitle: 'Enterprise Governance, Compliance & Scale',
    pageSubtitle:
      'SAML/OIDC SSO, SCIM provisioning, two-person policy control, legal holds, data residency, SIEM exports & DR readiness.',
    ssoHeading: 'Identity Providers (SAML 2.0 / OIDC) & SCIM 2.0',
    governanceHeading: 'Two-Person Policy Change Governance',
    retentionHeading: 'Retention Schedules, Legal Holds & DSAR Requests',
    residencyHeading: 'Data Residency, Tenant Isolation & SIEM Pipeline',
    fleetHeading: 'Signed Device Fleet Releases & Warehouse Offloads',
    drHeading: 'Disaster Recovery Drills, 1,000-Dev Scale & Security Audits',
    a11yHeading: 'WCAG Accessibility & Localization',
    twoPersonBadge: 'Dual-Control Required',
  },
  'en-GB': {
    pageTitle: 'Enterprise Governance, Compliance & Scale',
    pageSubtitle:
      'SAML/OIDC SSO, SCIM provisioning, dual-control policy governance, legal holds, UK/EU data residency, SIEM & DR drills.',
    ssoHeading: 'Identity Providers (SAML 2.0 / OIDC) & SCIM 2.0',
    governanceHeading: 'Dual-Control Policy Change Governance',
    retentionHeading: 'Retention Schedules, Legal Holds & Subject Access Requests',
    residencyHeading: 'Data Residency, Tenant Isolation & SIEM Pipeline',
    fleetHeading: 'Signed Device Fleet Releases & Warehouse Offloads',
    drHeading: 'Disaster Recovery Exercises, Scale Load & Security Audits',
    a11yHeading: 'WCAG Accessibility & Localisation',
    twoPersonBadge: 'Dual-Control Required',
  },
  'de-DE': {
    pageTitle: 'Enterprise-Governance, Compliance & Skalierung',
    pageSubtitle:
      'SAML/OIDC-SSO, SCIM-Provisionierung, Vier-Augen-Prinzip für Richtlinien, Legal Holds, Datenresidenz, SIEM & DR-Tests.',
    ssoHeading: 'Identitätsanbieter (SAML 2.0 / OIDC) & SCIM 2.0',
    governanceHeading: 'Vier-Augen-Freigabe für Richtlinienänderungen',
    retentionHeading: 'Aufbewahrungsfristen, Legal Holds & DSGVO-Anfragen',
    residencyHeading: 'Datenresidenz, Mandantenisolation & SIEM-Export',
    fleetHeading: 'Signierte Client-Releases & Warehouse-Auslagerung',
    drHeading: 'Disaster-Recovery-Übungen, Lasttests & Sicherheitsaudits',
    a11yHeading: 'WCAG-Barrierefreiheit & Lokalisierung',
    twoPersonBadge: 'Vier-Augen-Prinzip',
  },
  'fr-FR': {
    pageTitle: 'Gouvernance Entreprise, Conformité & Scalabilité',
    pageSubtitle:
      'SSO SAML/OIDC, provisionnement SCIM, double validation des politiques, gel juridique, résidence des données, SIEM & PRA.',
    ssoHeading: 'Fournisseurs d’identité (SAML 2.0 / OIDC) & SCIM 2.0',
    governanceHeading: 'Double approbation des changements de politique',
    retentionHeading: 'Rétention, Gel juridique & Demandes RGPD',
    residencyHeading: 'Résidence des données, Isolation & Export SIEM',
    fleetHeading: 'Déploiement de flotte signé & Entrepôt analytique',
    drHeading: 'Exercices de reprise (PRA), Charge 1 000 devs & Audits',
    a11yHeading: 'Accessibilité WCAG & Localisation',
    twoPersonBadge: 'Double validation requise',
  },
  'ja-JP': {
    pageTitle: 'エンタープライズ統制・コンプライアンス・拡張性',
    pageSubtitle:
      'SAML/OIDC SSO、SCIMプロビジョニング、二名承認ポリシー統制、リーガルホールド、データレジデンシ、SIEM連携およびDR訓練。',
    ssoHeading: 'IDプロバイダー (SAML 2.0 / OIDC) & SCIM 2.0',
    governanceHeading: '二名承認ポリシー変更ガバナンス',
    retentionHeading: '保持スケジュール・リーガルホールド・開示/削除請求',
    residencyHeading: 'データレジデンシ・テナント分離・SIEMエクスポート',
    fleetHeading: '署名済みクライアント配布 & 分析ウェアハウス連携',
    drHeading: '災害復旧訓練・1,000名負荷試験・セキュリティ監査',
    a11yHeading: 'WCAGアクセシビリティとローカライゼーション',
    twoPersonBadge: '二名承認必須',
  },
}

export function getEnterpriseLocaleStrings(locale: SupportedLocale): EnterpriseUiStrings {
  return I18N_DICTIONARY[locale] ?? I18N_DICTIONARY['en-US']
}

export function formatMinutesLocalized(minutes: number, locale: SupportedLocale): string {
  const hours = minutes / 60
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(hours)
}
