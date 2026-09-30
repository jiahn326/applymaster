import { describe, it, expect } from 'vitest'
import { localDayKey, mondayOf, weekDays, countOnDay, weeklyTarget, stageFor, stageRange, stageThresholds, reachableStages, dayStreak, progressMessage } from './garden'

// Local-time dates, so the tests hold in any time zone
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)
const iso = (y: number, m: number, d: number, h = 12) => at(y, m, d, h).toISOString()

describe('mondayOf', () => {
  it('starts weeks on Monday, with Sunday closing the week', () => {
    expect(localDayKey(mondayOf(at(2026, 9, 29)))).toBe('2026-09-28') // Tuesday
    expect(localDayKey(mondayOf(at(2026, 9, 28)))).toBe('2026-09-28') // Monday
    expect(localDayKey(mondayOf(at(2026, 10, 4, 23)))).toBe('2026-09-28') // Sunday night
  })
})

describe('weekDays', () => {
  it('lists Monday to Sunday with counts, marking days after today', () => {
    const days = weekDays([iso(2026, 9, 28, 0), iso(2026, 9, 28, 20), iso(2026, 10, 1), iso(2026, 9, 27, 23)], at(2026, 10, 1))
    expect(days.map(d => localDayKey(d.date))).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(days.map(d => d.count)).toEqual([2, 0, 0, 1, 0, 0, 0])
    expect(days.map(d => d.ahead)).toEqual([false, false, false, false, true, true, true])
  })
})

describe('countOnDay / weeklyTarget', () => {
  it('counts applications on a local day', () => {
    const dates = [iso(2026, 9, 29, 0), iso(2026, 9, 29, 23), iso(2026, 9, 28, 23), iso(2026, 9, 30, 0)]
    expect(countOnDay(dates, at(2026, 9, 29))).toBe(2)
  })
  it('multiplies a day by the days a week', () => {
    expect(weeklyTarget({ daily: 10, days: 5 })).toBe(50)
  })
})

describe('stageFor', () => {
  it('grows from seed to blossom as the week fills', () => {
    expect([0, 1, 4, 5, 7, 8, 9, 10, 25].map(n => stageFor(n, 10))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('stageThresholds / stageRange', () => {
  it('scales the stages with the goal', () => {
    expect(stageThresholds(10)).toEqual([0, 1, 5, 8, 10])
    expect([0, 1, 2, 3, 4].map(i => stageRange(i, 10))).toEqual(['0', '1–4', '5–7', '8–9', '10+'])
    expect([0, 1, 2, 3, 4].map(i => stageRange(i, 5))).toEqual(['0', '1–2', '3', '4', '5+'])
  })
  it('skips stages a small goal cannot show', () => {
    expect(reachableStages(10)).toEqual([0, 1, 2, 3, 4])
    expect(reachableStages(3)).toEqual([0, 1, 2, 4])
    expect(reachableStages(2)).toEqual([0, 2, 4])
    expect(reachableStages(2).map(i => stageRange(i, 2))).toEqual(['0', '1', '2+'])
    for (const goal of [1, 2, 3, 5, 10]) for (let n = 0; n <= goal; n++) expect(reachableStages(goal)).toContain(stageFor(n, goal))
  })
  it('agrees with stageFor at every boundary', () => {
    for (const goal of [5, 10, 15, 20])
      stageThresholds(goal).forEach((t, i) => expect(stageFor(t, goal)).toBe(i))
  })
})

describe('dayStreak', () => {
  // `n` applications on each given day of Sep/Oct 2026
  const on = (days: [number, number, number][]) => days.flatMap(([m, d, n]) => Array.from({ length: n }, () => iso(2026, m, d)))
  const goal5 = { daily: 2, days: 5 }
  const goal7 = { daily: 2, days: 7 }
  // Thu Oct 1; the week is Mon Sep 28 – Sun Oct 4, last week Sep 21 – 27
  const now = at(2026, 10, 1)

  it('counts goal days back from yesterday; today adds once reached', () => {
    const dates = on([[9, 28, 2], [9, 29, 3], [9, 30, 2]])
    expect(dayStreak(dates, now, goal7)).toBe(3)
    expect(dayStreak([...dates, ...on([[10, 1, 2]])], now, goal7)).toBe(4)
    expect(dayStreak([...dates, ...on([[10, 1, 1]])], now, goal7)).toBe(3) // today not reached yet: no break
  })

  it('lets each week skip its rest days without breaking', () => {
    // last week: Mon–Fri hit, weekend off; this week Mon–Wed hit
    const dates = on([[9, 21, 2], [9, 22, 2], [9, 23, 2], [9, 24, 2], [9, 25, 2], [9, 28, 2], [9, 29, 2], [9, 30, 2]])
    expect(dayStreak(dates, now, goal5)).toBe(8)
    expect(dayStreak(dates, now, goal7)).toBe(3) // no rest days: the weekend breaks it
  })

  it('breaks on one short day more than the week allows', () => {
    // this week: Mon and Tue short (2 rest days used), Wed short → break
    expect(dayStreak(on([[9, 25, 2], [9, 28, 1], [9, 29, 0], [9, 30, 1]]), now, goal5)).toBe(0)
  })

  it('is 0 with no history', () => {
    expect(dayStreak([], now, goal5)).toBe(0)
  })
})

describe('progressMessage', () => {
  it('says how many are left, or that the week bloomed', () => {
    expect(progressMessage(0, 10)).toBe('Plant your first seed today')
    expect(progressMessage(7, 10)).toBe('3 more to bloom today')
    expect(progressMessage(10, 10)).toBe('Bloomed today! 🌸')
  })
})
