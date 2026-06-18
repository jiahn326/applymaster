import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
// Lazy-loaded to keep initial bundle small
async function lazyExportPdf(...args: Parameters<typeof import('../lib/exportResume').exportPdf>) {
  const { exportPdf } = await import('../lib/exportResume')
  return exportPdf(...args)
}
async function lazyExportDocx(...args: Parameters<typeof import('../lib/exportResume').exportDocx>) {
  const { exportDocx } = await import('../lib/exportResume')
  return exportDocx(...args)
}
async function lazyExportGoogleDocs(...args: Parameters<typeof import('../lib/exportResume').exportGoogleDocs>) {
  const { exportGoogleDocs } = await import('../lib/exportResume')
  return exportGoogleDocs(...args)
}
import { tailorResume } from '../lib/tailorResume'
import { generateCoverLetter } from '../lib/generateCoverLetter'
import ResumeChangesView from '../components/ResumeChangesView'
import type { TailoredResume } from '../lib/tailorResume'
import type { ResumeStructure } from '../lib/parseResumeStructure'
import type { JobFitAnalysis } from '../lib/analyzeJobFit'

type Status = 'applied' | 'interviewing' | 'rejected' | 'offer'

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  applied:      { label: 'Applied',      className: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' },
  interviewing: { label: 'Interviewing', className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' },
  rejected:     { label: 'Rejected',     className: 'bg-red-50 text-red-500 ring-1 ring-red-200' },
  offer:        { label: '🎉 Offer',     className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' },
}

const VERDICT_CONFIG = {
  Apply: { label: 'Apply', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  Maybe: { label: 'Maybe', bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
  Skip:  { label: 'Skip',  bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-400' },
}

const CATEGORY_COLOR = {
  strong: { text: 'text-emerald-600', bar: 'bg-emerald-400' },
  good:   { text: 'text-blue-600',    bar: 'bg-blue-400' },
  reach:  { text: 'text-amber-600',   bar: 'bg-amber-400' },
  weak:   { text: 'text-red-500',     bar: 'bg-red-400' },
}

interface Application {
  id: string
  company: string
  role: string
  job_url: string | null
  job_description: string | null
  status: Status
  notes: string | null
  applied_through: string | null
  tailored_resume: TailoredResume | null
  fit_analysis: JobFitAnalysis | null
  cover_letter: string | null
  cover_letter_submitted: boolean
  created_at: string
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [app, setApp] = useState<Application | null>(null)
  const [structure, setStructure] = useState<ResumeStructure | null>(null)
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'resume' | 'cover'>('resume')
  const [toast, setToast] = useState<string | null>(null)
  const [editingMeta, setEditingMeta] = useState(false)
  const [editCompany, setEditCompany] = useState('')
  const [editRole, setEditRole] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }
  const [tailoring, setTailoring] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [coverLetterSubmitted, setCoverLetterSubmitted] = useState(false)
  const [generatingCL, setGeneratingCL] = useState(false)
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null)
  const [copiedCL, setCopiedCL] = useState(false)
  const [fitExpanded, setFitExpanded] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function load() {
      const [{ data: appData }, { data: resumes }] = await Promise.all([
        supabase.from('applications').select('*').eq('id', id).single(),
        supabase.from('resumes').select('content').order('created_at', { ascending: false }).limit(1),
      ])
      const a = appData as Application
      setApp(a)
      setNotesValue(a?.notes ?? '')
      setStructure(resumes?.[0]?.content?.structure ?? null)
      setRawText(resumes?.[0]?.content?.raw_text ?? '')
      if (a?.cover_letter) setCoverLetter(a.cover_letter)
      setCoverLetterSubmitted(a?.cover_letter_submitted ?? false)
      setLoading(false)
    }
    load()
  }, [id])

  async function updateStatus(status: Status) {
    if (!app) return
    setApp({ ...app, status })
    await supabase.from('applications').update({ status }).eq('id', id)
  }

  async function saveNotes() {
    if (!app) return
    setApp({ ...app, notes: notesValue })
    setEditingNotes(false)
    await supabase.from('applications').update({ notes: notesValue }).eq('id', id)
  }

  async function saveMeta() {
    if (!app) return
    const updated = { ...app, company: editCompany, role: editRole }
    setApp(updated)
    setEditingMeta(false)
    await supabase.from('applications').update({ company: editCompany, role: editRole }).eq('id', id)
  }

  async function handleDelete() {
    if (!confirm('Delete this application?')) return
    await supabase.from('applications').delete().eq('id', id)
    navigate('/dashboard')
  }

  async function handleReanalyze() {
    if (!app?.job_description || !rawText) return
    setReanalyzing(true)
    try {
      const { api } = await import('../lib/api')
      const result = await api.analyzeJobFit(rawText, app.job_description)
      await supabase.from('applications').update({ fit_analysis: result }).eq('id', id)
      setApp({ ...app, fit_analysis: result })
    } catch (err: any) {
      alert('Analysis failed: ' + (err.message ?? 'Unknown error'))
    } finally {
      setReanalyzing(false)
    }
  }

  async function handleTailor() {
    if (!app?.job_description || !rawText) return
    setTailoring(true)
    try {
      const result = await tailorResume(rawText, app.job_description)
      await supabase.from('applications').update({ tailored_resume: result }).eq('id', id)
      setApp({ ...app, tailored_resume: result })
      showToast('✉️ Want to generate a cover letter too?')
    } catch (err: any) {
      alert('Tailoring failed: ' + (err.message ?? 'Unknown error'))
    } finally {
      setTailoring(false)
    }
  }

  async function handleGenerateCoverLetter() {
    if (!app?.job_description) return
    setGeneratingCL(true)
    setCoverLetterError(null)
    try {
      const result = await generateCoverLetter(app.company, app.role, app.job_description, structure?.header)
      setCoverLetter(result)
      await supabase.from('applications').update({ cover_letter: result }).eq('id', app.id)
    } catch (err: any) {
      setCoverLetterError(err.message ?? 'Unknown error')
    } finally {
      setGeneratingCL(false)
    }
  }

  async function handleToggleCoverLetterSubmitted() {
    if (!app) return
    const next = !coverLetterSubmitted
    setCoverLetterSubmitted(next)
    await supabase.from('applications').update({ cover_letter_submitted: next }).eq('id', app.id)
  }

  function handleTabClick(t: 'resume' | 'cover') {
    setActiveTab(t)
    if (t === 'cover' && !coverLetter && !generatingCL && app?.job_description) {
      handleGenerateCoverLetter()
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  )

  if (!app) return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
      <p className="text-gray-400 text-sm">Application not found.</p>
    </div>
  )

  const fileName = `${app.company}_${app.role}`

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-700 transition-colors text-lg">←</button>
          {editingMeta ? (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <input value={editCompany} onChange={e => setEditCompany(e.target.value)}
                className="font-bold text-gray-900 border-b border-gray-300 focus:outline-none focus:border-gray-900 bg-transparent w-32"
                placeholder="Company" />
              <span className="text-gray-300">·</span>
              <input value={editRole} onChange={e => setEditRole(e.target.value)}
                className="text-gray-500 text-sm border-b border-gray-300 focus:outline-none focus:border-gray-900 bg-transparent flex-1 min-w-0"
                placeholder="Role" />
              <button onClick={saveMeta} className="text-xs font-semibold text-white bg-gray-900 hover:bg-gray-700 px-2.5 py-1 rounded-lg transition-colors shrink-0">Save</button>
              <button onClick={() => setEditingMeta(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0">Cancel</button>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="font-bold text-gray-900">{app.company}</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-500 text-sm truncate">{app.role}</span>
              <button onClick={() => { setEditCompany(app.company); setEditRole(app.role); setEditingMeta(true) }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0">✎</button>
            </div>
          )}
          <div className="flex items-center gap-3 shrink-0">
            {app.job_url && (
              <a href={app.job_url} target="_blank" rel="noreferrer" className="text-blue-500 text-xs hover:underline font-medium">View JD ↗</a>
            )}
            <button onClick={handleDelete} className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors">Delete</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-5">

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Status */}
          <div className={`relative inline-flex items-center gap-1 px-3 py-1 rounded-full cursor-pointer ${STATUS_CONFIG[app.status].className}`}>
            <select value={app.status} onChange={e => updateStatus(e.target.value as Status)}
              className="text-sm font-semibold cursor-pointer focus:outline-none appearance-none bg-transparent absolute inset-0 opacity-0 w-full">
              {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <span className="text-sm font-semibold pointer-events-none">{STATUS_CONFIG[app.status].label} ▾</span>
          </div>
          <span className="text-gray-400 text-sm">
            {new Date(app.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          {app.applied_through && <span className="text-gray-400 text-sm capitalize">via {app.applied_through}</span>}
        </div>

        {/* Fit Analysis */}
        {!app.fit_analysis && app.job_description && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">No fit analysis yet.</p>
            <button onClick={handleReanalyze} disabled={reanalyzing || !rawText}
              className="shrink-0 text-xs font-semibold bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors">
              {reanalyzing ? '✨ Analyzing...' : '✨ Analyze Fit'}
            </button>
          </div>
        )}
        {app.fit_analysis && (() => {
          const v = VERDICT_CONFIG[app.fit_analysis.verdict]
          return (
            <div className={`rounded-2xl border ${v.border} ${v.bg}`}>
              <button onClick={() => setFitExpanded(e => !e)} className="w-full flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />
                  <span className={`font-bold ${v.text}`}>{v.label}</span>
                  <span className="text-gray-400 text-sm">· {app.fit_analysis.overallScore}/100</span>
                  <span className={`text-sm ${v.text} hidden sm:block`}>— {app.fit_analysis.verdictReason}</span>
                </div>
                <span className="text-gray-400 text-xs shrink-0">{fitExpanded ? '▴ hide' : '▾ details'}</span>
              </button>
              {fitExpanded && (
                <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                  {app.fit_analysis.categories.map((cat, i) => {
                    const c = CATEGORY_COLOR[cat.verdict]
                    return (
                      <div key={i} className="bg-white rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-700">{cat.label}</span>
                          <span className={`text-xs font-bold capitalize ${c.text}`}>{cat.score}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                          <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${cat.score}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{cat.summary}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</p>
            {!editingNotes && (
              <button onClick={() => { setEditingNotes(true); setTimeout(() => notesRef.current?.focus(), 50) }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Edit</button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea ref={notesRef} value={notesValue} onChange={e => setNotesValue(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none h-20" />
              <div className="flex gap-2">
                <button onClick={saveNotes} className="text-xs font-semibold text-white bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">Save</button>
                <button onClick={() => { setEditingNotes(false); setNotesValue(app.notes ?? '') }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700">{app.notes || <span className="text-gray-400 italic">No notes</span>}</p>
          )}
        </div>

        {/* Resume + Cover Letter tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-100">
            {(['resume', 'cover'] as const).map(t => (
              <button key={t} onClick={() => handleTabClick(t)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  activeTab === t ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {t === 'resume' ? '📄 Resume' : '✉️ Cover Letter'}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* Resume tab */}
            {activeTab === 'resume' && (
              <div className="space-y-5">
                {app.tailored_resume && structure ? (
                  <>
                    {/* Export row + Re-tailor */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Export</span>
                      <button onClick={() => lazyExportPdf(structure, app.tailored_resume!, fileName)}
                        className="bg-gray-50 border border-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all text-xs">↓ PDF</button>
                      <button onClick={() => lazyExportDocx(structure, app.tailored_resume!, fileName)}
                        className="bg-gray-50 border border-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all text-xs">↓ DOCX</button>
                      <button
                        onClick={() => lazyExportGoogleDocs(structure, app.tailored_resume!)}
                        className="bg-gray-50 border border-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all text-xs"
                        title="Download HTML → upload to Google Drive → open with Google Docs"
                      >↓ Google Docs</button>
                      <button onClick={handleTailor} disabled={tailoring || !app.job_description}
                        className="ml-auto bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg transition-all text-xs">
                        {tailoring ? '✨ Re-tailoring...' : '↺ Re-tailor'}
                      </button>
                    </div>
                    <ResumeChangesView tailored={app.tailored_resume} structure={structure} />
                  </>
                ) : (
                  <button onClick={handleTailor} disabled={tailoring || !app.job_description}
                    className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
                    {tailoring ? '✨ Tailoring...' : '✨ Tailor Resume'}
                  </button>
                )}
                {!app.job_description && <p className="text-gray-400 text-sm text-center">Add a job description to enable tailoring.</p>}
              </div>
            )}

            {/* Cover Letter tab */}
            {activeTab === 'cover' && (
              <div className="space-y-4">
                {coverLetter ? (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={coverLetterSubmitted}
                          onChange={handleToggleCoverLetterSubmitted}
                          className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                        />
                        <span className="text-sm text-gray-600">I submitted this cover letter</span>
                      </label>
                      <button onClick={() => {
                        const lines = coverLetter.split('\n')
                        const dateIdx = lines.findIndex(l => /^(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(l.trim()))
                        const sincerelyIdx = lines.findIndex(l => /^sincerely/i.test(l.trim()))
                        const body = lines.slice(
                          dateIdx >= 0 ? dateIdx : 0,
                          sincerelyIdx >= 0 ? sincerelyIdx : undefined
                        ).join('\n').trim()
                        navigator.clipboard.writeText(body)
                        setCopiedCL(true)
                        setTimeout(() => setCopiedCL(false), 1500)
                      }}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                        {copiedCL ? <span className="text-emerald-600">✓ Copied!</span> : <span className="text-gray-600">Copy body</span>}
                      </button>
                    </div>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans bg-gray-50 rounded-xl p-4 border border-gray-100">
                      {coverLetter}
                    </pre>
                    <button onClick={handleGenerateCoverLetter} disabled={generatingCL || !app.job_description}
                      className="w-full bg-gray-50 border border-gray-200 text-gray-500 font-medium py-2.5 rounded-xl hover:bg-gray-100 transition-all text-sm disabled:opacity-40">
                      {generatingCL ? '✨ Regenerating...' : '↺ Regenerate'}
                    </button>
                  </>
                ) : generatingCL ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                    <p className="text-sm text-gray-400">Generating cover letter...</p>
                  </div>
                ) : coverLetterError ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <p className="text-sm text-red-500">Generation failed: {coverLetterError}</p>
                    <button onClick={handleGenerateCoverLetter} disabled={!app.job_description}
                      className="bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
                      Try Again
                    </button>
                  </div>
                ) : (
                  <button onClick={handleGenerateCoverLetter} disabled={!app.job_description}
                    className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
                    ✨ Generate Cover Letter
                  </button>
                )}
                {!app.job_description && <p className="text-gray-400 text-sm text-center">Add a job description to generate a cover letter.</p>}
              </div>
            )}
          </div>
        </div>

        {/* Job Description — collapsible */}
        {app.job_description && (
          <details className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <summary className="px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:bg-gray-50 transition-colors list-none flex items-center justify-between">
              Job Description
              <span className="text-gray-300 text-sm">▾</span>
            </summary>
            <div className="px-5 pb-5 border-t border-gray-100 pt-4">
              <p className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">{app.job_description}</p>
            </div>
          </details>
        )}
      </main>
      {/* Tailoring overlay */}
      {tailoring && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full mx-4">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" style={{ borderWidth: 3 }} />
            <div className="text-center">
              <p className="font-semibold text-gray-900">Tailoring your resume</p>
              <p className="text-gray-400 text-sm mt-1">Claude is rewriting your bullets to match the JD...</p>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3">
            <span>{toast}</span>
            <button
              onClick={() => { setActiveTab('cover'); setToast(null) }}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              Generate →
            </button>
            <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white transition-colors ml-1">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
