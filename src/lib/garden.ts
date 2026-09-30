// Weekly goal "garden": each Monday–Sunday week is a plant that grows with the
// number of applications sent that week. All dates are the user's local dates.

export const DEFAULT_WEEKLY_GOAL = 10
export const GOAL_CHOICES = [5, 10, 15, 20] as const
export const GARDEN_WEEKS = 8

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

export interface GardenWeek {
  start: Date
  count: number
}

// The last `weeks` weeks, oldest first; the last one is the current week
export function weeklyCounts(dates: string[], now: Date, weeks = GARDEN_WEEKS): GardenWeek[] {
  const thisMonday = mondayOf(now)
  const list: GardenWeek[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisMonday)
    start.setDate(thisMonday.getDate() - 7 * i)
    list.push({ start, count: 0 })
  }
  const index = new Map(list.map((w, i) => [localDayKey(w.start), i]))
  for (const iso of dates) {
    const i = index.get(localDayKey(mondayOf(new Date(iso))))
    if (i !== undefined) list[i].count++
  }
  return list
}

// Lowest weekly count for each stage: seed 0, sprout 1, growing half the goal,
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

// The counts a stage covers, for the legend: "0", "1–4", "8", "10+"
export function stageRange(stage: number, goal: number): string {
  const t = stageThresholds(goal)
  if (stage === 0) return '0'
  if (stage === t.length - 1) return `${goal}+`
  const hi = t[stage + 1] - 1
  return hi > t[stage] ? `${t[stage]}–${hi}` : `${t[stage]}`
}

// Weeks in a row that reached the goal, counting back from the current week.
// The current week only adds to the streak once reached; until then it doesn't break it.
export function weekStreak(weeks: GardenWeek[], goal: number): number {
  let streak = 0
  const current = weeks[weeks.length - 1]
  if (current && current.count >= goal) streak++
  for (let i = weeks.length - 2; i >= 0; i--) {
    if (weeks[i].count < goal) break
    streak++
  }
  return streak
}

export function progressMessage(count: number, goal: number): string {
  if (count >= goal * 2) return 'Double bloom! Beast mode 🚀'
  if (count >= goal) return 'Bloomed this week! 🌸'
  const left = goal - count
  if (count === 0) return 'Plant your first seed this week'
  return `${left} more to bloom`
}
