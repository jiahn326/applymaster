import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import NewApplicationPanel from '../components/NewApplicationPanel'

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
}

const STATUS_CONFIG: Record<Status, { label: string; dot: string }> = {
  applied:      { label: 'Applied',      dot: 'bg-blue-400' },
  interviewing: { label: 'Interviewing', dot: 'bg-amber-400' },
  rejected:     { label: 'Rejected',     dot: 'bg-red-400' },
  offer:        { label: '🎉 Offer',     dot: 'bg-emerald-400' },
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
  const [showNewPanel, setShowNewPanel] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const [{ data: resumes }, { data: apps }] = await Promise.all([
        supabase.from('resumes').select('id').limit(1),
        supabase.from('applications')
          .select('id, created_at, company, role, job_url, status, notes, applied_through')
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

  const filtered = filter === 'all' ? applications : applications.filter(a => a.status === filter)

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
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-gray-900">ApplyMaster</span>
          <button
            onClick={() => navigate('/resume/upload')}
            className="text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
          >
            {hasResume ? '↑ Replace Resume' : '↑ Upload Resume'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">

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
                <p className="text-xs text-gray-400 mt-0.5 font-medium truncate">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
            {FILTER_TABS.map(tab => (
              <button key={tab.value} onClick={() => setFilter(tab.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  filter === tab.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {tab.label}
                {tab.value !== 'all' && (
                  <span className="ml-1.5 text-gray-400 font-normal">
                    {applications.filter(a => a.status === tab.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowNewPanel(true)}
            disabled={!hasResume}
            className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <span className="text-base leading-none">+</span> New
          </button>
        </div>

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl py-16 text-center">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-gray-600 font-semibold text-sm">
              {filter === 'all' ? 'No applications yet' : `No ${filter} applications`}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {filter === 'all' ? 'Click "+ New" to add your first application' : 'Try a different filter'}
            </p>
          </div>
        )}

        {/* Application list */}
        <div className="space-y-2">
          {filtered.map(app => (
            <div key={app.id} onClick={() => navigate(`/applications/${app.id}`)}
              className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-gray-500">{app.company.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm">{app.company}</p>
                  <span className="text-gray-300 text-xs">·</span>
                  <p className="text-gray-500 text-sm truncate">{app.role}</p>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-gray-400 text-xs">
                    {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  {app.applied_through && <span className="text-gray-400 text-xs capitalize">via {app.applied_through}</span>}
                </div>
              </div>
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                app.status === 'applied'      ? 'bg-blue-50 text-blue-600' :
                app.status === 'interviewing' ? 'bg-amber-50 text-amber-600' :
                app.status === 'offer'        ? 'bg-emerald-50 text-emerald-600' :
                                                'bg-red-50 text-red-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[app.status].dot}`} />
                {STATUS_CONFIG[app.status].label}
              </span>
            </div>
          ))}
        </div>
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
