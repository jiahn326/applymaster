// `short` is for tight spots like the dashboard table
export const APPLIED_THROUGH = [
  { value: 'linkedin',  label: 'LinkedIn',        short: 'LinkedIn' },
  { value: 'indeed',    label: 'Indeed',          short: 'Indeed' },
  { value: 'handshake', label: 'Handshake',       short: 'Handshake' },
  { value: 'company',   label: 'Company website', short: 'Company' },
  { value: 'referral',  label: 'Referral',        short: 'Referral' },
  { value: 'other',     label: 'Other',           short: 'Other' },
] as const

export type AppliedThrough = typeof APPLIED_THROUGH[number]['value']

export function appliedThroughLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return APPLIED_THROUGH.find(o => o.value === value)?.label ?? value
}

export function appliedThroughShort(value: string | null | undefined): string | null {
  if (!value) return null
  return APPLIED_THROUGH.find(o => o.value === value)?.short ?? value
}

// Job boards that list other companies' postings — the URL alone doesn't tell us
// where the user actually applied, so don't guess for these.
const AGGREGATORS = ['glassdoor.', 'ziprecruiter.', 'wellfound.', 'angel.co', 'dice.', 'monster.', 'simplyhired.', 'builtin']

// Best guess from the posting URL, used as a default when saving. The user can change it.
export function inferAppliedThrough(url: string | null | undefined): AppliedThrough | null {
  if (!url) return null
  let host: string
  try { host = new URL(url).hostname.toLowerCase() } catch { return null }
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin'
  if (/(^|\.)indeed\.[a-z.]+$/.test(host)) return 'indeed'
  if (host === 'joinhandshake.com' || host.endsWith('.joinhandshake.com')) return 'handshake'
  if (AGGREGATORS.some(a => host.includes(a))) return null
  return 'company' // company career pages and their ATS (Greenhouse, Lever, Workday, ...)
}
