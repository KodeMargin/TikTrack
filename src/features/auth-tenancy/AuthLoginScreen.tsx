import { useEffect, useState } from 'react'
import { isSupabaseAuthConfigured, supabase } from '@/lib/supabaseClient'
import { useTheme } from '@/context/ThemeContext'
import { CountryTimezonePicker } from '@/components/CountryTimezonePicker'
import { detectUserLocation } from '@/lib/countryTimezones'

export function AuthLoginScreen() {
  const { theme, toggleTheme } = useTheme()
  const [authFullName, setAuthFullName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authCountryCode, setAuthCountryCode] = useState(() => detectUserLocation().countryCode)
  const [authTimezone, setAuthTimezone] = useState(() => detectUserLocation().timezone)
  const [authCountryName, setAuthCountryName] = useState('Sri Lanka')
  const [authMode, setAuthMode] = useState<'signup' | 'login' | 'recovery'>('login')
  const [authNotice, setAuthNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [isRecoverySession, setIsRecoverySession] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  useEffect(() => {
    if (!supabase) return
    if (window.location.hash.includes('type=recovery')) {
      setIsRecoverySession(true)
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true)
        setAuthNotice({ text: 'Recovery link verified! Please enter your new password below.', error: false })
      }
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !isSupabaseAuthConfigured) {
      setAuthNotice({
        text: 'Supabase Auth is not configured. Please check .env.local configuration.',
        error: true,
      })
      return
    }

    setLoading(true)
    setAuthNotice(null)
    const appRedirect = `${window.location.origin}/auth-privacy`

    try {
      if (authMode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        })
        if (error) {
          setAuthNotice({ text: error.message, error: true })
        } else {
          setAuthNotice({ text: `Signed in as ${data.user?.email}`, error: false })
        }
      } else if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            emailRedirectTo: appRedirect,
            data: {
              full_name: authFullName.trim() || authEmail.trim().split('@')[0],
              timezone: authTimezone,
              country_code: authCountryCode,
              country_name: authCountryName,
            },
          },
        })
        if (error) {
          setAuthNotice({ text: error.message, error: true })
        } else {
          setAuthNotice({
            text: `Verification email sent to ${data.user?.email ?? authEmail} via Resend. Check your inbox!`,
            error: false,
          })
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
          redirectTo: appRedirect,
        })
        if (error) {
          setAuthNotice({ text: error.message, error: true })
        } else {
          setAuthNotice({
            text: `Password recovery link dispatched to ${authEmail} via Resend. Check your inbox!`,
            error: false,
          })
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setAuthNotice({ text: message, error: true })
    } finally {
      setLoading(false)
    }
  }

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !newPassword.trim()) return
    setIsUpdatingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword.trim() })
    setIsUpdatingPassword(false)
    if (error) {
      setAuthNotice({ text: `Password update failed: ${error.message}`, error: true })
    } else {
      setAuthNotice({
        text: 'Password updated successfully! You can now sign in with your new password.',
        error: false,
      })
      setIsRecoverySession(false)
      setNewPassword('')
      setAuthMode('login')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090c14] dark:text-slate-100 flex flex-col justify-between p-4 sm:p-6">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between pb-6">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
            DP
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">DevProof</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              TikTrack Enterprise SaaS
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 text-xs font-medium cursor-pointer"
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center py-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#111623] p-6 sm:p-8 shadow-xl space-y-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Sign In Required
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              Welcome to DevProof
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Log in with your company or developer account to access your workspace.
            </p>
          </div>

          {authNotice && (
            <div
              className={`p-3 rounded-lg text-xs border ${authNotice.error
                ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                }`}
            >
              {authNotice.text}
            </div>
          )}

          {isRecoverySession ? (
            <form onSubmit={(e) => void handleSetNewPassword(e)} className="space-y-3 text-xs">
              <div className="p-3 rounded-lg border border-amber-500/50 bg-amber-950/20 text-amber-200 text-xs space-y-1">
                <strong>Password Recovery Session Verified</strong>
                <p className="text-[11px] text-slate-400">Enter your new password below.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
                  >
                    {/* {showPassword ? 'Hide' : 'Show'} */}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 py-2 pr-10 text-xs text-slate-900 dark:text-white"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                  // aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs cursor-pointer disabled:opacity-50"
              >
                {isUpdatingPassword ? 'Saving Password...' : 'Save New Password'}
              </button>
            </form>
          ) : (
            <>
              {/* Auth Mode Tabs */}
              <div className="flex rounded-lg bg-slate-100 dark:bg-white/5 p-1 text-xs font-medium">
                {(['signup', 'login', 'recovery'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAuthMode(m)}
                    className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${authMode === m
                      ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    {m === 'signup'
                      ? 'Sign Up'
                      : m === 'login'
                        ? 'Log In'
                        : 'Reset Password'}
                  </button>
                ))}
              </div>

              <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-3.5 text-xs">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Alex Silva"
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                {authMode === 'signup' && (
                  <CountryTimezonePicker
                    countryCode={authCountryCode}
                    timezone={authTimezone}
                    onChange={({ countryCode, countryName, timezone }) => {
                      setAuthCountryCode(countryCode)
                      setAuthCountryName(countryName)
                      setAuthTimezone(timezone)
                    }}
                  />
                )}

                {authMode !== 'recovery' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
                      >
                        {/* {showPassword ? 'Hide' : 'Show'} */}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 py-2 pr-10 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {loading
                    ? 'Processing...'
                    : authMode === 'login'
                      ? 'Sign In to Workspace'
                      : authMode === 'signup'
                        ? 'Create Verified Account'
                        : 'Send Password Reset Email'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="text-center text-[11px] text-slate-400 dark:text-slate-500 pt-6">
        DevProof • Secure Multi-Tenant Continuous Verification Engine
      </footer>
    </div>
  )
}

