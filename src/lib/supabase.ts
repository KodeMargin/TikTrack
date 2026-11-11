/**
 * DevProof (TikTrack) — Typed Supabase Client Configuration
 *
 * Security Boundary (Section 11.1 & 12.4):
 * Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are read from import.meta.env.
 * Privileged service_role keys never enter the client bundle.
 */

export interface SupabaseEnvConfig {
  url: string
  anonKey: string
  isConfigured: boolean
}

export function getSupabaseClientConfig(): SupabaseEnvConfig {
  const url = import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const anonKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    ''

  return {
    url,
    anonKey,
    isConfigured: Boolean(
      url &&
        anonKey &&
        !anonKey.includes('your-local-or-project')
    ),
  }
}

