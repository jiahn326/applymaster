import { useNavigate } from 'react-router-dom'
import ATSChecker from '../components/ATSChecker'

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: '📄', title: 'Resume tailoring', desc: 'AI rewrites your bullets to match each job description' },
            { icon: '✉️', title: 'Cover letters', desc: 'Generates a personalized cover letter in one click' },
            { icon: '⚡', title: 'ATS checker', desc: 'Instantly flags formatting issues that cause auto-rejection' },
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

      {/* ATS Checker */}
      <section id="ats" className="max-w-3xl mx-auto px-6 pb-24">
        <button
          onClick={() => document.getElementById('ats')?.scrollIntoView({ behavior: 'smooth' })}
          className="w-full text-center text-sm font-semibold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl py-3 mb-6 transition-colors"
        >
          ⚡ Free: Check your ATS score in 10 seconds →
        </button>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <ATSChecker onFix={() => navigate('/dashboard')} />
        </div>
      </section>
    </div>
  )
}
