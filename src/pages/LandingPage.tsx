import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

type DemoState = 'idle' | 'loading' | 'result' | 'error'

interface Diff {
  section: string
  original: string
  tailored: string
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [resumeText, setResumeText] = useState('')
  const [jobText, setJobText] = useState('')
  const [demoState, setDemoState] = useState<DemoState>('idle')
  const [diffs, setDiffs] = useState<Diff[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  async function handleDemo() {
    if (!resumeText.trim() || !jobText.trim()) return
    setDemoState('loading')
    setDiffs([])
    try {
      const result = await api.tailorResume(resumeText, jobText)
      setDiffs(result.diffs ?? [])
      setDemoState('result')
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Something went wrong. Try again.')
      setDemoState('error')
    }
  }

  function scrollToDemo() {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Nav */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-bold text-gray-900">ApplyMaster</span>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Sign in →
        </button>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          ✨ AI-powered resume tailoring
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-5">
          Tailor your resume for<br />every job, in seconds
        </h1>
        <p className="text-lg text-gray-500 mb-8 max-w-xl mx-auto">
          Paste a job description. ApplyMaster rewrites your resume bullets to match it, generates a cover letter, and tracks every application.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={scrollToDemo}
            className="bg-gray-900 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Try it free →
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-white border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Sign in
          </button>
        </div>
      </section>

      {/* Features row */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: '📄', title: 'Resume tailoring', desc: 'AI rewrites your bullets to match each job description' },
            { icon: '✉️', title: 'Cover letters', desc: 'Generates a personalized cover letter in one click' },
            { icon: '📋', title: 'Application tracking', desc: 'Track every job you\'ve applied to in one place' },
          ].map(f => (
            <div key={f.title} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="text-2xl mb-2">{f.icon}</div>
              <p className="font-semibold text-gray-900 text-sm mb-1">{f.title}</p>
              <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="max-w-3xl mx-auto px-6 pb-24">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Try it, no account needed</h2>
          <p className="text-sm text-gray-500 mb-6">Paste your resume and a job description to see AI tailoring in action.</p>

          {demoState !== 'result' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Your resume</label>
                <textarea
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder="Paste your resume as plain text..."
                  rows={8}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Job description</label>
                <textarea
                  value={jobText}
                  onChange={e => setJobText(e.target.value)}
                  placeholder="Paste the job description text (not a LinkedIn URL)..."
                  rows={6}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>

              {demoState === 'error' && (
                <p className="text-sm text-red-500">{errorMsg}</p>
              )}

              <button
                onClick={handleDemo}
                disabled={demoState === 'loading' || !resumeText.trim() || !jobText.trim()}
                className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {demoState === 'loading' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Tailoring your resume...
                  </span>
                ) : '✨ Tailor my resume'}
              </button>
            </div>
          )}

          {demoState === 'result' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {diffs.length} bullet{diffs.length !== 1 ? 's' : ''} rewritten
                </p>
                <button
                  onClick={() => { setDemoState('idle'); setDiffs([]) }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Try again
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {diffs.map((d, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{d.section}</p>
                    <p className="text-xs text-gray-400 line-through leading-relaxed">{d.original}</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{d.tailored}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="bg-violet-50 rounded-xl p-5 text-center space-y-3 border border-violet-100">
                <p className="font-semibold text-gray-900">Sign up to save this tailored resume</p>
                <p className="text-sm text-gray-500">Free account. Track applications, generate cover letters, and tailor resumes for every job.</p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-gray-900 hover:bg-gray-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
                >
                  Create free account →
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
