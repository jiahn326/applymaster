import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { extractJobInfo } from '../lib/extractJobInfo'
import { analyzeJobFit, type JobFitAnalysis } from '../lib/analyzeJobFit'

type AppliedThrough = 'linkedin' | 'indeed' | 'company' | 'referral' | 'other'
type Step = 'paste' | 'analyzing' | 'analysis' | 'form'

const APPLIED_THROUGH: { value: AppliedThrough; label: string }[] = [
  { value: 'linkedin',  label: 'LinkedIn' },
  { value: 'indeed',   label: 'Indeed' },
  { value: 'company',  label: 'Company Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'other',    label: 'Other' },
]

const VERDICT_CONFIG = {
  Apply: { label: 'Apply',  bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  Maybe: { label: 'Maybe',  bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400',   btn: 'bg-amber-500 hover:bg-amber-600' },
  Skip:  { label: 'Skip',   bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-400',     btn: 'bg-gray-600 hover:bg-gray-700' },
}

const CATEGORY_COLOR = {
  strong: { text: 'text-emerald-600', bar: 'bg-emerald-400' },
  good:   { text: 'text-blue-600',    bar: 'bg-blue-400' },
  reach:  { text: 'text-amber-600',   bar: 'bg-amber-400' },
  weak:   { text: 'text-red-500',     bar: 'bg-red-400' },
}

interface Props {
  onSaved: (app: any) => void
  onClose: () => void
}

export default function NewApplicationPanel({ onSaved, onClose }: Props) {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('paste')
  const [pasteText, setPasteText] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [appliedThrough, setAppliedThrough] = useState<AppliedThrough>('linkedin')
  const [analysis, setAnalysis] = useState<JobFitAnalysis | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    pasteRef.current?.focus()
  }, [])

  async function handlePaste(text: string) {
    if (!text.trim()) return
    setStep('analyzing')

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please try again.')), 30000)
    )

    try {
      const trimmed = text.trim()
      const isUrl = /^https?:\/\//i.test(trimmed)
      if (isUrl) setJobUrl(trimmed)

      // Fetch URL content and resume in parallel
      const [content, resumeData] = await Promise.race([
        Promise.all([
          isUrl
            ? fetch(`https://r.jina.ai/${trimmed}`, { headers: { 'Accept': 'text/plain' } })
                .then(r => r.ok ? r.text() : trimmed)
                .catch(() => trimmed)
            : Promise.resolve(trimmed),
          supabase.from('resumes').select('content').order('created_at', { ascending: false }).limit(1),
        ]),
        timeout,
      ])

      const rawText = resumeData.data?.[0]?.content?.raw_text as string | undefined
      const currentLocation = resumeData.data?.[0]?.content?.current_location as string | undefined

      const [info, fit] = await Promise.race([
        Promise.all([
          extractJobInfo(content),
          rawText ? analyzeJobFit(rawText, content, currentLocation) : Promise.resolve(null),
        ]),
        timeout,
      ])

      if (info.company) setCompany(info.company)
      if (info.role) setRole(info.role)
      if (info.jobDescription) setJobDescription(info.jobDescription)
      setAnalysis(fit)
      setStep('analysis')
    } catch (err: any) {
      setStep('paste')
      setError(err.message ?? 'Failed to analyze. Try pasting the job description text instead.')
    }
  }

  async function handleAutoSave() {
    setSaving(true)
    try {
      const { data, error: insertError } = await supabase
        .from('applications')
        .insert({
          company: company || 'Unknown',
          role: role || 'Unknown',
          job_url: jobUrl || null,
          job_description: jobDescription || null,
          notes: null,
          applied_through: null,
          status: 'applied',
          fit_analysis: analysis,
          user_id: user?.id,
        })
        .select()
        .single()
      if (insertError) throw insertError
      onSaved(data)
    } catch (err: any) {
      setError(err.message ?? 'Failed to save.')
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!company || !role) {
      setError('Company and role are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data, error: insertError } = await supabase
        .from('applications')
        .insert({
          company,
          role,
          job_url: jobUrl || null,
          job_description: jobDescription || null,
          notes: notes || null,
          applied_through: appliedThrough,
          status: 'applied',
          fit_analysis: analysis,
          user_id: user?.id,
        })
        .select()
        .single()
      if (insertError) throw insertError
      onSaved(data)
    } catch (err: any) {
      setError(err.message ?? 'Failed to save.')
      setSaving(false)
    }
  }

  const v = analysis ? VERDICT_CONFIG[analysis.verdict] : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          {step === 'form' && (
            <button onClick={() => setStep('analysis')} className="text-gray-400 hover:text-gray-700 transition-colors">
              ←
            </button>
          )}
          <h2 className="text-base font-semibold text-gray-900">
            {step === 'paste' || step === 'analyzing' ? 'New Application' :
             step === 'analysis' ? 'Fit Analysis' : 'Application Details'}
          </h2>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-md hover:bg-gray-100">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── STEP: PASTE ── */}
        {(step === 'paste' || step === 'analyzing') && (
          <div className="px-6 py-8 flex flex-col items-center text-center">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Paste a job URL or description</h3>
            <p className="text-gray-400 text-xs mb-6">We'll analyze how well you match before you decide to apply</p>

            <textarea
              ref={pasteRef}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              onPaste={e => {
                const text = e.clipboardData.getData('text')
                setTimeout(() => handlePaste(text), 50)
              }}
              disabled={step === 'analyzing'}
              placeholder="Paste a LinkedIn URL, Indeed URL, or the full job description text..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none h-32 disabled:bg-gray-50 disabled:text-gray-400"
            />

            {step === 'analyzing' && (
              <div className="mt-4 flex items-center gap-2 text-blue-600">
                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm font-medium animate-pulse">Analyzing your fit...</span>
              </div>
            )}

            {error && <p className="mt-3 text-red-500 text-xs">{error}</p>}

            <p className="mt-4 text-gray-300 text-xs">or</p>
            <button
              onClick={() => setStep('form')}
              className="mt-2 text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors underline underline-offset-2"
            >
              Fill in details manually
            </button>
          </div>
        )}

        {/* ── STEP: ANALYSIS ── */}
        {step === 'analysis' && analysis && v && (
          <div className="px-6 py-5 space-y-4">
            {/* Extracted info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <span className="text-base font-bold text-gray-500">{company.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{company || 'Unknown company'}</p>
                <p className="text-gray-500 text-xs">{role || 'Unknown role'}</p>
              </div>
            </div>

            {/* Verdict banner */}
            <div className={`rounded-xl border ${v.border} ${v.bg} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />
                  <span className={`text-base font-bold ${v.text}`}>{v.label}</span>
                </div>
                <span className="text-2xl font-bold text-gray-800">{analysis.overallScore}<span className="text-sm text-gray-400 font-normal">/100</span></span>
              </div>
              <p className={`text-xs ${v.text} leading-relaxed`}>{analysis.verdictReason}</p>
            </div>

            {/* Category breakdown */}
            <div className="space-y-3">
              {analysis.categories.map((cat, i) => {
                const c = CATEGORY_COLOR[cat.verdict]
                return (
                  <div key={i} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-gray-700">{cat.label}</span>
                      <span className={`text-xs font-semibold capitalize ${c.text}`}>{cat.verdict} · {cat.score}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                      <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${cat.score}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{cat.summary}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── STEP: FORM ── */}
        {step === 'form' && (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Company *</label>
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Google"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Role *</label>
                <input value={role} onChange={e => setRole(e.target.value)} placeholder="Software Engineer"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Job URL</label>
              <input value={jobUrl} onChange={e => setJobUrl(e.target.value)} placeholder="https://..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Applied through</label>
              <div className="flex flex-wrap gap-2">
                {APPLIED_THROUGH.map(opt => (
                  <button key={opt.value} onClick={() => setAppliedThrough(opt.value)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                      appliedThrough === opt.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Job Description</label>
              <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)}
                placeholder="Paste the full job description..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none h-28" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Recruiter name, referral contact..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none h-16" />
            </div>

            {error && <p className="text-red-500 text-xs">{error}</p>}
          </div>
        )}
      </div>

      {/* Footer */}
      {step === 'analysis' && v && (
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 space-y-2">
          <button
            onClick={handleAutoSave}
            disabled={saving}
            className={`w-full ${v.btn} text-white font-semibold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-60`}
          >
            {saving ? 'Saving...' : analysis?.verdict === 'Skip' ? 'Apply anyway →' : "Yes, I'll apply! →"}
          </button>
          <button
            onClick={() => { setPasteText(''); setStep('paste') }}
            className="w-full text-gray-500 hover:text-gray-800 font-medium py-2 rounded-xl transition-colors text-sm"
          >
            Try a different job
          </button>
        </div>
      )}

      {step === 'form' && (
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {saving ? 'Saving...' : 'Save Application'}
          </button>
        </div>
      )}
    </div>
  )
}
