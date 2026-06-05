import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
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

        {sent ? (
          <div className="space-y-3">
            <div className="text-4xl">📬</div>
            <p className="font-semibold text-gray-900">Check your email</p>
            <p className="text-gray-500 text-sm">We sent a magic link to <span className="font-medium text-gray-700">{email}</span>. Click it to sign in.</p>
            <button onClick={() => setSent(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors mt-2">
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
          </form>
        )}

        <p className="text-gray-400 text-xs mt-6">
          Your data is private — only you can see your applications.
        </p>
      </div>
    </div>
  )
}
