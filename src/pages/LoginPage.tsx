import { useState } from 'react'
import { supabase } from '../lib/supabase'

const DEV_EMAIL = import.meta.env.VITE_DEV_TEST_EMAIL as string | undefined
const DEV_PASSWORD = import.meta.env.VITE_DEV_TEST_PASSWORD as string | undefined

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleGoogle() {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
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

        <div className="space-y-3">
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <g fill="none" fillRule="evenodd">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </g>
            </svg>
            {loading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>

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

        {DEV_EMAIL && DEV_PASSWORD && (
          <input
            type="text"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="sr-only"
            aria-hidden
            tabIndex={-1}
          />
        )}
      </div>
    </div>
  )
}
