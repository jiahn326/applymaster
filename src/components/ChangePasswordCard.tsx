import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ChangePasswordCard() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setMessage({ ok: false, text: 'At least 6 characters' }); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: 'Password updated.' })
    if (!error) setPassword('')
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Change password</h2>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input type="password" value={password} onChange={e => { setPassword(e.target.value); setMessage(null) }}
          placeholder="New password" autoComplete="new-password"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        <button type="submit" disabled={loading || !password}
          className="bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
          {loading ? 'Updating…' : 'Update'}
        </button>
      </form>
      {message && <p className={`mt-2 text-xs ${message.ok ? 'text-emerald-600' : 'text-red-500'}`}>{message.text}</p>}
    </div>
  )
}
