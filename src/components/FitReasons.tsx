import type { FitCategory, FitReason } from '../lib/analyzeJobFit'

// Earlier analyses stored reasons as sentences like "Kubernetes — required in JD, not in resume".
// Split those into the same item/note shape and drop the words the ✗/✓ mark already says.
function toParts(reason: FitReason): { item: string; note: string } {
  if (typeof reason !== 'string') return { item: reason.item, note: reason.note ?? '' }
  const [item, ...rest] = reason.split(/\s+[—–-]\s+/)
  const note = rest.join(' — ')
    .replace(/,?\s*not (?:in|on) (?:the )?resume/gi, '')
    .replace(/\s+in (?:the )?JD\b/gi, '')
    .replace(/^[,\s]+|[,\s]+$/g, '')
  return { item: item.trim(), note }
}

function GapNote({ note }: { note: string }) {
  if (!note) return null
  if (/^required$/i.test(note)) {
    return <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-px">required</span>
  }
  if (/^(preferred|nice to have|bonus)$/i.test(note)) {
    return <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-px">preferred</span>
  }
  return <span className="text-gray-400">{note}</span>
}

// Why a fit category scored the way it did: gaps first (they drive the apply
// decision), then strengths. Older analyses without reasons show the summary.
export default function FitReasons({ category }: { category: FitCategory }) {
  const gaps = (category.gaps ?? []).map(toParts)
  const strengths = (category.strengths ?? []).map(toParts)

  if (!gaps.length && !strengths.length) {
    return <p className="text-xs text-gray-500 leading-relaxed">{category.summary}</p>
  }

  return (
    <ul className="space-y-1">
      {gaps.map((g, i) => (
        <li key={`g${i}`} className="flex flex-wrap items-baseline gap-x-1.5 text-xs leading-relaxed">
          <span className="text-red-500 font-bold shrink-0" aria-label="Gap">✗</span>
          <span className="font-semibold text-gray-900">{g.item}</span>
          <GapNote note={g.note} />
        </li>
      ))}
      {strengths.map((s, i) => (
        <li key={`s${i}`} className="flex flex-wrap items-baseline gap-x-1.5 text-xs leading-relaxed">
          <span className="text-emerald-600 font-bold shrink-0" aria-label="Match">✓</span>
          <span className="font-semibold text-gray-700">{s.item}</span>
          {s.note && <span className="text-gray-400">{s.note}</span>}
        </li>
      ))}
    </ul>
  )
}
