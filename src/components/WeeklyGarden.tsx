import { useEffect, useState } from 'react'
import {
  GOAL_CHOICES, STAGES, STAGE_NAMES, localDayKey, weeklyCounts, stageFor, weekStreak, progressMessage,
} from '../lib/garden'

// Per-viewer memory: how many applications this week the user has already seen
// (so new ones get a little "it grew" moment) and whether this week's bloom was celebrated
function readNumber(key: string): number | null {
  try { const v = localStorage.getItem(key); return v === null ? null : Number(v) } catch { return null }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode: no memory, no celebration repeats this visit */ }
}

function weekLabel(start: Date): string {
  return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function WeeklyGarden({ applications, goal, onGoalChange }: {
  applications: { created_at: string }[]
  goal: number
  onGoalChange: (goal: number) => void
}) {
  const weeks = weeklyCounts(applications.map(a => a.created_at), new Date())
  const current = weeks[weeks.length - 1]
  const count = current.count
  const stage = stageFor(count, goal)
  const streak = weekStreak(weeks, goal)
  const weekKey = localDayKey(current.start)

  // Mobile: the garden row starts folded so the list stays on the first screen
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [grew, setGrew] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => {
    const seenKey = `garden-seen:${weekKey}`
    const seen = readNumber(seenKey)
    write(seenKey, String(count))
    const timers: ReturnType<typeof setTimeout>[] = []
    if (seen !== null && count > seen) {
      timers.push(setTimeout(() => setGrew(true), 0), setTimeout(() => setGrew(false), 3500))
    }
    const bloomKey = `garden-bloomed:${weekKey}`
    if (count >= goal && readNumber(bloomKey) === null) {
      write(bloomKey, '1')
      timers.push(setTimeout(() => setCelebrate(true), 0))
    }
    return () => timers.forEach(clearTimeout)
  }, [count, goal, weekKey])

  const pct = Math.min(100, Math.round((count / goal) * 100))

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 relative">
      {celebrate && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 animate-pop">
          <span className="text-sm font-semibold text-emerald-700">
            🎉 Weekly goal reached!{streak > 1 && ` 🔥 ${streak} weeks in a row`}
          </span>
          <button onClick={() => setCelebrate(false)} aria-label="Dismiss" className="text-emerald-500 hover:text-emerald-800 text-sm">✕</button>
        </div>
      )}

      {/* This week's plant + progress */}
      <div className="flex items-center gap-4">
        <span
          key={grew ? 'grew' : 'still'}
          title={STAGE_NAMES[stage]}
          className={`text-4xl sm:text-5xl leading-none select-none ${grew ? 'animate-pop' : ''}`}
        >
          {STAGES[stage]}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">This week</span>
            {streak > 0 && (
              <span className="text-[11px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                🔥 {streak} week{streak > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-1 mt-0.5 relative">
            <span className={`text-2xl font-bold ${count >= goal ? 'text-emerald-600' : 'text-gray-900'}`}>{count}</span>
            <button
              onClick={() => setPicking(p => !p)}
              className="text-sm font-semibold text-gray-400 hover:text-gray-700 underline decoration-dotted underline-offset-4"
              title="Change weekly goal"
            >
              / {goal}
            </button>
            {picking && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPicking(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2">
                  <p className="text-[11px] text-gray-400 px-1 mb-1 whitespace-nowrap">Weekly goal</p>
                  <div className="flex gap-1">
                    {GOAL_CHOICES.map(g => (
                      <button
                        key={g}
                        onClick={() => { onGoalChange(g); setPicking(false) }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${g === goal ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${count >= goal ? 'bg-emerald-500' : 'bg-lime-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className={`text-xs ${grew ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}>
              {grew ? `+1 · ${progressMessage(count, goal)}` : progressMessage(count, goal)}
            </span>
            <button onClick={() => setOpen(o => !o)} className="sm:hidden text-xs text-gray-400 hover:text-gray-700 whitespace-nowrap">
              {open ? 'Garden ▴' : 'Garden ▾'}
            </button>
          </div>
        </div>
      </div>

      {/* My garden: one plant per week, current week last */}
      <div className={`${open ? '' : 'hidden sm:block'} mt-4 pt-3 border-t border-gray-100`}>
        <p className="text-[11px] text-gray-400 mb-2">My garden · last {weeks.length} weeks</p>
        <div className="flex justify-between gap-1">
          {weeks.map((w, i) => {
            const s = stageFor(w.count, goal)
            const isCurrent = i === weeks.length - 1
            return (
              <div
                key={w.start.getTime()}
                title={`Week of ${weekLabel(w.start)}: ${w.count} application${w.count === 1 ? '' : 's'}`}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-1 w-10 ${isCurrent ? 'bg-gray-50 ring-1 ring-gray-200' : ''}`}
              >
                {w.count === 0 && !isCurrent
                  ? <span className="w-6 h-6 rounded-full border border-dashed border-gray-300" aria-label="Nothing planted" />
                  : <span className="text-2xl leading-none select-none">{STAGES[s]}</span>}
                <span className="text-[9px] text-gray-400 whitespace-nowrap">{isCurrent ? 'Now' : weekLabel(w.start)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
