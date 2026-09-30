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
  const done = count >= goal

  // No card chrome: the dashboard puts this and the totals in one card
  return (
    <div className="flex-1 min-w-0 px-5 py-4">
      {celebrate && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 animate-pop">
          <span className="text-sm font-semibold text-emerald-700">
            🎉 Weekly goal reached!{streak > 1 && ` ${streak} weeks in a row`}
          </span>
          <button onClick={() => setCelebrate(false)} aria-label="Dismiss" className="text-emerald-500 hover:text-emerald-800 text-sm">✕</button>
        </div>
      )}

      {/* This week's plant + progress, with the garden under the message */}
      <div className="max-w-xl">
        <div className="flex items-start gap-4">
          <span
            key={grew ? 'grew' : 'still'}
            title={STAGE_NAMES[stage]}
            className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-4xl leading-none select-none ${done ? 'bg-emerald-50' : 'bg-lime-50'} ${grew ? 'animate-pop' : ''}`}
          >
            {STAGES[stage]}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-gray-500 relative">
              <span className={`text-2xl font-bold mr-1 ${done ? 'text-emerald-600' : 'text-gray-900'}`}>{count}</span>
              of{' '}
              <button
                onClick={() => setPicking(p => !p)}
                className="font-semibold text-gray-600 hover:text-gray-900 underline decoration-dotted underline-offset-4"
                title="Change weekly goal"
              >
                {goal}
              </button>
              {' '}this week
              {picking && (
                <>
                  <span className="fixed inset-0 z-10" onClick={() => setPicking(false)} />
                  <span className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2">
                    <span className="block text-[11px] text-gray-400 px-1 mb-1 whitespace-nowrap">Weekly goal</span>
                    <span className="flex gap-1">
                      {GOAL_CHOICES.map(g => (
                        <button
                          key={g}
                          onClick={() => { onGoalChange(g); setPicking(false) }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${g === goal ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                          {g}
                        </button>
                      ))}
                    </span>
                  </span>
                </>
              )}
            </p>
            {streak > 0 && (
              <span className="text-xs text-orange-500 font-semibold whitespace-nowrap" title={`Reached your goal ${streak} week${streak > 1 ? 's' : ''} in a row`}>
                🔥 {streak}<span className="sm:hidden">w</span><span className="hidden sm:inline">-week streak</span>
              </span>
            )}
            </div>
            <p className={`text-xs mt-0.5 ${grew ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
              {grew && '+1 · '}{progressMessage(count, goal)}
            </p>

            {/* My garden: one plant per week, oldest first; hover for the week */}
            <div className={`${open ? 'block' : 'hidden md:block'} mt-2 w-full max-w-[15rem]`} aria-label="Last 8 weeks">
              <div className="flex items-center justify-between">
                {weeks.map((w, i) => {
                  const isCurrent = i === weeks.length - 1
                  return (
                    <span
                      key={w.start.getTime()}
                      title={`${isCurrent ? 'This week' : `Week of ${weekLabel(w.start)}`}: ${w.count} application${w.count === 1 ? '' : 's'}`}
                      className={`w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg ${isCurrent ? 'bg-gray-50 ring-1 ring-gray-200' : ''}`}
                    >
                      {w.count === 0 && !isCurrent
                        ? <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                        : <span className="text-base sm:text-lg leading-none select-none">{STAGES[stageFor(w.count, goal)]}</span>}
                    </span>
                  )
                })}
              </div>
              <div className="flex justify-between text-[10px] text-gray-300 mt-0.5 px-0.5">
                <span>{weekLabel(weeks[0].start)}</span>
                <span>This week</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-emerald-500' : 'bg-lime-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <button onClick={() => setOpen(o => !o)} className="md:hidden mt-2 text-xs text-gray-400 hover:text-gray-700">
          {open ? 'Hide garden ▴' : 'My garden ▾'}
        </button>
      </div>
    </div>
  )
}
