import { describe, it, expect } from 'vitest'
import { localDayKey, mondayOf, weeklyCounts, stageFor, weekStreak, progressMessage } from './garden'

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

describe('weeklyCounts', () => {
  const now = at(2026, 9, 30)
  it('buckets applications into the last N weeks, current week last', () => {
    const weeks = weeklyCounts([
      iso(2026, 9, 28, 0), iso(2026, 9, 30), // this week (incl. just after local midnight Monday)
      iso(2026, 9, 27, 23),                   // last Sunday night → last week
      iso(2026, 1, 1),                        // too old
    ], now, 4)
    expect(weeks.map(w => w.count)).toEqual([0, 0, 1, 2])
    expect(localDayKey(weeks[0].start)).toBe('2026-09-07')
  })
})

describe('stageFor', () => {
  it('grows from seed to blossom as the week fills', () => {
    expect([0, 1, 4, 5, 7, 8, 9, 10, 25].map(n => stageFor(n, 10))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('weekStreak', () => {
  const w = (...counts: number[]) => counts.map((count, i) => ({ start: at(2026, 1, 1 + i * 7), count }))
  it('counts consecutive reached weeks; an unfinished current week does not break it', () => {
    expect(weekStreak(w(10, 3, 10, 12, 4), 10)).toBe(2)
    expect(weekStreak(w(10, 10, 10), 10)).toBe(3)
    expect(weekStreak(w(10, 10, 3), 5)).toBe(2)
    expect(weekStreak(w(10, 2, 0), 10)).toBe(0)
  })
})

describe('progressMessage', () => {
  it('says how many are left, or that the week bloomed', () => {
    expect(progressMessage(0, 10)).toBe('Plant your first seed this week')
    expect(progressMessage(7, 10)).toBe('3 more to bloom')
    expect(progressMessage(10, 10)).toBe('Bloomed this week! 🌸')
  })
})
