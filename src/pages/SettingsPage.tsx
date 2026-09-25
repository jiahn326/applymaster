import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const DEFAULT_TEMPLATE = `[NAME]
[CONTACT]

[TODAY_DATE]

Dear Hiring Manager,

I am writing to express my interest in the [POSITION_NAME] position at [COMPANY_NAME].

[BODY]

Thank you for considering my application. I look forward to discussing how my background would benefit your team.

Sincerely,
[NAME]`

export default function SettingsPage() {
  const [template, setTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('user_settings')
        .select('cover_letter_template')
        .eq('user_id', user.id)
        .single()
      setTemplate(data?.cover_letter_template ?? DEFAULT_TEMPLATE)
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      cover_letter_template: template,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← Dashboard
          </button>
          <span className="text-lg font-bold text-gray-900">Settings</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Cover Letter Template</h2>
          <p className="text-xs text-gray-400 mb-4">
            Claude will fill in the placeholders based on the company and JD. Available placeholders:{' '}
            <code className="bg-gray-100 px-1 rounded">[NAME]</code>{' '}
            <code className="bg-gray-100 px-1 rounded">[CONTACT]</code>{' '}
            <code className="bg-gray-100 px-1 rounded">[TODAY_DATE]</code>{' '}
            <code className="bg-gray-100 px-1 rounded">[COMPANY_NAME]</code>{' '}
            <code className="bg-gray-100 px-1 rounded">[POSITION_NAME]</code>{' '}
            <code className="bg-gray-100 px-1 rounded">[BODY]</code>
          </p>

          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
            </div>
          ) : (
            <textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={20}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          )}

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setTemplate(DEFAULT_TEMPLATE)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Reset to default
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
