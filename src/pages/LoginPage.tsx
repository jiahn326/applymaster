import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup' | 'forgot'

const DEV_EMAIL = import.meta.env.VITE_DEV_TEST_EMAIL as string | undefined
const DEV_PASSWORD = import.meta.env.VITE_DEV_TEST_PASSWORD as string | undefined

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    if (mode !== 'forgot' && !password) return
    setLoading(true)
    setError(null)

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) setError(error.message)
      else setSent(true)
    } else if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) setError(error.message)
      else setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-sm text-center">
        {/* Logo */}
        <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center mx-auto mb-5">
          <span className="text-white font-bold text-lg">A</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">ApplyMaster</h1>
        <p className="text-gray-500 text-sm mb-8">Your AI-powered job application tracker</p>

        {sent ? (
          <div className="space-y-3">
            <div className="text-4xl">📬</div>
            <p className="font-semibold text-gray-900">Check your email</p>
            <p className="text-gray-500 text-sm">
              {mode === 'forgot'
                ? <>We sent a password reset link to <span className="font-medium text-gray-700">{email}</span>.</>
                : <>We sent a confirmation link to <span className="font-medium text-gray-700">{email}</span>.</>}
            </p>
            <button onClick={() => { setSent(false); setMode('signin') }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors mt-2">
              Back to sign in
            </button>
          </div>
        ) : mode === 'forgot' ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-gray-500 text-sm mb-2">Enter your email and we'll send a reset link.</p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              {loading ? '...' : 'Send reset link'}
            </button>
            <button type="button" onClick={() => { setMode('signin'); setError(null) }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              {loading ? '...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <div className="flex justify-between text-xs text-gray-400">
              <button type="button" onClick={() => { setMode('forgot'); setError(null) }} className="hover:text-gray-600 transition-colors">
                Forgot password?
              </button>
              <span>
                {mode === 'signin' ? "No account?" : 'Have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
                  className="text-gray-600 hover:text-gray-900 underline"
                >
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </span>
            </div>
          </form>
        )}

        <p className="text-gray-400 text-xs mt-6">
          Your data is private. Only you can see your applications.
        </p>

        {DEV_EMAIL && DEV_PASSWORD && email === 'applymaster' && (
          <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
            <button
              onClick={() => supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium py-2 rounded-lg transition-colors"
            >
              Sign in as test user
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
