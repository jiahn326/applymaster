// Daily goal "garden": each day is a plant that grows with the applications sent
// that day, and the dashboard shows this Monday–Sunday week as seven plants.
// All dates are the user's local dates.

// The goal is "N a day × D days a week"; the 7 − D other days are rest days
export interface Goal {
  daily: number
  days: number
}
export const DEFAULT_GOAL: Goal = { daily: 2, days: 5 }
export const DAILY_CHOICES = [2, 3, 5, 10, 15] as const
export const DAY_CHOICES = [5, 6, 7] as const

export function weeklyTarget(goal: Goal): number {
  return goal.daily * goal.days
}

// Seed → sprout → herb → tree → blossom (goal reached)
export const STAGES = ['🌰', '🌱', '🌿', '🌳', '🌸'] as const
export const STAGE_NAMES = ['Seed', 'Sprout', 'Growing', 'Almost there', 'Bloomed: goal reached!'] as const

// "2026-09-29" in local time (toISOString would use UTC and can shift the day)
export function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Local midnight of the Monday that starts d's week
export function mondayOf(d: Date): Date {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

// Applications per local day, keyed by localDayKey
export function countsByDay(dates: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const iso of dates) {
    const key = localDayKey(new Date(iso))
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

export interface GardenDay {
  date: Date
  count: number
  ahead: boolean // later this week, not reached yet
}

// This week, Monday to Sunday
export function weekDays(dates: string[], now: Date): GardenDay[] {
  const counts = countsByDay(dates)
  const monday = mondayOf(now)
  const todayKey = localDayKey(now)
  let pastToday = false
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const key = localDayKey(date)
    const day = { date, count: counts.get(key) ?? 0, ahead: pastToday }
    if (key === todayKey) pastToday = true
    return day
  })
}

// Applications on the same local day as `day`
export function countOnDay(dates: string[], day: Date): number {
  const key = localDayKey(day)
  return dates.filter(iso => localDayKey(new Date(iso)) === key).length
}

// Lowest daily count for each stage: seed 0, sprout 1, growing half the goal,
// almost there three quarters, bloom at the goal
export function stageThresholds(goal: number): number[] {
  return [0, 1, Math.ceil(goal * 0.5), Math.ceil(goal * 0.75), goal]
}

// 0 seed, 1 sprout, 2 growing, 3 almost there, 4 bloomed
export function stageFor(count: number, goal: number): number {
  const t = stageThresholds(goal)
  let stage = 0
  for (let i = 1; i < t.length; i++) if (count >= t[i]) stage = i
  return stage
}

// Stages a goal can actually show: with small goals some share a threshold
// (goal 2: sprout and growing both start at 1), and only the higher one is reachable
export function reachableStages(goal: number): number[] {
  const t = stageThresholds(goal)
  return t.map((_, i) => i).filter(i => i === t.length - 1 || t[i] < t[i + 1])
}

// The counts a stage covers, for the legend: "0", "1–4", "8", "10+"
export function stageRange(stage: number, goal: number): string {
  const t = stageThresholds(goal)
  if (stage === 0) return '0'
  if (stage === t.length - 1) return `${goal}+`
  const hi = t[stage + 1] - 1
  return hi > t[stage] ? `${t[stage]}–${hi}` : `${t[stage]}`
}

// Days that hit the daily goal, counting back until the streak breaks. Each
// Monday–Sunday week allows its rest days (7 − goal.days) to fall short without
// breaking it; one more short day ends the streak. Today only adds once reached
// and never breaks it, since it isn't over.
export function dayStreak(dates: string[], now: Date, goal: Goal): number {
  const counts = countsByDay(dates)
  const reached = (d: Date) => (counts.get(localDayKey(d)) ?? 0) >= goal.daily
  const restDays = 7 - goal.days
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  let streak = reached(day) ? 1 : 0
  let week = localDayKey(mondayOf(day))
  let short = 0
  for (let i = 0; i < 730; i++) {
    day.setDate(day.getDate() - 1)
    const w = localDayKey(mondayOf(day))
    if (w !== week) { week = w; short = 0 }
    if (reached(day)) streak++
    else if (++short > restDays) break
  }
  return streak
}

export function progressMessage(count: number, goal: number): string {
  if (count >= goal * 2) return 'Double bloom! Beast mode 🚀'
  if (count >= goal) return 'Bloomed today! 🌸'
  if (count === 0) return 'Plant your first seed today'
  return `${goal - count} more to bloom today`
}
