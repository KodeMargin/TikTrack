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
  const [pendingOtpType, setPendingOtpType] = useState<'signup' | 'recovery' | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [verifyingOtp, setVerifyingOtp] = useState(false)

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
        const resp = await fetch('/api/prisma/auth/owner-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authEmail.trim(),
            password: authPassword,
            fullName: authFullName.trim() || authEmail.trim().split('@')[0],
            timezone: authTimezone,
            countryCode: authCountryCode,
            countryName: authCountryName,
            redirectTo: appRedirect,
          }),
        })
        const result = (await resp.json().catch(() => ({}))) as {
          ok?: boolean
          message?: string
          hasOtp?: boolean
        }
        if (!resp.ok || !result.ok) {
          setAuthNotice({
            text: result.message || 'Owner signup verification failed.',
            error: true,
          })
        } else {
          setPendingOtpType('signup')
          setOtpCode('')
          setAuthNotice({
            text:
              result.message ||
              `Verification link & 6-digit OTP sent to ${authEmail} via Resend. Check your inbox!`,
            error: false,
          })
        }
      } else {
        const resp = await fetch('/api/prisma/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authEmail.trim(),
            redirectTo: appRedirect,
          }),
        })
        const result = (await resp.json().catch(() => ({}))) as { ok?: boolean; message?: string }
        if (!resp.ok || !result.ok) {
          setAuthNotice({
            text: result.message || 'Failed to send password reset email via Resend.',
            error: true,
          })
        } else {
          setPendingOtpType('recovery')
          setOtpCode('')
          setAuthNotice({
            text: result.message || `Password recovery link & 6-digit OTP dispatched to ${authEmail} via Resend. Check your inbox!`,
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

  async function handleVerifyOtpFallback(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !pendingOtpType || !authEmail.trim() || !otpCode.trim()) return
    setVerifyingOtp(true)
    setAuthNotice(null)
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: authEmail.trim(),
        token: otpCode.trim(),
        type: pendingOtpType,
      })
      if (error) {
        setAuthNotice({ text: `OTP verification failed: ${error.message}`, error: true })
      } else if (pendingOtpType === 'recovery') {
        setPendingOtpType(null)
        setOtpCode('')
        setIsRecoverySession(true)
        setAuthNotice({
          text: '6-digit reset code verified! Enter your new password below.',
          error: false,
        })
      } else {
        setPendingOtpType(null)
        setOtpCode('')
        setAuthNotice({
          text: 'Email verified via 6-digit OTP! Signing you into your workspace...',
          error: false,
        })
      }
    } catch (err: unknown) {
      setAuthNotice({
        text: err instanceof Error ? err.message : String(err),
        error: true,
      })
    } finally {
      setVerifyingOtp(false)
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
    <div className="min-h-screen bg-[#f5f5f9] text-zinc-900 dark:bg-[#07070a] dark:text-zinc-100 flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_65%_50%_at_50%_-10%,rgba(109,37,218,0.1),transparent)] dark:bg-[radial-gradient(ellipse_65%_50%_at_50%_-10%,rgba(139,81,225,0.18),transparent)]"
      />
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between pb-6 relative z-10">
        <div className="flex items-center gap-2.5">
          <img
            src={theme === 'dark' ? '/images/Logo-Light2.png' : '/images/Logo-Dark2.png'}
            alt="TikTrack"
            className="h-9 w-auto object-contain"
          />
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-50 shadow-(--dp-shadow-pill) dark:bg-white/[0.05] dark:hover:bg-white/[0.09] text-xs font-medium cursor-pointer transition"
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center py-6 relative z-10">
        <div className="dp-view-enter w-full max-w-md rounded-2xl border border-zinc-200 bg-white dark:bg-[#121218] p-6 sm:p-8 space-y-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8b51e1]">
              Sign In Required
            </span>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white mt-1">
              Welcome to TikTrack
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
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
              <div className="p-3 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 text-xs space-y-1">
                <strong>Password Recovery Session Verified</strong>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Enter your new password below.</p>
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
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
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
                className="w-full py-2.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] font-semibold text-white text-xs cursor-pointer disabled:opacity-50"
              >
                {isUpdatingPassword ? 'Saving Password...' : 'Save New Password'}
              </button>
            </form>
          ) : (
            <>
              {/* Auth Mode Tabs */}
              <div className="flex rounded-xl bg-zinc-200/60 dark:bg-white/[0.045] p-1 text-xs font-medium shadow-[inset_0_1px_2px_rgba(15,5,31,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
                {(['signup', 'login', 'recovery'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAuthMode(m)}
                    className={`flex-1 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${authMode === m
                      ? 'bg-white dark:bg-[#6d25da]/30 text-[#581eae] dark:text-[#e2d3f8] shadow-xs font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                  >
                    {m === 'signup'
                      ? 'Owner Sign Up'
                      : m === 'login'
                        ? 'Log In'
                        : 'Reset Password'}
                  </button>
                ))}
              </div>

              {authMode === 'signup' && (
                <div className="p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/30 text-[11px] text-indigo-800 dark:text-indigo-200 leading-relaxed">
                  <strong>Tenant Owners Only:</strong> Self-registration creates a new company workspace.
                  Team members (developers, PMs, reviewers) must be invited by their Tenant Owner and sign in with their temporary password.
                </div>
              )}

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
                      className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
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
                    className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
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
                        className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 py-2 pr-10 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
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
                  className="w-full py-2.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] font-semibold text-white text-xs transition cursor-pointer disabled:opacity-50"
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

              {pendingOtpType && (
                <form
                  onSubmit={(e) => void handleVerifyOtpFallback(e)}
                  className="mt-4 pt-4 border-t border-zinc-200 dark:border-white/10 space-y-2.5 text-xs"
                >
                  <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    Link didn&apos;t work? Enter the 6-digit OTP from your email:
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="123456"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\s+/g, ''))}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                      required
                    />
                    <button
                      type="submit"
                      disabled={verifyingOtp || otpCode.trim().length < 6}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {verifyingOtp ? 'Verifying...' : 'Verify OTP'}
                    </button>
                  </div>
                </form>
              )}
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

