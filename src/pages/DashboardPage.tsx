import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import NewApplicationPanel from '../components/NewApplicationPanel'
import { useAuth } from '../hooks/useAuth'
import { APPLIED_THROUGH, appliedThroughShort } from '../lib/appliedThrough'
import SourceIcon from '../components/SourceIcon'
import { STATUS_CONFIG, TRACKED_STATUSES, FOLLOW_UP_DAYS, needsFollowUp, daysSince, type AppStatus } from '../lib/status'

type Status = AppStatus
type FilterTab = 'all' | 'followup' | Status

interface Application {
  id: string
  created_at: string
  company: string
  role: string
  job_url: string | null
  status: Status
  notes: string | null
  applied_through: string | null
  cover_letter: string | null
  cover_letter_submitted: boolean
  fit_analysis: { verdict: 'Apply' | 'Maybe' | 'Skip'; overallScore: number } | null
}

type SortKey = 'newest' | 'oldest' | 'fit' | 'company'
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',  label: 'Newest first' },
  { value: 'oldest',  label: 'Oldest first' },
  { value: 'fit',     label: 'Fit: high → low' },
  { value: 'company', label: 'Company A → Z' },
]
const SORT_STORAGE_KEY = 'applymaster.dashboardSort'

function readSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY)
    return SORT_OPTIONS.some(o => o.value === v) ? (v as SortKey) : 'newest'
  } catch { return 'newest' }
}

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all',          label: 'All' },
  { value: 'applied',      label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'no_response',  label: 'No response' },
  { value: 'offer',        label: 'Offers' },
  { value: 'rejected',     label: 'Rejected' },
]

function StatusSelect({ app, onChange }: { app: Application; onChange: (e: React.ChangeEvent<HTMLSelectElement>, id: string) => void }) {
  const cfg = STATUS_CONFIG[app.status]
  return (
    <div className="relative inline-flex items-center">
      <select
        value={app.status}
        onChange={e => onChange(e, app.id)}
        className={`appearance-none text-xs font-semibold pl-2.5 pr-6 py-1 rounded-full border-0 cursor-pointer focus:outline-none ${cfg.solid}`}
      >
        {TRACKED_STATUSES.map(s => (
          <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 opacity-70" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </div>
  )
}

const DAILY_GOAL = 3

function cellEmoji(count: number) {
  if (count === 0) return null
  if (count === 1) return '🌱'
  if (count === 2) return '🌿'
  if (count === 3) return '🌳'
  return '🔥'
}

function motivationMessage(todayCount: number, streak: number): string {
  if (todayCount === 0 && streak === 0) return "Let's get started! 💪"
  if (todayCount === 0) return `You had a ${streak}-day streak. Keep it up!`
  if (todayCount >= DAILY_GOAL * 2) return 'Beast mode activated 🚀'
  if (todayCount >= DAILY_GOAL) return "Goal reached! You're crushing it 🎉"
  if (todayCount === DAILY_GOAL - 1) return 'Almost there! One more 👀'
  if (streak >= 7) return `${streak} days straight 🔥 Unstoppable!`
  return 'Good progress, keep going!'
}

function ActivityHeatmap({ applications }: { applications: { created_at: string }[] }) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const WEEKS = 16
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const countByDay: Record<string, number> = {}
  for (const a of applications) {
    const d = new Date(a.created_at)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    countByDay[key] = (countByDay[key] ?? 0) + 1
  }

  const startDay = new Date(today)
  startDay.setDate(today.getDate() - (WEEKS * 7 - 1))

  const cells: { date: Date; count: number }[] = []
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(startDay)
    d.setDate(startDay.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    cells.push({ date: d, count: countByDay[key] ?? 0 })
  }

  let streak = 0
  const check = new Date(today)
  while (true) {
    const key = check.toISOString().slice(0, 10)
    if ((countByDay[key] ?? 0) === 0) break
    streak++
    check.setDate(check.getDate() - 1)
  }

  const todayKey = today.toISOString().slice(0, 10)
  const todayCount = countByDay[todayKey] ?? 0
  const goalReached = todayCount >= DAILY_GOAL

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  function handleMouseEnter(e: React.MouseEvent, cell: { date: Date; count: number }) {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return
    const label = cell.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const text = cell.count === 0 ? `No applications on ${label}` : `${cell.count} application${cell.count > 1 ? 's' : ''} on ${label}`
    setTooltip({ text, x: rect.left - containerRect.left + rect.width / 2, y: rect.top - containerRect.top - 8 })
  }

  return (
    <div ref={containerRef} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 mb-6 relative">

      {/* Top row: streak + message + today goal */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2.5 py-1 rounded-full">
              🔥 {streak} day streak
            </span>
          )}
          <span className="text-xs text-gray-400 italic">{motivationMessage(todayCount, streak)}</span>
        </div>

        <span className="text-xs font-semibold text-gray-500">
          Today: <span className={goalReached ? 'text-emerald-500' : 'text-gray-800'}>{todayCount}</span>
        </span>
      </div>

      {/* Month labels */}
      <div className="flex gap-1 mb-1 ml-8">
        {Array.from({ length: WEEKS }).map((_, wi) => {
          const weekStart = cells[wi * 7]?.date
          const showMonth = wi === 0 || weekStart?.getDate() <= 7
          return (
            <div key={wi} className="w-5 text-center">
              {showMonth && <span className="text-[9px] text-gray-300">{weekStart?.toLocaleDateString('en-US', { month: 'short' })}</span>}
            </div>
          )
        })}
      </div>

      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-1 mr-1">
          {DAYS.map((d, i) => (
            <div key={d} className="h-5 flex items-center">
              {i % 2 === 1
                ? <span className="text-[9px] text-gray-300 w-7 text-right">{d}</span>
                : <span className="w-7" />}
            </div>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="flex gap-1 overflow-x-auto">
          {Array.from({ length: WEEKS }).map((_, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {Array.from({ length: 7 }).map((_, di) => {
                const cell = cells[wi * 7 + di]
                if (!cell) return <div key={di} className="w-5 h-5" />
                const isToday = cell.date.getTime() === today.getTime()
                const emoji = cellEmoji(cell.count)
                return (
                  <div
                    key={di}
                    className={`w-5 h-5 rounded flex items-center justify-center cursor-default transition-transform hover:scale-125 ${
                      emoji ? 'bg-transparent' : isToday ? 'bg-gray-100 ring-1 ring-gray-300' : 'bg-gray-100'
                    }`}
                    onMouseEnter={e => handleMouseEnter(e, cell)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {emoji
                      ? <span className="text-base leading-none select-none">{emoji}</span>
                      : null
                    }
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-3 justify-end">
        {(['🌱 1', '🌿 2', '🌳 3', '🔥 4+'] as const).map(l => (
          <span key={l} className="text-[10px] text-gray-300">{l}</span>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none bg-gray-900 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [hasResume, setHasResume] = useState<boolean | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  // Saved postings (not applied yet) live in their own tab, apart from tracked applications
  const [view, setView] = useState<'applications' | 'saved'>('applications')
  const [sort, setSort] = useState<SortKey>(readSort)

  function changeSort(next: SortKey) {
    setSort(next)
    try { localStorage.setItem(SORT_STORAGE_KEY, next) } catch { /* private mode: keep for this visit only */ }
  }
  const [search, setSearch] = useState('')
  // 'all', 'none' (no source set yet), or an applied_through value
  const [source, setSource] = useState('all')
  const [showNewPanel, setShowNewPanel] = useState(false)
  const [undoItem, setUndoItem] = useState<{ app: Application; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [showChangePw, setShowChangePw] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const navigate = useNavigate()
  const { signOut } = useAuth()

  useEffect(() => {
    async function load() {
      const [{ data: resumes }, { data: apps }] = await Promise.all([
        supabase.from('resumes').select('id').limit(1),
        supabase.from('applications')
          .select('*')
          .order('created_at', { ascending: false }),
      ])
      const hasAnyResume = (resumes?.length ?? 0) > 0
      setHasResume(hasAnyResume)
      setApplications((apps as Application[]) ?? [])
      setLoading(false)
      if (!hasAnyResume && (apps?.length ?? 0) === 0) {
        navigate('/resume/upload')
      }
    }
    load()
  }, [])

  function handleSaved(app: Application) {
    setApplications(prev => [app, ...prev])
    setShowNewPanel(false)
    if (app.status === 'saved') { setView('saved'); setFilter('all'); return }
    navigate(`/applications/${app.id}`)
  }

  // Applying to a saved posting: it joins the tracked list dated today, so the
  // heatmap, streak, and 30-day follow-up count from the day you actually applied
  async function handleMarkApplied(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const created_at = new Date().toISOString()
    const { error } = await supabase.from('applications').update({ status: 'applied', created_at }).eq('id', id)
    if (error) { alert('Could not update: ' + error.message); return }
    setApplications(prev => prev.map(a => a.id === id ? { ...a, status: 'applied' as const, created_at } : a)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
  }

  async function handleBulkNoResponse(ids: string[]) {
    if (!ids.length || !confirm(`Mark ${ids.length} application${ids.length === 1 ? '' : 's'} as "No response"?`)) return
    const { error } = await supabase.from('applications').update({ status: 'no_response' }).in('id', ids)
    if (error) { alert('Could not update: ' + error.message); return }
    const set = new Set(ids)
    setApplications(prev => prev.map(a => set.has(a.id) ? { ...a, status: 'no_response' as const } : a))
    setFilter('no_response')
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const app = applications.find(a => a.id === id)
    if (!app) return

    // Remove from UI and DB immediately
    setApplications(prev => prev.filter(a => a.id !== id))
    await supabase.from('applications').delete().eq('id', id)

    // Cancel any previous undo toast
    if (undoItem) clearTimeout(undoItem.timer)

    const timer = setTimeout(() => setUndoItem(null), 5000)
    setUndoItem({ app, timer })
  }

  async function handleUndo() {
    if (!undoItem) return
    clearTimeout(undoItem.timer)
    // Re-insert the deleted row
    const { data } = await supabase.from('applications').insert(undoItem.app).select().single()
    if (data) {
      setApplications(prev => [data as Application, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    }
    setUndoItem(null)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!newPw || newPw.length < 6) { setPwMsg({ ok: false, text: 'At least 6 characters' }); return }
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwMsg({ ok: false, text: error.message })
    else { setPwMsg({ ok: true, text: 'Password updated!' }); setNewPw(''); setTimeout(() => setShowChangePw(false), 1500) }
    setPwLoading(false)
  }

  async function handleSeedData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const jd = `We are looking for a Software Engineer to join our team. You will design and build scalable frontend applications using React and TypeScript. You will collaborate with product and design teams to ship high-quality features. Requirements: 3+ years of experience with React and TypeScript, experience with REST APIs, strong communication skills.`
    const seed = [
      { company: 'Google', role: 'Software Engineer', status: 'applied', job_description: jd, fit_analysis: { verdict: 'Apply', overallScore: 82, verdictReason: 'Strong skills match with React and TypeScript experience.', categories: [{ label: 'Skills Match', score: 88, verdict: 'strong', summary: 'React and TypeScript align well.' }, { label: 'Experience Level', score: 75, verdict: 'good', summary: 'Mid-level experience fits.' }, { label: 'Location', score: 90, verdict: 'strong', summary: 'Remote-friendly role.' }] } },
      { company: 'Stripe', role: 'Frontend Engineer', status: 'interviewing', job_description: jd, fit_analysis: { verdict: 'Apply', overallScore: 91, verdictReason: 'Excellent match across all categories.', categories: [{ label: 'Skills Match', score: 95, verdict: 'strong', summary: 'TypeScript and React are core stack.' }, { label: 'Experience Level', score: 85, verdict: 'strong', summary: 'Experience level is a great fit.' }, { label: 'Location', score: 95, verdict: 'strong', summary: 'SF-based, matches your location.' }] } },
      { company: 'Meta', role: 'React Developer', status: 'rejected', job_description: jd, fit_analysis: { verdict: 'Maybe', overallScore: 61, verdictReason: 'Skills match but experience level is a stretch.', categories: [{ label: 'Skills Match', score: 78, verdict: 'good', summary: 'React experience is relevant.' }, { label: 'Experience Level', score: 45, verdict: 'reach', summary: '5+ years required, you have less.' }, { label: 'Location', score: 80, verdict: 'good', summary: 'Hybrid role in your area.' }] } },
      { company: 'Vercel', role: 'Software Engineer', status: 'applied', job_description: jd, fit_analysis: { verdict: 'Apply', overallScore: 78, verdictReason: 'Good fit, especially on the frontend side.', categories: [{ label: 'Skills Match', score: 85, verdict: 'strong', summary: 'Next.js and TypeScript match well.' }, { label: 'Experience Level', score: 70, verdict: 'good', summary: 'Level aligns with your background.' }, { label: 'Location', score: 90, verdict: 'strong', summary: 'Remote-first company.' }] } },
      { company: 'Notion', role: 'Product Engineer', status: 'offer', job_description: jd, fit_analysis: { verdict: 'Apply', overallScore: 88, verdictReason: 'Strong match with product-minded engineering focus.', categories: [{ label: 'Skills Match', score: 90, verdict: 'strong', summary: 'React and TypeScript are core.' }, { label: 'Experience Level', score: 82, verdict: 'strong', summary: 'Solid experience for this level.' }, { label: 'Location', score: 95, verdict: 'strong', summary: 'SF office, matches your location.' }] } },
    ]
    const { data } = await supabase.from('applications').insert(
      seed.map(s => ({ ...s, user_id: user.id, job_url: null, notes: null, applied_through: null, cover_letter: null, cover_letter_submitted: false }))
    ).select()
    if (data) setApplications(prev => [...(data as Application[]), ...prev])
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>, id: string) {
    e.stopPropagation()
    const status = e.target.value as Status
    await supabase.from('applications').update({ status }).eq('id', id)
    setApplications(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const tracked = applications.filter(a => a.status !== 'saved')
  const savedApps = applications.filter(a => a.status === 'saved')
  const followUpApps = tracked.filter(a => needsFollowUp(a))

  // Source counts follow the current tab and search, so the numbers match what you'd see
  const statusAndSearch = (view === 'saved' ? savedApps : tracked)
    .filter(a => view === 'saved' || filter === 'all' || (filter === 'followup' ? needsFollowUp(a) : a.status === filter))
    .filter(a => !search || a.company.toLowerCase().includes(search.toLowerCase()) || a.role.toLowerCase().includes(search.toLowerCase()))
  const time = (a: Application) => new Date(a.created_at).getTime()
  const filtered = statusAndSearch
    .filter(a => source === 'all' || (source === 'none' ? !a.applied_through : a.applied_through === source))
    .sort((a, b) =>
      sort === 'oldest' ? time(a) - time(b)
      : sort === 'company' ? a.company.localeCompare(b.company, undefined, { sensitivity: 'base' })
      // Fit: highest first; applications without an analysis go last, newest first among ties
      : sort === 'fit' ? ((b.fit_analysis?.overallScore ?? -1) - (a.fit_analysis?.overallScore ?? -1)) || time(b) - time(a)
      : time(b) - time(a))

  const counts = {
    total:        tracked.length,
    interviewing: tracked.filter(a => a.status === 'interviewing').length,
    offer:        tracked.filter(a => a.status === 'offer').length,
    rejected:     tracked.filter(a => a.status === 'rejected').length,
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-gray-900">ApplyMaster</span>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/resume/upload')}
              className="text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors">
              {hasResume ? '↑ Replace Resume' : '↑ Upload Resume'}
            </button>
            <button onClick={() => navigate('/settings')}
              className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors">
              Settings
            </button>
            <button onClick={() => { setShowChangePw(true); setPwMsg(null); setNewPw('') }}
              className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors">
              Change password
            </button>
            <button onClick={() => signOut()}
              className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Resume warning */}
        {hasResume === false && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-amber-900 text-sm">Upload your master resume to get started</p>
              <p className="text-amber-700 text-xs mt-0.5">We'll tailor it for each job you apply to.</p>
            </div>
            <button onClick={() => navigate('/resume/upload')}
              className="text-sm bg-amber-400 hover:bg-amber-500 text-amber-950 font-semibold px-3 py-1.5 rounded-lg transition-colors">
              Upload now
            </button>
          </div>
        )}

        {/* Dev seed button */}
        {import.meta.env.DEV && (
          <div className="mb-4 flex justify-end">
            <button onClick={handleSeedData} className="text-xs text-gray-300 hover:text-gray-500 transition-colors">
              [dev] seed test data
            </button>
          </div>
        )}

        {/* Applications / Saved, and the main action */}
        <div className="flex items-center justify-between gap-3 mb-5">
          {applications.length > 0 ? (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {([['applications', 'Applications', tracked.length], ['saved', 'Saved', savedApps.length]] as const).map(([key, label, n]) => (
                <button key={key} onClick={() => { setView(key); setFilter('all') }}
                  className={`text-sm font-semibold px-3 sm:px-4 py-1.5 rounded-md transition-colors ${
                    view === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {label} <span className="ml-0.5 text-gray-400 font-normal">{n}</span>
                </button>
              ))}
            </div>
          ) : <span />}
          <div className="relative group shrink-0">
            <button
              onClick={() => setShowNewPanel(true)}
              disabled={!hasResume}
              className="flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              <span className="text-base leading-none">+</span> New
            </button>
            {!hasResume && (
              <div className="absolute top-full right-0 mt-2 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                Upload your resume first
              </div>
            )}
          </div>
        </div>

        {/* Activity heatmap */}
        {view === 'applications' && tracked.length > 0 && <ActivityHeatmap applications={tracked} />}

        {/* Stats */}
        {view === 'applications' && tracked.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total',        value: counts.total,        color: 'text-gray-800' },
              { label: 'Interviewing', value: counts.interviewing, color: 'text-amber-600' },
              { label: 'Offers',       value: counts.offer,        color: 'text-emerald-600' },
              { label: 'Rejected',     value: counts.rejected,     color: 'text-red-500' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar: status, follow-up, source, search */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {view === 'applications' && (
            <select value={filter === 'followup' ? 'all' : filter} onChange={e => setFilter(e.target.value as FilterTab)} aria-label="Filter by status"
              className={`shrink-0 border rounded-md pl-2 pr-6 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${
                filter === 'all' || filter === 'followup' ? 'border-gray-200 text-gray-500' : 'border-gray-900 text-gray-900 font-medium'
              }`}>
              {FILTER_TABS.map(tab => (
                <option key={tab.value} value={tab.value}>
                  {tab.value === 'all' ? `All statuses (${tracked.length})` : `${tab.label} (${tracked.filter(a => a.status === tab.value).length})`}
                </option>
              ))}
            </select>
          )}
          {view === 'applications' && followUpApps.length > 0 && (
            <button onClick={() => setFilter(filter === 'followup' ? 'all' : 'followup')}
              title={`Still "Applied" after ${FOLLOW_UP_DAYS}+ days`}
              className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                filter === 'followup' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}>
              Needs follow-up {followUpApps.length}
            </button>
          )}
          <select value={source} onChange={e => setSource(e.target.value)} aria-label="Filter by source"
            className={`shrink-0 max-w-[8rem] sm:max-w-[10rem] border rounded-md pl-2 pr-6 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${
              source === 'all' ? 'border-gray-200 text-gray-500' : 'border-gray-900 text-gray-900 font-medium'
            }`}>
            <option value="all">All sources</option>
            {APPLIED_THROUGH.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.short} ({statusAndSearch.filter(a => a.applied_through === opt.value).length})
              </option>
            ))}
            <option value="none">Not set ({statusAndSearch.filter(a => !a.applied_through).length})</option>
          </select>
          <select value={sort} onChange={e => changeSort(e.target.value as SortKey)} aria-label="Sort"
            className={`shrink-0 border rounded-md pl-2 pr-6 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${
              sort === 'newest' ? 'border-gray-200 text-gray-500' : 'border-gray-900 text-gray-900 font-medium'
            }`}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by company or role..."
            className="flex-1 min-w-[10rem] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          />
        </div>

        {/* Follow-up: bulk action */}
        {view === 'applications' && filter === 'followup' && filtered.length > 0 && (
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800">
              {filtered.length} application{filtered.length === 1 ? '' : 's'} still “Applied” after {FOLLOW_UP_DAYS}+ days. Follow up, or mark the ones you've given up on.
            </p>
            <button onClick={() => handleBulkNoResponse(filtered.map(a => a.id))}
              className="shrink-0 text-xs font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
              Mark all {filtered.length} as no response
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && view === 'saved' && filtered.length === 0 && !search && source === 'all' && (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl py-16 text-center px-6">
            <p className="text-3xl mb-3">🔖</p>
            <p className="text-gray-700 font-semibold text-sm mb-1">No saved jobs</p>
            <p className="text-gray-400 text-xs">When you add a job, choose “Save for later” to keep it here until you apply.</p>
          </div>
        )}
        {!loading && filtered.length === 0 && !(view === 'saved' && !search && source === 'all') && (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl py-16 text-center px-6">
            {view === 'applications' && filter === 'all' && source === 'all' && !search ? (
              <>
                <p className="text-3xl mb-3">📋</p>
                <p className="text-gray-700 font-semibold text-sm mb-1">No applications yet</p>
                {!hasResume ? (
                  <>
                    <p className="text-gray-400 text-xs mb-4">Upload your resume first to get started</p>
                    <button
                      onClick={() => navigate('/resume/upload')}
                      className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      Upload Resume →
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-400 text-xs mb-4">Paste a job URL or description to check your fit before applying</p>
                    <button
                      onClick={() => setShowNewPanel(true)}
                      className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      <span className="text-base leading-none">+</span> Add your first application
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="text-3xl mb-3">🔍</p>
                <p className="text-gray-600 font-semibold text-sm">No results</p>
                <p className="text-gray-400 text-xs mt-1">Try a different filter or search</p>
                <button onClick={() => { setFilter('all'); setSource('all'); setSearch('') }}
                  className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-900 underline underline-offset-2">
                  Clear filters
                </button>
              </>
            )}
          </div>
        )}

        {/* Desktop table */}
        {filtered.length > 0 && (
          <div className="hidden sm:block bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-[110px_1fr_1fr_56px_70px_60px_130px_36px] gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{view === 'saved' ? 'Saved' : 'Date'}</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Company</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Position</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Source</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Cover Letter</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Fit</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</span>
              <span />
            </div>
            {filtered.map((app, i) => (
              <div key={app.id} onClick={() => navigate(`/applications/${app.id}`)}
                className={`grid grid-cols-[110px_1fr_1fr_56px_70px_60px_130px_36px] gap-3 px-5 py-3.5 items-center cursor-pointer hover:bg-gray-50 transition-colors ${
                  i !== filtered.length - 1 ? 'border-b border-gray-100' : ''
                }`}>
                <span className="text-sm text-gray-500">
                  {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {needsFollowUp(app) && (
                    <span className="block text-[10px] font-semibold text-amber-600">{daysSince(app.created_at)}d, no reply</span>
                  )}
                </span>
                <span className="font-semibold text-gray-900 text-sm truncate">{app.company}</span>
                <span className="text-sm text-gray-600 truncate">{app.role}</span>
                <span className="flex justify-center text-sm">
                  <SourceIcon value={app.applied_through} />
                </span>
                <span className={`text-sm font-medium text-center block ${app.cover_letter_submitted ? 'text-violet-600' : app.cover_letter ? 'text-gray-400' : 'text-gray-300'}`}>
                  {app.cover_letter_submitted ? '✓' : app.cover_letter ? '~' : '—'}
                </span>
                {/* Fit score */}
                <span className={`text-xs font-semibold text-center block ${
                  !app.fit_analysis ? 'text-gray-300' :
                  app.fit_analysis.verdict === 'Apply' ? 'text-emerald-600' :
                  app.fit_analysis.verdict === 'Maybe' ? 'text-amber-500' : 'text-red-400'
                }`}>
                  {app.fit_analysis ? app.fit_analysis.overallScore : '—'}
                </span>
                {/* Inline status dropdown, or "Mark as applied" for saved postings */}
                <div onClick={e => e.stopPropagation()}>
                  {app.status === 'saved'
                    ? <button onClick={e => handleMarkApplied(e, app.id)} className="text-xs font-semibold bg-gray-900 hover:bg-gray-700 text-white px-2.5 py-1 rounded-full transition-colors">Mark as applied</button>
                    : <StatusSelect app={app} onChange={handleStatusChange} />}
                </div>
                <button onClick={(e) => handleDelete(e, app.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Mobile cards */}
        {filtered.length > 0 && (
          <div className="sm:hidden space-y-2">
            {filtered.map(app => (
              <div key={app.id} onClick={() => navigate(`/applications/${app.id}`)}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{app.company}</p>
                    <p className="text-gray-500 text-xs truncate mt-0.5">{app.role}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {app.status === 'saved'
                      ? <button onClick={e => handleMarkApplied(e, app.id)} className="text-xs font-semibold bg-gray-900 text-white px-2.5 py-1 rounded-full">Mark as applied</button>
                      : <StatusSelect app={app} onChange={handleStatusChange} />}
                    <button onClick={(e) => handleDelete(e, app.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-gray-400">
                    {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {needsFollowUp(app) && <span className="text-xs font-semibold text-amber-600">{daysSince(app.created_at)}d, no reply</span>}
                  {app.applied_through && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <SourceIcon value={app.applied_through} />
                      {appliedThroughShort(app.applied_through)}
                    </span>
                  )}
                  {app.fit_analysis && (
                    <span className={`text-xs font-semibold ${
                      app.fit_analysis.verdict === 'Apply' ? 'text-emerald-600' :
                      app.fit_analysis.verdict === 'Maybe' ? 'text-amber-500' : 'text-red-400'
                    }`}>Fit {app.fit_analysis.overallScore}</span>
                  )}
                  {app.cover_letter_submitted
                    ? <span className="text-xs text-violet-600 font-medium">✓ Cover letter</span>
                    : app.cover_letter
                    ? <span className="text-xs text-gray-400 font-medium">~ Cover letter</span>
                    : null
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Undo toast */}
      {undoItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          <span>Deleted <span className="text-gray-300">{undoItem.app.role} at {undoItem.app.company}</span></span>
          <button onClick={handleUndo} className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">Undo</button>
        </div>
      )}

      {/* Change Password modal */}
      {showChangePw && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4" onClick={() => setShowChangePw(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-5">Change password</h2>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="New password"
                required
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              {pwMsg && <p className={`text-xs ${pwMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{pwMsg.text}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowChangePw(false)}
                  className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={pwLoading || !newPw}
                  className="flex-1 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                  {pwLoading ? '...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Application slide-in panel */}
      {showNewPanel && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setShowNewPanel(false)} />
          <div className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-40 flex flex-col">
            <NewApplicationPanel onSaved={handleSaved} onClose={() => setShowNewPanel(false)} />
          </div>
        </>
      )}
    </div>
  )
}
