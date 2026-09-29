// Application statuses, shared by the dashboard and the application page.
// "saved" is a posting not applied to yet; it lives in its own tab and is left out
// of stats, the activity heatmap, and follow-up flags.
export type AppStatus = 'saved' | 'applied' | 'interviewing' | 'no_response' | 'rejected' | 'offer'

export const STATUS_CONFIG: Record<AppStatus, { label: string; solid: string; soft: string }> = {
  saved:        { label: 'Saved',        solid: 'bg-gray-400 text-white',    soft: 'bg-gray-50 text-gray-600 ring-1 ring-gray-200' },
  applied:      { label: 'Applied',      solid: 'bg-blue-500 text-white',    soft: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' },
  interviewing: { label: 'Interviewing', solid: 'bg-amber-400 text-white',   soft: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' },
  no_response:  { label: 'No response',  solid: 'bg-gray-500 text-white',    soft: 'bg-gray-100 text-gray-600 ring-1 ring-gray-300' },
  rejected:     { label: 'Rejected',     solid: 'bg-red-400 text-white',     soft: 'bg-red-50 text-red-500 ring-1 ring-red-200' },
  offer:        { label: '🎉 Offer',     solid: 'bg-emerald-500 text-white', soft: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' },
}

// Statuses an application can move through once applied (the status dropdown)
export const TRACKED_STATUSES: AppStatus[] = ['applied', 'interviewing', 'no_response', 'rejected', 'offer']

// Applications still "applied" this long are flagged for follow-up; the user decides
// whether to mark them "no response" — nothing changes automatically
export const FOLLOW_UP_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS)
}

export function needsFollowUp(app: { status: string; created_at: string }, now = Date.now()): boolean {
  return app.status === 'applied' && daysSince(app.created_at, now) >= FOLLOW_UP_DAYS
}
