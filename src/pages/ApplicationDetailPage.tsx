import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { VERDICT_CONFIG, CATEGORY_COLOR } from '../lib/fitConfig'
// Lazy-loaded to keep initial bundle small
async function lazyExportPdf(...args: Parameters<typeof import('../lib/exportResume').exportPdf>) {
  const { exportPdf } = await import('../lib/exportResume')
  return exportPdf(...args)
}
import { tailorResume } from '../lib/tailorResume'
import { generateCoverLetter } from '../lib/generateCoverLetter'
import ResumeChangesView from '../components/ResumeChangesView'
import FitReasons from '../components/FitReasons'
import QuestionsTab from '../components/QuestionsTab'
import { placeholderCount, splitPlaceholders, type ApplicationAnswer } from '../lib/answers'
import { useAbortable } from '../hooks/useAbortable'
import { useSlowFlag } from '../hooks/useSlowFlag'
import { errorMessage, type ResumeRow, type UserSettingsRow } from '../lib/records'
import { resumeFileName, resolveTailoring, carryOverUndone, resumeToText } from '../lib/resumeUtils'
import { APPLIED_THROUGH, appliedThroughLabel } from '../lib/appliedThrough'
import { STATUS_CONFIG, TRACKED_STATUSES, type AppStatus } from '../lib/status'
import type { TailoredResume } from '../lib/tailorResume'
import type { ResumeStructure } from '../lib/parseResumeStructure'
import type { JobFitAnalysis } from '../lib/analyzeJobFit'

type Status = AppStatus

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
  answers: ApplicationAnswer[] | null
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [app, setApp] = useState<Application | null>(null)
  const [structure, setStructure] = useState<ResumeStructure | null>(null)
  const [rawText, setRawText] = useState('')
  const [resumeId, setResumeId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'resume' | 'cover' | 'questions'>('resume')
  const [toast, setToast] = useState<string | null>(null)
  const [editingMeta, setEditingMeta] = useState(false)
  const [editCompany, setEditCompany] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editingUrl, setEditingUrl] = useState(false)
  const [editingJd, setEditingJd] = useState(false)
  const [jdValue, setJdValue] = useState('')
  const [jdOpen, setJdOpen] = useState(false)
  // Set after the JD is edited: results below were made from the old JD
  const [jdChanged, setJdChanged] = useState(false)
  const jdRef = useRef<HTMLDivElement>(null)
  const [currentLocation, setCurrentLocation] = useState<string | undefined>()
  // Application questions and answers; saved in click order like Undo/Source
  const [answers, setAnswers] = useState<ApplicationAnswer[]>([])
  const answersRef = useRef<ApplicationAnswer[]>([])
  const answersQueue = useRef<Promise<unknown>>(Promise.resolve())
  const [urlValue, setUrlValue] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }
  const tailorJob = useAbortable()
  const reanalyzeJob = useAbortable()
  const coverLetterJob = useAbortable()
  const [tailoring, setTailoring] = useState(false)
  // Shown after Re-tailor: the new result replaces the old one, so say how it compares
  const [retailorNote, setRetailorNote] = useState<{ count: number; previous: number } | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [coverLetterSubmitted, setCoverLetterSubmitted] = useState(false)
  const [generatingCL, setGeneratingCL] = useState(false)
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null)
  const [copiedCL, setCopiedCL] = useState(false)
  const [editingCL, setEditingCL] = useState(false)
  const [clValue, setClValue] = useState('')
  const [fitExpanded, setFitExpanded] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const notesRef = useRef<HTMLTextAreaElement>(null)

  // Warn on browser close/refresh when editing
  useEffect(() => {
    const unsaved = editingMeta || editingNotes || editingUrl || editingJd || editingCL
    const handler = (e: BeforeUnloadEvent) => { if (unsaved) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [editingMeta, editingNotes, editingUrl, editingJd, editingCL])

  // Slow warning for long-running API calls
  const tailoringSlow = useSlowFlag(tailoring)
  const generatingCLSlow = useSlowFlag(generatingCL)

  useEffect(() => {
    async function load() {
      const [{ data: appData }, { data: settingsData }, { data: resumesData }] = await Promise.all([
        supabase.from('applications').select('*').eq('id', id).single(),
        supabase.from('user_settings').select('active_resume_id').single(),
        supabase.from('resumes').select('id, content').order('created_at', { ascending: false }),
      ])
      const a = appData as Application
      setApp(a)
      setNotesValue(a?.notes ?? '')
      answersRef.current = a?.answers ?? []
      setAnswers(answersRef.current)
      const activeId = (settingsData as UserSettingsRow | null)?.active_resume_id
      const resumes = (resumesData ?? []) as ResumeRow[]
      const resume = resumes.find(r => r.id === activeId) ?? resumes[0]
      setStructure(resume?.content?.structure ?? null)
      setRawText(resume?.content?.raw_text ?? '')
      setCurrentLocation(resume?.content?.current_location ?? undefined)
      setResumeId(resume?.id)
      if (a?.cover_letter) setCoverLetter(a.cover_letter)
      setCoverLetterSubmitted(a?.cover_letter_submitted ?? false)
      setLoading(false)
    }
    load()
  }, [id])

  // Saved → applied: dated today so the dashboard counts it from the day you applied
  async function markApplied() {
    if (!app) return
    const created_at = new Date().toISOString()
    const { error } = await supabase.from('applications').update({ status: 'applied', created_at }).eq('id', id)
    if (error) { alert('Could not update: ' + error.message); return }
    setApp({ ...app, status: 'applied', created_at })
  }

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

  function startEditJd() {
    setJdValue(app?.job_description ?? '')
    setEditingJd(true)
    setJdOpen(true)
    setTimeout(() => jdRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function saveJd() {
    if (!app) return
    const next = jdValue.trim() || null
    const hadResults = !!(app.fit_analysis || app.tailored_resume || coverLetter || answers.length)
    if (next !== app.job_description && app.job_description && hadResults) setJdChanged(true)
    setApp({ ...app, job_description: next })
    setEditingJd(false)
    await supabase.from('applications').update({ job_description: next }).eq('id', id)
  }

  // Only http(s) links are saved, so the posting links can never be javascript: URLs
  async function saveUrl() {
    if (!app) return
    const raw = urlValue.trim()
    let next: string | null = null
    if (raw) {
      try {
        const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
        next = u.toString()
      } catch {
        setUrlError('Enter a valid http(s) link')
        return
      }
    }
    setApp({ ...app, job_url: next })
    setEditingUrl(false)
    setUrlError(null)
    await supabase.from('applications').update({ job_url: next }).eq('id', id)
  }

  // Undo/Redo one suggested change. Saved right away, in click order, like the source chips.
  const diffQueue = useRef<Promise<unknown>>(Promise.resolve())
  const diffSeq = useRef(0)
  function toggleDiff(diffIndex: number) {
    if (!app?.tailored_resume) return
    const prev = app.tailored_resume
    const next = { ...prev, diffs: prev.diffs.map((d, i) => i === diffIndex ? { ...d, accepted: d.accepted === false } : d) }
    const seq = ++diffSeq.current
    setApp({ ...app, tailored_resume: next })
    diffQueue.current = diffQueue.current.then(async () => {
      const { error } = await supabase.from('applications').update({ tailored_resume: next }).eq('id', id)
      if (error && seq === diffSeq.current) {
        setApp(a => a && { ...a, tailored_resume: prev })
        alert('Could not save: ' + error.message)
      }
    })
  }

  // Saves immediately; clicking the selected option again clears it. Writes are
  // queued so rapid clicks reach the database in click order (last click wins).
  const sourceQueue = useRef<Promise<unknown>>(Promise.resolve())
  const sourceSeq = useRef(0)
  function saveAppliedThrough(value: string) {
    if (!app) return
    const prev = app.applied_through
    const next = prev === value ? null : value
    const seq = ++sourceSeq.current
    setApp({ ...app, applied_through: next })
    sourceQueue.current = sourceQueue.current.then(async () => {
      const { error } = await supabase.from('applications').update({ applied_through: next }).eq('id', id)
      if (error && seq === sourceSeq.current) {
        setApp(a => a && { ...a, applied_through: prev })
        alert('Could not save: ' + error.message)
      }
    })
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
    const signal = reanalyzeJob.start()
    setReanalyzing(true)
    try {
      const { api } = await import('../lib/api')
      const result = await api.analyzeJobFit(rawText, app.job_description, currentLocation, signal)
      if (signal.aborted) return
      await supabase.from('applications').update({ fit_analysis: result }).eq('id', id)
      setApp({ ...app, fit_analysis: result })
    } catch (err) {
      if (!signal.aborted) alert('Analysis failed: ' + errorMessage(err, 'Unknown error'))
    } finally {
      if (reanalyzeJob.isCurrent(signal)) setReanalyzing(false)
    }
  }

  async function handleTailor() {
    if (!app?.job_description || !rawText) return
    const signal = tailorJob.start()
    setTailoring(true)
    try {
      // Keep edits the user already undid if the same edit comes back
      const result = carryOverUndone(app.tailored_resume, await tailorResume({ id: resumeId, rawText, structure }, app.job_description, signal))
      if (signal.aborted) return
      await supabase.from('applications').update({ tailored_resume: result }).eq('id', id)
      setApp({ ...app, tailored_resume: result })
      if (app.tailored_resume) setRetailorNote({ count: result.diffs.length, previous: app.tailored_resume.diffs.length })
      else showToast('✉️ Want to generate a cover letter too?')
    } catch (err) {
      if (!signal.aborted) alert('Tailoring failed: ' + errorMessage(err, 'Unknown error'))
    } finally {
      if (tailorJob.isCurrent(signal)) setTailoring(false)
    }
  }

  // Regenerating replaces the whole letter, including edits made in the app
  function regenerateCoverLetter() {
    if (coverLetter && !confirm('Regenerate the cover letter? This replaces the current letter, including any edits.')) return
    setEditingCL(false)
    handleGenerateCoverLetter()
  }

  async function saveCoverLetterEdit() {
    if (!app) return
    const next = clValue.trim()
    setCoverLetter(next)
    setEditingCL(false)
    const { error } = await supabase.from('applications').update({ cover_letter: next }).eq('id', app.id)
    if (error) alert('Could not save the cover letter: ' + error.message)
  }

  async function handleGenerateCoverLetter() {
    if (!app?.job_description) return
    const signal = coverLetterJob.start()
    setGeneratingCL(true)
    setCoverLetterError(null)
    try {
      const result = await generateCoverLetter(app.company, app.role, app.job_description, structure?.header, submittedResumeText(), signal)
      if (signal.aborted) return
      setCoverLetter(result)
      await supabase.from('applications').update({ cover_letter: result }).eq('id', app.id)
    } catch (err) {
      if (!signal.aborted) setCoverLetterError(errorMessage(err, 'Unknown error'))
    } finally {
      if (coverLetterJob.isCurrent(signal)) setGeneratingCL(false)
    }
  }

  async function handleToggleCoverLetterSubmitted() {
    if (!app) return
    const next = !coverLetterSubmitted
    setCoverLetterSubmitted(next)
    await supabase.from('applications').update({ cover_letter_submitted: next }).eq('id', app.id)
  }

  // The resume actually being sent: this application's tailored version (undone
  // changes excluded), or the current resume if it wasn't tailored
  function submittedResumeText(): string | undefined {
    if (!app) return undefined
    const base = app.tailored_resume?.base?.structure ?? structure
    return app.tailored_resume && base
      ? resumeToText(resolveTailoring(base, app.tailored_resume).structure)
      : rawText || undefined
  }

  function changeAnswers(update: (prev: ApplicationAnswer[]) => ApplicationAnswer[]) {
    const next = update(answersRef.current)
    answersRef.current = next
    setAnswers(next)
    answersQueue.current = answersQueue.current.then(async () => {
      const { error } = await supabase.from('applications').update({ answers: next }).eq('id', id)
      if (error && answersRef.current === next) alert('Could not save answers: ' + error.message)
    })
  }

  function cancelJob(job: ReturnType<typeof useAbortable>, setBusy: (v: boolean) => void) {
    job.cancel()
    setBusy(false)
  }

  function handleTabClick(t: 'resume' | 'cover' | 'questions') {
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

  // Show and export a result against the resume it was tailored from; older results
  // (no saved base) fall back to the current resume and may not fully apply.
  const tailoredBase = app.tailored_resume?.base
  const viewStructure = tailoredBase?.structure ?? structure
  const viewRawText = tailoredBase?.rawText ?? rawText
  const resolution = app.tailored_resume && viewStructure ? resolveTailoring(viewStructure, app.tailored_resume) : null
  const notAppliedCount = resolution?.notApplied.length ?? 0
  const suggestedCount = notAppliedCount + (resolution?.applied.length ?? 0)
  const fileName = resumeFileName(viewStructure?.header.name)

  function handleExportPdf() {
    if (!app?.tailored_resume || !viewStructure) return
    if (notAppliedCount > 0 && !confirm(
      `${notAppliedCount} of ${suggestedCount} suggested changes couldn't be applied to this resume, so the PDF won't include them.\n\nDownload anyway? Choose Cancel to Re-tailor first.`
    )) return
    lazyExportPdf(viewStructure, app.tailored_resume, fileName, viewRawText)
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => {
            if ((editingMeta || editingNotes || editingUrl || editingJd || editingCL) && !confirm('Unsaved changes will be lost. Leave anyway?')) return
            navigate('/dashboard')
          }} className="text-gray-400 hover:text-gray-700 transition-colors text-lg">←</button>
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
              <a href={app.job_url} target="_blank" rel="noreferrer" className="text-blue-500 text-xs hover:underline font-medium">View posting ↗</a>
            )}
            <button onClick={handleDelete} className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors">Delete</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-5">

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Status */}
          {app.status === 'saved' ? (
            <div className="inline-flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${STATUS_CONFIG.saved.soft}`}>Saved</span>
              <button onClick={markApplied} className="text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white px-3 py-1 rounded-full transition-colors">Mark as applied</button>
            </div>
          ) : (
          <div className={`relative inline-flex items-center gap-1 px-3 py-1 rounded-full cursor-pointer ${STATUS_CONFIG[app.status].soft}`}>
            <select value={app.status} onChange={e => updateStatus(e.target.value as Status)}
              className="text-sm font-semibold cursor-pointer focus:outline-none appearance-none bg-transparent absolute inset-0 opacity-0 w-full">
              {TRACKED_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <span className="text-sm font-semibold pointer-events-none">{STATUS_CONFIG[app.status].label} ▾</span>
          </div>
          )}
          <span className="text-gray-400 text-sm">
            {new Date(app.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          {app.applied_through && <span className="text-gray-400 text-sm">via {appliedThroughLabel(app.applied_through)}</span>}
        </div>

        {/* Fit Analysis */}
        {!app.fit_analysis && app.job_description && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">No fit analysis yet.</p>
            <div className="flex items-center gap-1 shrink-0">
              {reanalyzing && (
                <button onClick={() => cancelJob(reanalyzeJob, setReanalyzing)} className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
              )}
              <button onClick={handleReanalyze} disabled={reanalyzing || !rawText}
                className="shrink-0 text-xs font-semibold bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors">
                {reanalyzing ? '✨ Analyzing...' : '✨ Analyze Fit'}
              </button>
            </div>
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
                  <span className={`text-sm ${v.text} hidden sm:block`}>· {app.fit_analysis.verdictReason}</span>
                </div>
                <svg className={`text-gray-400 transition-transform shrink-0 ${fitExpanded ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 5.5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {fitExpanded && (
                <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                  {app.fit_analysis.categories.map((cat, i) => {
                    const c = CATEGORY_COLOR[cat.verdict]
                    return (
                      <div key={i} className="bg-white rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-700">{cat.label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-bold capitalize ${c.text}`}>{cat.verdict}</span>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400">{cat.score}/100</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                          <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${cat.score}%` }} />
                        </div>
                        <FitReasons category={cat} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* Job posting link + Notes */}
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Job posting URL</p>
            {!editingUrl && (
              <button onClick={() => { setUrlValue(app.job_url ?? ''); setUrlError(null); setEditingUrl(true) }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">{app.job_url ? 'Edit' : 'Add'}</button>
            )}
          </div>
          {editingUrl ? (
            <div className="space-y-2">
              <input autoFocus value={urlValue} onChange={e => { setUrlValue(e.target.value); setUrlError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') saveUrl(); if (e.key === 'Escape') { setEditingUrl(false); setUrlError(null) } }}
                placeholder="https://… job posting URL"
                className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 ${urlError ? 'border-red-300' : 'border-gray-200'}`} />
              {urlError && <p className="text-xs text-red-500">{urlError}</p>}
              <div className="flex gap-2">
                <button onClick={saveUrl} className="text-xs font-semibold text-white bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">Save</button>
                <button onClick={() => { setEditingUrl(false); setUrlError(null) }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : app.job_url ? (
            <a href={app.job_url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 hover:underline truncate">{app.job_url} ↗</a>
          ) : (
            <p className="text-sm text-gray-400 italic">No link</p>
          )}

          <div className="border-t border-gray-100 my-4" />

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Applied through</p>
          <div className="flex flex-wrap gap-2">
            {APPLIED_THROUGH.map(opt => (
              <button key={opt.value} onClick={() => saveAppliedThrough(opt.value)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  app.applied_through === opt.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 my-4" />

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

        {/* JD was edited: offer to re-run what was built from the old one */}
        {jdChanged && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-amber-800">The job description was updated. Results below were made from the old version — re-run the ones you want.</p>
              <button onClick={() => setJdChanged(false)} aria-label="Dismiss" className="shrink-0 text-amber-500 hover:text-amber-800 text-sm leading-none">×</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {app.fit_analysis && (
                <button onClick={handleReanalyze} disabled={reanalyzing || !rawText}
                  className="text-xs font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
                  {reanalyzing ? '✨ Analyzing...' : '↺ Re-analyze fit'}
                </button>
              )}
              {app.tailored_resume && (
                <button onClick={handleTailor} disabled={tailoring || !rawText}
                  className="text-xs font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
                  {tailoring ? '✨ Re-tailoring...' : '↺ Re-tailor resume'}
                </button>
              )}
              {coverLetter && (
                <button onClick={regenerateCoverLetter} disabled={generatingCL}
                  className="text-xs font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
                  {generatingCL ? '✨ Regenerating...' : '↺ Regenerate cover letter'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Resume + Cover Letter tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-100">
            {(['resume', 'cover', 'questions'] as const).map(t => (
              <button key={t} onClick={() => handleTabClick(t)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  activeTab === t ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {t === 'resume' ? '📄 Resume' : t === 'cover' ? '✉️ Cover Letter' : `💬 Questions${answers.length ? ` (${answers.length})` : ''}`}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* Resume tab */}
            {activeTab === 'resume' && (
              <div className="space-y-5">
                {app.tailored_resume && viewStructure ? (
                  <>
                    {/* Export row + Re-tailor */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Export</span>
                      <button onClick={handleExportPdf}
                        className="bg-gray-50 border border-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all text-xs">↓ PDF</button>
                      <button onClick={handleTailor} disabled={tailoring || !app.job_description}
                        className="ml-auto bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg transition-all text-xs">
                        {tailoring ? '✨ Re-tailoring...' : '↺ Re-tailor'}
                      </button>
                    </div>
                    {retailorNote && (
                      <div className="flex items-start justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {retailorNote.count === 0
                            ? `Re-tailored: no changes this time (previous result had ${retailorNote.previous}). Your resume may already use this job's terms.`
                            : `Re-tailored: ${retailorNote.count} change${retailorNote.count === 1 ? '' : 's'} (previous result had ${retailorNote.previous}). The new result replaces the old one.`}
                          {' '}Changes that would alter facts, numbers, or tool names are left out.
                        </p>
                        <button onClick={() => setRetailorNote(null)} aria-label="Dismiss" className="shrink-0 text-gray-400 hover:text-gray-700 text-sm leading-none">×</button>
                      </div>
                    )}
                    {notAppliedCount > 0 && (
                      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <p className="text-xs text-amber-800 leading-relaxed">
                          {tailoredBase
                            ? `${notAppliedCount} of ${suggestedCount} suggested changes couldn't be matched to the resume they were made from.`
                            : `This result was made from an earlier version of your resume, so ${notAppliedCount} of ${suggestedCount} changes can't be applied to your current resume.`}
                        </p>
                        <button onClick={handleTailor} disabled={tailoring || !app.job_description}
                          className="shrink-0 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg transition-colors text-xs">
                          {tailoring ? '✨ Re-tailoring...' : '↺ Re-tailor'}
                        </button>
                      </div>
                    )}
                    <ResumeChangesView tailored={app.tailored_resume} structure={viewStructure} rawText={viewRawText} onToggleDiff={toggleDiff} />
                  </>
                ) : (
                  <button onClick={handleTailor} disabled={tailoring || !app.job_description}
                    className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
                    {tailoring ? '✨ Tailoring...' : '✨ Tailor Resume'}
                  </button>
                )}
                {!app.job_description && <button onClick={startEditJd} className="block mx-auto text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2">Add a job description to enable tailoring</button>}
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
                        const n = placeholderCount(coverLetter)
                        if (n && !confirm(`This cover letter still has ${n} placeholder${n === 1 ? '' : 's'} to fill in with a real example. Copy anyway?`)) return
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
                    {editingCL ? (
                      <div className="space-y-2">
                        <textarea autoFocus value={clValue} onChange={e => setClValue(e.target.value)}
                          className="w-full text-sm text-gray-700 leading-relaxed border border-gray-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y h-96" />
                        <div className="flex items-center gap-2">
                          <button onClick={saveCoverLetterEdit} className="text-xs font-semibold text-white bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg">Save</button>
                          <button onClick={() => setEditingCL(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">Cancel</button>
                          {placeholderCount(clValue) > 0 && (
                            <span className="text-xs text-amber-700">{placeholderCount(clValue)} placeholder{placeholderCount(clValue) === 1 ? '' : 's'} left to fill in</span>
                          )}
                          <span className="ml-auto text-xs text-gray-400">{clValue.trim().length} chars</span>
                        </div>
                      </div>
                    ) : (
                    <>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans bg-gray-50 rounded-xl p-4 border border-gray-100">
                      {splitPlaceholders(coverLetter).map((part, i) => part.placeholder
                        ? <mark key={i} className="bg-amber-100 text-amber-900 rounded px-0.5 font-medium">{part.text}</mark>
                        : <span key={i}>{part.text}</span>)}
                    </pre>
                    {placeholderCount(coverLetter) > 0 && (
                      <p className="text-xs text-amber-700">
                        Your resume doesn't include a story for the highlighted part, so it was left as a placeholder instead of made up. Use Edit to replace it with what really happened before sending.
                      </p>
                    )}
                    <button onClick={() => { setClValue(coverLetter); setEditingCL(true) }}
                      className="text-xs font-medium text-gray-500 hover:text-gray-900 underline underline-offset-2">Edit cover letter</button>
                    </>
                    )}
                    <div className="flex gap-2">
                      <button onClick={regenerateCoverLetter} disabled={generatingCL || !app.job_description}
                        className="flex-1 bg-gray-50 border border-gray-200 text-gray-500 font-medium py-2.5 rounded-xl hover:bg-gray-100 transition-all text-sm disabled:opacity-40">
                        {generatingCL ? '✨ Regenerating...' : '↺ Regenerate'}
                      </button>
                      {generatingCL && (
                        <button onClick={() => cancelJob(coverLetterJob, setGeneratingCL)}
                          className="bg-white border border-gray-200 text-gray-600 font-medium px-4 py-2.5 rounded-xl hover:bg-gray-100 transition-all text-sm">
                          Cancel
                        </button>
                      )}
                    </div>
                  </>
                ) : generatingCL ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                    <p className="text-sm text-gray-400">Generating cover letter...</p>
                    {generatingCLSlow && <p className="text-amber-500 text-xs">Taking longer than usual — hang tight</p>}
                    <button onClick={() => cancelJob(coverLetterJob, setGeneratingCL)} className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
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
                {!app.job_description && <button onClick={startEditJd} className="block mx-auto text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2">Add a job description to generate a cover letter</button>}
              </div>
            )}

            {/* Questions tab */}
            {activeTab === 'questions' && (
              <QuestionsTab
                company={app.company}
                role={app.role}
                jobDescription={app.job_description}
                answers={answers}
                resumeText={submittedResumeText()}
                onChange={changeAnswers}
                onAddJobDescription={startEditJd}
              />
            )}
          </div>
        </div>

        {/* Job Description — collapsible, editable */}
        <div ref={jdRef} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden scroll-mt-4">
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <button onClick={() => setJdOpen(o => !o)} disabled={editingJd}
              className="flex-1 flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wide text-left">
              Job Description
              {!editingJd && <span className={`text-gray-300 text-sm transition-transform ${jdOpen ? 'rotate-180' : ''}`}>▾</span>}
            </button>
            {!editingJd && (
              <button onClick={startEditJd} className="shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                {app.job_description ? 'Edit' : 'Add'}
              </button>
            )}
          </div>
          {editingJd ? (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-2">
              <p className="text-xs text-gray-400">Paste the full job posting — responsibilities, requirements, and preferred skills. Fit analysis, tailoring, and cover letters all use this text.</p>
              <textarea autoFocus value={jdValue} onChange={e => setJdValue(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y h-72" />
              <div className="flex gap-2">
                <button onClick={saveJd} className="text-xs font-semibold text-white bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">Save</button>
                <button onClick={() => setEditingJd(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : jdOpen && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4">
              {app.job_description
                ? <p className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">{app.job_description}</p>
                : <p className="text-sm text-gray-400 italic">No job description yet.</p>}
            </div>
          )}
        </div>
      </main>
      {/* Tailoring overlay */}
      {tailoring && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full mx-4">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" style={{ borderWidth: 3 }} />
            <div className="text-center">
              <p className="font-semibold text-gray-900">Tailoring your resume</p>
              <p className="text-gray-400 text-sm mt-1">Claude is rewriting your bullets to match the JD...</p>
              {tailoringSlow && <p className="text-amber-500 text-xs mt-2">Taking longer than usual — hang tight</p>}
            </div>
            <button onClick={() => cancelJob(tailorJob, setTailoring)}
              className="w-full border border-gray-200 text-gray-600 font-medium py-2 rounded-xl hover:bg-gray-50 transition-colors text-sm">
              Cancel
            </button>
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
