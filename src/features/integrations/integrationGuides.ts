export type ConnectorCategory = 'git' | 'pm' | 'chat' | 'calendar'

export interface FieldSpec {
  key: string
  label: string
  placeholder: string
  hint?: string
  type?: 'text' | 'password' | 'url' | 'email'
  required?: boolean
}

export interface SetupStep {
  title: string
  detail: string
}

export interface ProviderGuideSpec {
  id: string
  name: string
  category: ConnectorCategory
  badge: string
  shortSummary: string
  setupTime: string
  docsUrl: string
  portalUrl: string
  portalButtonLabel: string
  requiredScopes: string[]
  steps: SetupStep[]
  tip?: string
  fields: FieldSpec[]
  supportsLiveImport?: boolean
  isOAuthCalendar?: boolean
}

export const INTEGRATION_PROVIDERS: ProviderGuideSpec[] = [
  // ============================================================================
  // GIT & CODE PLATFORMS
  // ============================================================================
  {
    id: 'github',
    name: 'GitHub',
    category: 'git',
    badge: 'GH',
    shortSummary: 'Import open GitHub Issues into tasks & verify repos.',
    setupTime: '~1 min',
    docsUrl: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
    portalUrl: 'https://github.com/settings/personal-access-tokens/new',
    portalButtonLabel: 'Open GitHub Token Settings',
    requiredScopes: ['Repository: Issues (Read-only)', 'Metadata (Read-only)'],
    steps: [
      {
        title: 'Open GitHub Personal Access Tokens',
        detail: 'Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.',
      },
      {
        title: 'Choose repositories',
        detail: 'Name the token (e.g. "TikTrack"), set an expiration, and pick "All repositories" or select the specific repos you want to sync.',
      },
      {
        title: 'Enable read-only Issues permission',
        detail: 'Under Repository permissions, set "Issues" to Read-only (or use a Classic token with the "repo" scope).',
      },
      {
        title: 'Generate & paste token',
        detail: 'Click Generate token, copy the token starting with github_pat_ (or ghp_), and paste it here.',
      },
    ],
    tip: 'If your repository belongs to a GitHub Organization, an organization owner may need to approve fine-grained tokens before private issues appear.',
    supportsLiveImport: true,
    fields: [
      {
        key: 'token',
        label: 'Personal Access Token',
        placeholder: 'github_pat_... or ghp_...',
        hint: 'Starts with github_pat_ (fine-grained) or ghp_ (classic)',
        type: 'password',
        required: true,
      },
    ],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    category: 'git',
    badge: 'GL',
    shortSummary: 'Connect GitLab.com or self-hosted GitLab to import issues.',
    setupTime: '~1 min',
    docsUrl: 'https://docs.gitlab.com/user/profile/personal_access_tokens/',
    portalUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    portalButtonLabel: 'Open GitLab Access Tokens',
    requiredScopes: ['read_api'],
    steps: [
      {
        title: 'Open GitLab Access Tokens',
        detail: 'Click your GitLab avatar (top-left) → Edit profile / Preferences → Access tokens.',
      },
      {
        title: 'Create a read-only token',
        detail: 'Click Add new token, name it "TikTrack", choose an expiration date, and check the "read_api" scope.',
      },
      {
        title: 'Copy & paste here',
        detail: 'Click Create personal access token and paste the glpat-... token on the right. Leave the URL as https://gitlab.com unless you self-host.',
      },
    ],
    supportsLiveImport: true,
    fields: [
      {
        key: 'baseUrl',
        label: 'GitLab Server URL',
        placeholder: 'https://gitlab.com',
        hint: 'Use https://gitlab.com or your self-hosted domain',
        type: 'url',
      },
      {
        key: 'token',
        label: 'Personal Access Token',
        placeholder: 'glpat-...',
        hint: 'Requires the read_api scope',
        type: 'password',
        required: true,
      },
    ],
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    category: 'git',
    badge: 'BB',
    shortSummary: 'Connect your Bitbucket workspace repositories via API Token.',
    setupTime: '~2 min',
    docsUrl: 'https://support.atlassian.com/bitbucket-cloud/docs/api-tokens/',
    portalUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    portalButtonLabel: 'Open Atlassian API Tokens',
    requiredScopes: ['read:repository:bitbucket', 'read:account'],
    steps: [
      {
        title: 'Open Bitbucket API Tokens',
        detail: 'In Bitbucket Cloud, click your profile avatar → Personal settings → Access management → API tokens (or open Atlassian Security → API tokens).',
      },
      {
        title: 'Create a scoped API token',
        detail: 'Click Create API token with scopes, name it "TikTrack", pick an expiry date, and grant Bitbucket repository read access.',
      },
      {
        title: 'Find your Workspace slug',
        detail: 'Look at your Bitbucket URL: bitbucket.org/{workspace-slug}/... - copy the workspace slug.',
      },
      {
        title: 'Verify & connect',
        detail: 'Enter your Workspace slug, your Atlassian account email (or Bitbucket username), and the API token.',
      },
    ],
    tip: 'Bitbucket retired legacy App Passwords in favor of scoped API Tokens. Always create a new API Token for connecting tools.',
    supportsLiveImport: true,
    fields: [
      {
        key: 'workspace',
        label: 'Workspace Slug',
        placeholder: 'my-company',
        hint: 'Found in bitbucket.org/<workspace-slug>',
        required: true,
      },
      {
        key: 'username',
        label: 'Atlassian Email or Bitbucket Username',
        placeholder: 'you@company.com',
        required: true,
      },
      {
        key: 'apiToken',
        label: 'Bitbucket API Token',
        placeholder: 'ATATT3x...',
        hint: 'Paste the scoped API token (shown once on creation)',
        type: 'password',
        required: true,
      },
    ],
  },

  // ============================================================================
  // PROJECT MANAGEMENT TOOLS
  // ============================================================================
  {
    id: 'jira',
    name: 'Jira',
    category: 'pm',
    badge: 'JR',
    shortSummary: 'Fetch active Jira issues with estimates & import as tasks.',
    setupTime: '~2 min',
    docsUrl: 'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
    portalUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    portalButtonLabel: 'Open Atlassian API Tokens',
    requiredScopes: ['read:jira-work', 'read:jira-user'],
    steps: [
      {
        title: 'Open Atlassian Account Security',
        detail: 'Visit id.atlassian.com → Security → API tokens.',
      },
      {
        title: 'Create an API token',
        detail: 'Click Create API token, give it a label like "TikTrack", choose an expiration date, and click Create.',
      },
      {
        title: 'Copy your Jira site domain',
        detail: 'Use your Jira Cloud domain without paths - for example: yourcompany.atlassian.net.',
      },
      {
        title: 'Paste credentials & verify',
        detail: 'Enter your Jira domain, your Atlassian login email, and the API token, then click Verify & Connect.',
      },
    ],
    tip: 'Atlassian displays your API token only once. If you lose it, create a fresh token from Security → API tokens.',
    supportsLiveImport: true,
    fields: [
      {
        key: 'domain',
        label: 'Jira Site Domain',
        placeholder: 'your-company.atlassian.net',
        hint: 'Just the domain - no /jira or /browse suffix',
        required: true,
      },
      {
        key: 'email',
        label: 'Atlassian Account Email',
        placeholder: 'you@company.com',
        type: 'email',
        required: true,
      },
      {
        key: 'apiToken',
        label: 'API Token',
        placeholder: 'ATATT3xFfGF0...',
        type: 'password',
        required: true,
      },
    ],
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    category: 'pm',
    badge: 'CU',
    shortSummary: 'Pull open ClickUp tasks & time estimates from your workspace.',
    setupTime: '~1 min',
    docsUrl: 'https://developer.clickup.com/docs/authentication',
    portalUrl: 'https://app.clickup.com/settings/apps',
    portalButtonLabel: 'Open ClickUp Apps Settings',
    requiredScopes: ['Personal API Token (pk_...)'],
    steps: [
      {
        title: 'Open ClickUp Settings',
        detail: 'Log in to ClickUp, click your profile avatar in the top-right corner, and select Settings.',
      },
      {
        title: 'Go to Apps in the left sidebar',
        detail: 'Under your user settings menu, click Apps.',
      },
      {
        title: 'Generate your API Token',
        detail: 'Under API Token, click Generate (or Copy if you already have one). The token starts with pk_.',
      },
      {
        title: 'Paste & connect',
        detail: 'Paste your pk_... token on the right and click Verify & Connect.',
      },
    ],
    supportsLiveImport: true,
    fields: [
      {
        key: 'apiToken',
        label: 'Personal API Token',
        placeholder: 'pk_...',
        hint: 'Found in ClickUp Settings → Apps → API Token',
        type: 'password',
        required: true,
      },
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    category: 'pm',
    badge: 'LN',
    shortSummary: 'Import active Linear issues, priorities & point estimates.',
    setupTime: '~1 min',
    docsUrl: 'https://linear.app/developers/graphql',
    portalUrl: 'https://linear.app/settings/account/security',
    portalButtonLabel: 'Open Linear Security & Access',
    requiredScopes: ['Read access'],
    steps: [
      {
        title: 'Open Linear Account Settings',
        detail: 'In Linear, click your workspace menu (top-left) → Settings → Account → Security & Access.',
      },
      {
        title: 'Create a Personal API Key',
        detail: 'Scroll to Personal API keys, click New API key, enter label "TikTrack", select Read permission, and click Create.',
      },
      {
        title: 'Copy & verify',
        detail: 'Copy the key starting with lin_api_ immediately and paste it on the right.',
      },
    ],
    supportsLiveImport: true,
    fields: [
      {
        key: 'apiKey',
        label: 'Personal API Key',
        placeholder: 'lin_api_...',
        hint: 'Starts with lin_api_ from Settings → Account → Security & Access',
        type: 'password',
        required: true,
      },
    ],
  },
  {
    id: 'trello',
    name: 'Trello',
    category: 'pm',
    badge: 'TR',
    shortSummary: 'Import open cards from your Trello boards into TikTrack.',
    setupTime: '~2 min',
    docsUrl: 'https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/',
    portalUrl: 'https://trello.com/apps/admin',
    portalButtonLabel: 'Open Trello Power-Up Admin',
    requiredScopes: ['Board & Card Read'],
    steps: [
      {
        title: 'Open Trello Apps / Power-Up Admin',
        detail: 'Visit trello.com/apps/admin (accept Atlassian developer terms if asked) and click New.',
      },
      {
        title: 'Create an app container',
        detail: 'Name it "TikTrack", pick your Workspace, enter your email & author name, and click Create.',
      },
      {
        title: 'Generate your API Key',
        detail: 'Open the API Key tab on the left and click Generate a new API Key, then copy the API Key.',
      },
      {
        title: 'Generate your User Token',
        detail: 'Right next to your API Key, click the blue "Token" link, review permissions, click Allow, and copy the ATTA... token.',
      },
    ],
    tip: 'Trello requires both an API Key (identifies the app) and a Token (authorizes access to your boards).',
    supportsLiveImport: true,
    fields: [
      {
        key: 'apiKey',
        label: 'Trello API Key',
        placeholder: '32-character API key',
        required: true,
      },
      {
        key: 'token',
        label: 'Trello User Token',
        placeholder: 'ATTA...',
        hint: 'Click the "Token" link next to your API Key in the Trello portal',
        type: 'password',
        required: true,
      },
    ],
  },
  {
    id: 'asana',
    name: 'Asana',
    category: 'pm',
    badge: 'AS',
    shortSummary: 'Fetch your assigned open Asana tasks for 1-click import.',
    setupTime: '~1 min',
    docsUrl: 'https://developers.asana.com/docs/personal-access-token',
    portalUrl: 'https://app.asana.com/0/my-apps',
    portalButtonLabel: 'Open Asana Developer Console',
    requiredScopes: ['Personal Access Token'],
    steps: [
      {
        title: 'Open Asana Developer Console',
        detail: 'In Asana, click your avatar (top-right) → Settings → Apps → Manage Developer Apps.',
      },
      {
        title: 'Create a Personal Access Token',
        detail: 'Click + Create new token, enter "TikTrack" as the token name, accept the API terms, and click Create token.',
      },
      {
        title: 'Paste & connect',
        detail: 'Copy the token right away (it is only displayed once) and paste it here.',
      },
    ],
    supportsLiveImport: true,
    fields: [
      {
        key: 'accessToken',
        label: 'Personal Access Token',
        placeholder: '2/120...',
        hint: 'Generated in Asana Developer Console → Personal access tokens',
        type: 'password',
        required: true,
      },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'pm',
    badge: 'NT',
    shortSummary: 'Import tasks & pages from a shared Notion database.',
    setupTime: '~2 min',
    docsUrl: 'https://developers.notion.com/docs/create-a-notion-integration',
    portalUrl: 'https://www.notion.so/profile/integrations',
    portalButtonLabel: 'Open Notion My Integrations',
    requiredScopes: ['Read content'],
    steps: [
      {
        title: 'Create an Internal Integration',
        detail: 'Open notion.so/profile/integrations → click New integration → name it "TikTrack" → pick your workspace → click Save.',
      },
      {
        title: 'Copy the Internal Integration Secret',
        detail: 'Under Configuration, copy the secret starting with ntn_ (or secret_).',
      },
      {
        title: 'Share your Task Database with TikTrack (Important!)',
        detail: 'Open your Notion database → click the ••• menu (top-right) → Connections → search "TikTrack" → click Confirm.',
      },
      {
        title: 'Optional: Copy Database ID',
        detail: 'To pull from one specific database, copy the 32-character ID from the database URL (between the last "/" and "?v="). Leave blank to list all shared pages.',
      },
    ],
    tip: 'Notion integrations cannot see any page or database until you explicitly add them via the page\'s ••• → Connections menu.',
    supportsLiveImport: true,
    fields: [
      {
        key: 'apiToken',
        label: 'Internal Integration Secret',
        placeholder: 'ntn_... or secret_...',
        type: 'password',
        required: true,
      },
      {
        key: 'databaseId',
        label: 'Database ID (Optional)',
        placeholder: '32-char ID before ?v= in Notion URL',
        hint: 'Leave blank to fetch all pages shared with this integration',
      },
    ],
  },
  {
    id: 'azure_devops',
    name: 'Azure DevOps',
    category: 'pm',
    badge: 'AD',
    shortSummary: 'Pull active Azure Boards work items & remaining work hours.',
    setupTime: '~2 min',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate',
    portalUrl: 'https://dev.azure.com/',
    portalButtonLabel: 'Open Azure DevOps',
    requiredScopes: ['Work Items (Read)'],
    steps: [
      {
        title: 'Open Personal Access Tokens',
        detail: 'Sign in to dev.azure.com/{your-org}, click the User Settings icon (top-right next to your avatar) → Personal access tokens.',
      },
      {
        title: 'Create a scoped PAT',
        detail: 'Click + New Token, name it "TikTrack", select your Organization, choose an expiration date, and select Custom defined scopes.',
      },
      {
        title: 'Grant Work Items Read scope',
        detail: 'Check Work Items → Read, then click Create and copy the generated token immediately.',
      },
      {
        title: 'Enter Organization, Project & PAT',
        detail: 'Paste your org name, exact project name, and PAT on the right to verify.',
      },
    ],
    supportsLiveImport: true,
    fields: [
      {
        key: 'organization',
        label: 'Organization Name',
        placeholder: 'my-org',
        hint: 'From https://dev.azure.com/<organization>',
        required: true,
      },
      {
        key: 'project',
        label: 'Project Name',
        placeholder: 'MyProject',
        required: true,
      },
      {
        key: 'pat',
        label: 'Personal Access Token (PAT)',
        placeholder: 'Paste PAT with Work Items: Read',
        type: 'password',
        required: true,
      },
    ],
  },

  // ============================================================================
  // TEAM CHAT ALERTS
  // ============================================================================
  {
    id: 'slack',
    name: 'Slack',
    category: 'chat',
    badge: 'SL',
    shortSummary: 'Send instant workspace alerts to a Slack channel.',
    setupTime: '~2 min',
    docsUrl: 'https://api.slack.com/messaging/webhooks',
    portalUrl: 'https://api.slack.com/apps',
    portalButtonLabel: 'Open Slack API Apps',
    requiredScopes: ['Incoming Webhooks'],
    steps: [
      {
        title: 'Create a Slack App',
        detail: 'Go to api.slack.com/apps → click Create New App → choose "From scratch" → name it "TikTrack" and pick your workspace.',
      },
      {
        title: 'Turn on Incoming Webhooks',
        detail: 'In the left sidebar under Features, click Incoming Webhooks and toggle Activate Incoming Webhooks to On.',
      },
      {
        title: 'Pick your target channel',
        detail: 'Scroll down, click Add New Webhook to Workspace, pick the channel (e.g. #engineering), and click Allow.',
      },
      {
        title: 'Copy & verify Webhook URL',
        detail: 'Copy the https://hooks.slack.com/services/... URL and paste it here - TikTrack sends a live welcome message to verify.',
      },
    ],
    fields: [
      {
        key: 'channelName',
        label: 'Channel Label (Optional)',
        placeholder: '#engineering-updates',
      },
      {
        key: 'webhookUrl',
        label: 'Incoming Webhook URL',
        placeholder: 'https://hooks.slack.com/services/T.../B.../...',
        type: 'url',
        required: true,
      },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'chat',
    badge: 'DC',
    shortSummary: 'Post rich embed notifications into a Discord channel.',
    setupTime: '~1 min',
    docsUrl: 'https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks',
    portalUrl: 'https://discord.com/app',
    portalButtonLabel: 'Open Discord',
    requiredScopes: ['Manage Webhooks (Server role)'],
    steps: [
      {
        title: 'Open Channel or Server Settings',
        detail: 'In Discord, open your Server Settings (or click the gear icon next to a text channel) → Integrations.',
      },
      {
        title: 'Create a Webhook',
        detail: 'Click Webhooks → New Webhook, name it "TikTrack", and choose which channel should receive alerts.',
      },
      {
        title: 'Copy Webhook URL & save',
        detail: 'Click Copy Webhook URL, save changes in Discord, and paste the URL here to send a live test message.',
      },
    ],
    fields: [
      {
        key: 'channelName',
        label: 'Channel Label (Optional)',
        placeholder: '#dev-updates',
      },
      {
        key: 'webhookUrl',
        label: 'Discord Webhook URL',
        placeholder: 'https://discord.com/api/webhooks/...',
        type: 'url',
        required: true,
      },
    ],
  },
  {
    id: 'ms_teams',
    name: 'Microsoft Teams',
    category: 'chat',
    badge: 'MT',
    shortSummary: 'Send Adaptive Card alerts via Teams Workflows.',
    setupTime: '~2 min',
    docsUrl: 'https://support.microsoft.com/en-us/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498',
    portalUrl: 'https://teams.microsoft.com/',
    portalButtonLabel: 'Open Microsoft Teams',
    requiredScopes: ['Teams Workflows App'],
    steps: [
      {
        title: 'Open Channel Workflows',
        detail: 'In Microsoft Teams, hover over your target channel → click ••• (More options) → select Workflows.',
      },
      {
        title: 'Choose the Webhook template',
        detail: 'Select "Send webhook alerts to a channel" (or "Post to a channel when a webhook request is received").',
      },
      {
        title: 'Configure & add workflow',
        detail: 'Name it "TikTrack Alerts", verify your Team & Channel selection, and click Add workflow.',
      },
      {
        title: 'Copy the HTTP POST URL',
        detail: 'Copy the generated Workflows URL and paste it here - TikTrack sends a live Adaptive Card test immediately.',
      },
    ],
    tip: 'Microsoft retired legacy Office 365 Connectors in May 2026. Always create the webhook via the Teams Workflows app.',
    fields: [
      {
        key: 'channelName',
        label: 'Channel Label (Optional)',
        placeholder: 'Engineering Team',
      },
      {
        key: 'webhookUrl',
        label: 'Teams Workflow Webhook URL',
        placeholder: 'https://prod-xx.logic.azure.com/workflows/...',
        type: 'url',
        required: true,
      },
    ],
  },

  // ============================================================================
  // CALENDARS (1-CLICK PER-TENANT OAUTH 2.0)
  // ============================================================================
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    category: 'calendar',
    badge: 'GC',
    shortSummary: 'Connect your workspace Google Calendar with 1-click sign-in.',
    setupTime: '~30 sec',
    docsUrl: 'https://developers.google.com/workspace/calendar/api/quickstart/js',
    portalUrl: 'https://console.cloud.google.com/apis/credentials',
    portalButtonLabel: 'Open Google Cloud Console',
    requiredScopes: ['calendar.readonly'],
    isOAuthCalendar: true,
    steps: [
      {
        title: 'Click "Connect Google Calendar"',
        detail: 'Opens Google\'s official permission screen. Your TikTrack account login session stays unchanged.',
      },
      {
        title: 'Choose your workspace Google account',
        detail: 'Pick the Google account you want to sync and click Allow for read-only calendar access.',
      },
      {
        title: 'Sync meetings privately to this workspace',
        detail: 'Tokens are encrypted and isolated strictly to this workspace — other tenants can never view your calendar.',
      },
    ],
    tip: 'You can connect both Google Calendar and Outlook Calendar side-by-side in the same workspace.',
    fields: [],
  },
  {
    id: 'outlook_calendar',
    name: 'Outlook / Teams Calendar',
    category: 'calendar',
    badge: 'MS',
    shortSummary: 'Connect Microsoft 365 / Teams meetings with 1-click sign-in.',
    setupTime: '~30 sec',
    docsUrl: 'https://learn.microsoft.com/en-us/graph/api/user-list-calendarview',
    portalUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    portalButtonLabel: 'Open Microsoft Entra Portal',
    requiredScopes: ['Calendars.Read'],
    isOAuthCalendar: true,
    steps: [
      {
        title: 'Click "Connect Outlook Calendar"',
        detail: 'Opens Microsoft\'s official permission screen. Your TikTrack account login session stays unchanged.',
      },
      {
        title: 'Sign in with your Microsoft 365 account',
        detail: 'Approve read-only calendar permission for the Microsoft account linked to your team.',
      },
      {
        title: 'Sync meetings privately to this workspace',
        detail: 'Meetings stay isolated strictly to this workspace and stay connected automatically via refresh tokens.',
      },
    ],
    tip: 'You can connect both Outlook Calendar and Google Calendar at the same time without logging out of TikTrack.',
    fields: [],
  },
]
