import { useNavigate } from 'react-router-dom'
import { FileText, Mail, ShieldCheck, LayoutDashboard } from 'lucide-react'
import ATSChecker from '../components/ATSChecker'

const cardShadow = {
  boxShadow: '0 1px 3px hsl(240 20% 20% / 0.06), 0 4px 12px hsl(240 20% 20% / 0.08)',
}

const FEATURES = [
  { icon: FileText,       title: 'Resume tailoring',    desc: 'AI rewrites your bullets to match each job description' },
  { icon: Mail,           title: 'Cover letters',        desc: 'Generates a personalized cover letter in one click' },
  { icon: ShieldCheck,    title: 'ATS checker',          desc: 'Instantly flags formatting issues that cause auto-rejection' },
  { icon: LayoutDashboard, title: 'Application tracking', desc: "Track every job you've applied to in one place" },
]

export default function LandingPage() {
  const navigate = useNavigate()

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
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-5">
          "100 applications. 0 callbacks."<br />
          <span className="text-gray-500 font-normal text-3xl sm:text-4xl">Your experience isn't the problem.<br />Your resume is.</span>
        </h1>
        <p className="text-lg text-gray-500 mb-8 max-w-xl mx-auto">
          Paste a job description. Your bullets rewrite themselves.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => document.getElementById('ats')?.scrollIntoView({ behavior: 'smooth' })}
            className="text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            style={{ backgroundColor: '#5b5bd6' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4f4fbf')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#5b5bd6')}
          >
            Try it free →
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-white border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Sign in
          </button>
        </div>
      </section>

      {/* Features row */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white rounded-xl p-5" style={cardShadow}>
              <Icon size={20} strokeWidth={1.5} className="text-gray-400 mb-3" />
              <p className="font-semibold text-gray-900 text-sm mb-1">{title}</p>
              <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ATS Checker */}
      <section id="ats" className="max-w-3xl mx-auto px-6 pb-24">
        <button
          onClick={() => document.getElementById('ats')?.scrollIntoView({ behavior: 'smooth' })}
          className="w-full text-center text-sm font-semibold py-3 mb-6 rounded-xl transition-colors"
          style={{ color: '#5b5bd6', backgroundColor: 'hsl(240 60% 96%)', border: '1px solid hsl(240 40% 88%)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(240 60% 93%)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'hsl(240 60% 96%)')}
        >
          ⚡ Free: Check your ATS score in 10 seconds →
        </button>
        <div className="bg-white rounded-xl p-6 sm:p-8" style={cardShadow}>
          <ATSChecker onFix={() => navigate('/dashboard')} />
        </div>
      </section>
    </div>
  )
}
