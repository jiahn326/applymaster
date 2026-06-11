import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import NewApplicationPanel from '../components/NewApplicationPanel'
import { useAuth } from '../hooks/useAuth'

type Status = 'applied' | 'interviewing' | 'rejected' | 'offer'
type FilterTab = 'all' | Status

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
}

const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  applied:      { label: 'Applied',      color: 'bg-blue-500 text-white' },
  interviewing: { label: 'Interviewing', color: 'bg-amber-400 text-white' },
  rejected:     { label: 'Rejected',     color: 'bg-red-400 text-white' },
  offer:        { label: '🎉 Offer',     color: 'bg-emerald-500 text-white' },
}

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all',          label: 'All' },
  { value: 'applied',      label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer',        label: 'Offers' },
  { value: 'rejected',     label: 'Rejected' },
]

export default function DashboardPage() {
  const [hasResume, setHasResume] = useState<boolean | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [showNewPanel, setShowNewPanel] = useState(false)
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
      setHasResume((resumes?.length ?? 0) > 0)
      setApplications((apps as Application[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  function handleSaved(app: Application) {
    setApplications(prev => [app, ...prev])
    setShowNewPanel(false)
    navigate(`/applications/${app.id}`)
  }

  const filtered = applications
    .filter(a => filter === 'all' || a.status === filter)
    .filter(a => !search || a.company.toLowerCase().includes(search.toLowerCase()) || a.role.toLowerCase().includes(search.toLowerCase()))

  const counts = {
    total:        applications.length,
    interviewing: applications.filter(a => a.status === 'interviewing').length,
    offer:        applications.filter(a => a.status === 'offer').length,
    rejected:     applications.filter(a => a.status === 'rejected').length,
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

        {/* Stats */}
        {applications.length > 0 && (
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

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <button
            onClick={() => setShowNewPanel(true)}
            disabled={!hasResume}
            className="flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm shrink-0"
          >
            <span className="text-base leading-none">+</span> New
          </button>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by company or role..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          />
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto shrink-0">
            {FILTER_TABS.map(tab => (
              <button key={tab.value} onClick={() => setFilter(tab.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                  filter === tab.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {tab.label}
                {tab.value !== 'all' && (
                  <span className="ml-1 text-gray-400 font-normal">
                    {applications.filter(a => a.status === tab.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {!loading && filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl py-16 text-center">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-gray-600 font-semibold text-sm">
              {filter === 'all' && !search ? 'No applications yet' : 'No results'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {filter === 'all' && !search ? 'Click "+ New" to add your first application' : 'Try a different filter or search'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[120px_1fr_1fr_100px_110px] gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Company</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Position</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Cover Letter</span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</span>
            </div>
            {/* Rows */}
            {filtered.map((app, i) => (
              <div key={app.id} onClick={() => navigate(`/applications/${app.id}`)}
                className={`grid grid-cols-[120px_1fr_1fr_100px_110px] gap-4 px-5 py-4 items-center cursor-pointer hover:bg-gray-50 transition-colors ${
                  i !== filtered.length - 1 ? 'border-b border-gray-100' : ''
                }`}>
                {/* Date */}
                <span className="text-sm text-gray-500">
                  {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {/* Company */}
                <span className="font-semibold text-gray-900 text-sm truncate">{app.company}</span>
                {/* Position */}
                <span className="text-sm text-gray-600 truncate">{app.role}</span>
                {/* Cover letter */}
                <span className={`text-sm font-medium text-center block ${app.cover_letter ? 'text-violet-600' : 'text-gray-300'}`}>
                  {app.cover_letter ? '✓' : '—'}
                </span>
                {/* Status */}
                <span className={`inline-flex items-center justify-center text-xs font-semibold px-3 py-1 rounded-full ${STATUS_CONFIG[app.status].color}`}>
                  {STATUS_CONFIG[app.status].label}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

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
