import { useState, useCallback } from 'react'

type Severity = 'high' | 'medium' | 'low'

interface Warning {
  severity: Severity
  title: string
  detail: string
  fix: string
}

interface ATSResult {
  score: number
  warnings: Warning[]
  passed: string[]
}

const NON_STANDARD_PATTERNS = [
  /my journey/i, /about me/i, /what i['']ve done/i, /who i am/i,
  /my story/i, /career highlights/i, /things i do/i, /my work/i,
]

const SPECIAL_CHARS = /[★■◆▶→←●◇▪▫✓✗✘☑☒🔹🔸💼🎯⭐]/g

const DATE_FORMATS = [
  { pattern: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/g, name: 'Month YYYY' },
  { pattern: /\b\d{1,2}\/\d{4}/g, name: 'MM/YYYY' },
  { pattern: /\b\d{4}[-–]\d{4}/g, name: 'YYYY-YYYY' },
  { pattern: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/g, name: 'Full Month YYYY' },
]

function analyzeResume(text: string): ATSResult {
  const warnings: Warning[] = []
  const passed: string[] = []

  const specialMatches = text.match(SPECIAL_CHARS) || []
  if (specialMatches.length > 2) {
    warnings.push({
      severity: 'high',
      title: 'Special characters detected',
      detail: `Found ${specialMatches.length} special characters (${[...new Set(specialMatches)].slice(0, 5).join(' ')}). ATS parsers often garble or drop these.`,
      fix: 'Replace with plain hyphens (-) or remove entirely.',
    })
  } else {
    passed.push('No problematic special characters')
  }

  const hasEmail = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text)
  if (!hasEmail) {
    warnings.push({
      severity: 'high',
      title: 'No email address found',
      detail: 'ATS systems extract contact info automatically. Missing email means recruiters may not be able to reach you.',
      fix: 'Add your email address to the header.',
    })
  } else {
    passed.push('Email address present')
  }

  const hasPhone = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)
  if (!hasPhone) {
    warnings.push({
      severity: 'medium',
      title: 'No phone number found',
      detail: 'Many ATS systems and recruiters expect a phone number in the contact section.',
      fix: 'Add your phone number to the header.',
    })
  } else {
    passed.push('Phone number present')
  }

  const nonStandard = NON_STANDARD_PATTERNS.filter(p => p.test(text))
  if (nonStandard.length > 0) {
    warnings.push({
      severity: 'high',
      title: 'Non-standard section headings',
      detail: 'Creative section names like "My Journey" or "About Me" confuse ATS parsers that look for standard labels.',
      fix: 'Use standard headings: Experience, Education, Skills, Projects, Summary.',
    })
  } else {
    passed.push('Section headings look standard')
  }

  const detectedFormats = DATE_FORMATS.filter(({ pattern }) => {
    pattern.lastIndex = 0
    return pattern.test(text)
  })
  if (detectedFormats.length >= 2) {
    warnings.push({
      severity: 'medium',
      title: 'Inconsistent date formats',
      detail: `Found ${detectedFormats.length} different date styles (${detectedFormats.map(f => f.name).join(', ')}). Inconsistency can confuse ATS date parsers.`,
      fix: 'Pick one format and use it everywhere — "Jan 2022 – Mar 2024" is the safest.',
    })
  } else {
    passed.push('Date format looks consistent')
  }

  const slashStacks = text.match(/(\w+\/){3,}/g) || []
  if (slashStacks.length > 0) {
    warnings.push({
      severity: 'medium',
      title: 'Slash-stacked skills detected',
      detail: `e.g. "Python/Java/TypeScript/React" — ATS may parse this as one token instead of four separate skills.`,
      fix: 'Use commas or list skills separately: Python, Java, TypeScript, React.',
    })
  } else {
    passed.push('Skills listed cleanly (no slash-stacking)')
  }

  const wordCount = text.trim().split(/\s+/).length
  if (wordCount > 1000) {
    warnings.push({
      severity: 'low',
      title: 'Resume may exceed one page',
      detail: `Estimated ~${Math.round(wordCount / 500)} pages based on word count (${wordCount} words). Most ATS and recruiters prefer 1 page for under 10 years of experience.`,
      fix: 'Cut older roles to 1–2 bullets or remove positions older than 10 years.',
    })
  } else {
    passed.push('Length looks appropriate')
  }

  const allCapsLines = text.split('\n').filter(line => {
    const trimmed = line.trim()
    return trimmed.length > 3 && trimmed.length < 30 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)
  })
  if (allCapsLines.length > 3) {
    warnings.push({
      severity: 'low',
      title: 'All-caps section headings',
      detail: 'Some ATS systems have trouble recognizing all-caps headings as section labels.',
      fix: 'Use Title Case for section headings: "Work Experience" not "WORK EXPERIENCE".',
    })
  } else {
    passed.push('Section heading casing looks fine')
  }

  const hasLinkedIn = /linkedin\.com\/in\//i.test(text)
  if (!hasLinkedIn) {
    warnings.push({
      severity: 'low',
      title: 'No LinkedIn URL',
      detail: 'Many recruiters and ATS systems expect a LinkedIn profile link.',
      fix: 'Add your LinkedIn URL to the contact header.',
    })
  } else {
    passed.push('LinkedIn URL present')
  }

  const deductions = { high: 20, medium: 10, low: 5 }
  const score = Math.max(0, warnings.reduce((acc, w) => acc - deductions[w.severity], 100))

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
  warnings.sort((a, b) => order[a.severity] - order[b.severity])

  return { score, warnings, passed }
}

const severityConfig: Record<Severity, { label: string; color: string; bg: string; border: string; dot: string }> = {
  high:   { label: 'High risk',   color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200',   dot: 'bg-red-500' },
  medium: { label: 'Medium risk', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400' },
  low:    { label: 'Low risk',    color: 'text-blue-700',  bg: 'bg-blue-50',  border: 'border-blue-200',  dot: 'bg-blue-400' },
}

function ScoreRing({ score }: { score: number }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 80 ? '#16a34a' : score >= 55 ? '#d97706' : '#dc2626'
  const label = score >= 80 ? 'ATS Ready' : score >= 55 ? 'Needs Work' : 'High Risk'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="136" height="136" viewBox="0 0 136 136">
        <circle cx="68" cy="68" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="68" cy="68" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 68 68)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="68" y="62" textAnchor="middle" fontSize="28" fontWeight="700" fill={color}>{score}</text>
        <text x="68" y="80" textAnchor="middle" fontSize="11" fill="#6b7280">/100</text>
      </svg>
      <span className="text-sm font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}

function WarningCard({ w }: { w: Warning }) {
  const [open, setOpen] = useState(false)
  const cfg = severityConfig[w.severity]
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className="flex-1 text-sm font-medium text-gray-800">{w.title}</span>
        <span className={`text-xs font-medium ${cfg.color} flex-shrink-0`}>{cfg.label}</span>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-600">{w.detail}</p>
          <div className="flex gap-2 items-start">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0 mt-0.5">Fix</span>
            <p className="text-sm text-gray-700">{w.fix}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ATSChecker({ onFix }: { onFix?: () => void } = {}) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ATSResult | null>(null)

  const handleCheck = useCallback(() => {
    if (text.trim().length < 50) return
    setResult(analyzeResume(text))
  }, [text])

  const handleClear = () => {
    setText('')
    setResult(null)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest">ATS Format Checker</p>
        <h2 className="text-xl font-bold text-gray-900">Is your resume ATS-proof?</h2>
        <p className="text-sm text-gray-500">
          Paste your resume below. We'll flag formatting issues that cause automatic rejection — no AI needed, instant results.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <label className="block px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Your Resume
        </label>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setResult(null) }}
          placeholder="Paste your resume as plain text..."
          rows={12}
          className="w-full px-4 pb-4 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none"
        />
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-400">{text.trim().split(/\s+/).filter(Boolean).length} words</span>
          <div className="flex gap-2">
            {text && (
              <button
                onClick={handleClear}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleCheck}
              disabled={text.trim().length < 50}
              className="text-sm font-medium bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Check resume
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col sm:flex-row items-center gap-6">
            <ScoreRing score={result.score} />
            <div className="flex-1 space-y-3 text-center sm:text-left">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {result.warnings.length === 0
                    ? 'No issues found — your resume looks ATS-ready.'
                    : `${result.warnings.length} issue${result.warnings.length > 1 ? 's' : ''} found`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {result.warnings.filter(w => w.severity === 'high').length > 0
                    ? `${result.warnings.filter(w => w.severity === 'high').length} high-risk issue${result.warnings.filter(w => w.severity === 'high').length > 1 ? 's' : ''} need attention first.`
                    : 'Fix medium and low issues to maximize your score.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                {(['high', 'medium', 'low'] as Severity[]).map(s => {
                  const count = result.warnings.filter(w => w.severity === s).length
                  if (count === 0) return null
                  const cfg = severityConfig[s]
                  return (
                    <span key={s} className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                      {count} {s} risk
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Issues to fix</p>
              {result.warnings.map((w, i) => <WarningCard key={i} w={w} />)}
            </div>
          )}

          {result.passed.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Passed checks</p>
              <ul className="space-y-1.5">
                {result.passed.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {onFix && (
            <button
              onClick={onFix}
              className="w-full bg-gray-900 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Fix it — tailor your resume →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
