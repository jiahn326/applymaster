import { useEffect, useState } from 'react'
import {
  DAILY_CHOICES, DAY_CHOICES, STAGES, STAGE_NAMES, localDayKey, weekDays, weeklyTarget, stageFor, stageThresholds,
  stageRange, reachableStages, dayStreak, progressMessage, type Goal,
} from '../lib/garden'

// Per-viewer memory: how many applications today the user has already seen
// (so new ones get a little "it grew" moment) and whether today's bloom was celebrated
function readNumber(key: string): number | null {
  try { const v = localStorage.getItem(key); return v === null ? null : Number(v) } catch { return null }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode: no memory, no celebration repeats this visit */ }
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function DailyGarden({ applications, goal, onGoalChange }: {
  applications: { created_at: string }[]
  goal: Goal
  onGoalChange: (goal: Goal) => void
}) {
  const now = new Date()
  const dates = applications.map(a => a.created_at)
  const week = weekDays(dates, now)
  const todayKey = localDayKey(now)
  const today = week.find(d => localDayKey(d.date) === todayKey)?.count ?? 0
  const weekTotal = week.reduce((sum, d) => sum + d.count, 0)
  const target = weeklyTarget(goal)
  const stage = stageFor(today, goal.daily)
  const streak = dayStreak(dates, now, goal)
  const done = today >= goal.daily
  const restDays = 7 - goal.days

  const [picking, setPicking] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [grew, setGrew] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => {
    const seenKey = `garden-seen:${todayKey}`
    const seen = readNumber(seenKey)
    write(seenKey, String(today))
    const timers: ReturnType<typeof setTimeout>[] = []
    if (seen !== null && today > seen) {
      timers.push(setTimeout(() => setGrew(true), 0), setTimeout(() => setGrew(false), 3500))
    }
    const bloomKey = `garden-bloomed:${todayKey}`
    if (today >= goal.daily && readNumber(bloomKey) === null) {
      write(bloomKey, '1')
      timers.push(setTimeout(() => setCelebrate(true), 0))
    }
    return () => timers.forEach(clearTimeout)
  }, [today, goal.daily, todayKey])

  const pct = Math.min(100, Math.round((today / goal.daily) * 100))

  // No card chrome: the dashboard puts this and the totals in one card
  return (
    <div className="flex-1 min-w-0 px-5 py-4">
      {celebrate && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 animate-pop">
          <span className="text-sm font-semibold text-emerald-700">
            🎉 Today's goal reached!{streak > 1 && ` ${streak}-day streak`}
          </span>
          <button onClick={() => setCelebrate(false)} aria-label="Dismiss" className="text-emerald-500 hover:text-emerald-800 text-sm">✕</button>
        </div>
      )}

      {/* Today's plant + progress, with this week's days under the message */}
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
              <div className="text-sm text-gray-500 relative">
                <span className={`text-2xl font-bold mr-1 ${done ? 'text-emerald-600' : 'text-gray-900'}`}>{today}</span>
                of{' '}
                <button
                  onClick={() => setPicking(p => !p)}
                  className="font-semibold text-gray-600 hover:text-gray-900 underline decoration-dotted underline-offset-4"
                  title="Change your goal"
                >
                  {goal.daily}
                </button>
                {' '}today
                <button
                  onClick={() => setExplaining(e => !e)}
                  aria-label="How the garden works"
                  className="ml-1.5 inline-flex w-4 h-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-bold text-gray-400 hover:text-gray-700 hover:border-gray-500 align-middle"
                >
                  i
                </button>

                {explaining && (
                  <>
                    <span className="fixed inset-0 z-10" onClick={() => setExplaining(false)} />
                    <span className="absolute -left-16 sm:left-0 top-full mt-2 z-20 w-72 max-w-[calc(100vw-3rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 block">
                      <span className="block text-sm font-semibold text-gray-900 mb-2">How your garden grows</span>
                      {reachableStages(goal.daily).map(i => (
                        <span key={i} className="flex items-center gap-2 text-xs text-gray-600 py-0.5">
                          <span className="text-base w-5 text-center">{STAGES[i]}</span>
                          <span className="w-10 font-semibold text-gray-800">{stageRange(i, goal.daily)}</span>
                          <span>{STAGE_NAMES[i]}</span>
                        </span>
                      ))}
                      <span className="block text-[11px] text-gray-400 mt-2 leading-relaxed">
                        Your goal: {goal.daily} a day × {goal.days} days a week. Each day starts from a seed, and
                        this week (Mon–Sun) shows one plant per day. 🔥 counts the days you reached your goal
                        {restDays > 0
                          ? `; up to ${restDays} rest day${restDays > 1 ? 's' : ''} a week don't break it.`
                          : '; a day that falls short breaks it.'}
                      </span>
                    </span>
                  </>
                )}

                {picking && (
                  <>
                    <span className="fixed inset-0 z-10" onClick={() => setPicking(false)} />
                    <span className="absolute -left-16 sm:left-0 top-full mt-2 z-20 w-72 max-w-[calc(100vw-3rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-3 block">
                      <span className="block text-[11px] text-gray-400 mb-1.5">Applications a day</span>
                      <span className="flex gap-1 flex-wrap">
                        {DAILY_CHOICES.map(n => (
                          <button
                            key={n}
                            onClick={() => onGoalChange({ ...goal, daily: n })}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${n === goal.daily ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                          >
                            {n}
                          </button>
                        ))}
                      </span>
                      <span className="block text-[11px] text-gray-400 mt-3 mb-1.5">Days a week</span>
                      <span className="flex gap-1">
                        {DAY_CHOICES.map(n => (
                          <button
                            key={n}
                            onClick={() => onGoalChange({ ...goal, days: n })}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${n === goal.days ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                          >
                            {n} days
                          </button>
                        ))}
                      </span>
                      <span className="block text-xs text-gray-500 mt-3 pt-2 border-t border-gray-100">
                        {goal.daily} × {goal.days} days = <b className="text-gray-900">{target} a week</b>
                      </span>
                    </span>
                  </>
                )}
              </div>
              {streak > 0 && (
                <span className="text-xs text-orange-500 font-semibold whitespace-nowrap" title={`Reached your daily goal on ${streak} day${streak > 1 ? 's' : ''} in a row (rest days skipped)`}>
                  🔥 {streak}<span className="sm:hidden">d</span><span className="hidden sm:inline">-day streak</span>
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${grew ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
              {grew && '+1 · '}{progressMessage(today, goal.daily)}
              {' · '}
              <span className={`whitespace-nowrap ${weekTotal >= target ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}>
                This week <b className={weekTotal >= target ? '' : 'text-gray-800'}>{weekTotal}</b> of {target}
              </span>
            </p>

            {/* This week: one plant per day, Monday to Sunday; days ahead are dashed */}
            <div className="mt-2 w-full max-w-[15rem] flex justify-between" aria-label="This week">
              {week.map((d, i) => {
                const isToday = localDayKey(d.date) === todayKey
                return (
                  <span
                    key={d.date.getTime()}
                    title={`${d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.ahead ? 'ahead' : `${d.count} application${d.count === 1 ? '' : 's'}`}`}
                    className="flex flex-col items-center gap-0.5"
                  >
                    <span className={`w-7 h-7 flex items-center justify-center rounded-lg ${isToday ? 'bg-gray-50 ring-1 ring-gray-200' : ''}`}>
                      {d.ahead
                        ? <span className="w-1.5 h-1.5 rounded-full border border-dashed border-gray-300" />
                        : d.count === 0
                          ? <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                          : <span className="text-lg leading-none select-none">{STAGES[stageFor(d.count, goal.daily)]}</span>}
                    </span>
                    <span className={`text-[10px] ${isToday ? 'text-gray-700 font-semibold' : 'text-gray-300'}`}>{DAY_LETTERS[i]}</span>
                  </span>
                )
              })}
            </div>
          </div>
        </div>

        {/* Today's progress, with each stage marked where it starts; reached stages in color */}
        <div className="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-emerald-500' : 'bg-lime-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="relative h-7 mt-1">
          {reachableStages(goal.daily).filter(i => i > 0).map(i => ({ i, t: stageThresholds(goal.daily)[i] })).map(({ i, t }) => (
            <span
              key={i}
              title={`${STAGE_NAMES[i]} (${stageRange(i, goal.daily)})`}
              className={`absolute flex flex-col items-center ${i === STAGES.length - 1 ? '-translate-x-full' : '-translate-x-1/2'} ${today >= t ? '' : 'opacity-40 grayscale'}`}
              style={{ left: `${(t / goal.daily) * 100}%` }}
            >
              <span className="text-sm leading-none select-none">{STAGES[i]}</span>
              <span className="text-[9px] text-gray-400 mt-0.5">{t}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
