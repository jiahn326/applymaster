// Server-side checks on tailoring output. The prompt asks for these rules, but the
// model doesn't always follow them, so any diff that breaks one is dropped before
// it reaches the app. Pure TypeScript (no imports) so the app's tests can run it too.

export interface RawDiff {
  section: string
  index: number
  original: string
  tailored: string
}

export type RejectReason =
  | 'empty'
  | 'unchanged'
  | 'longer'
  | 'numbers-changed'
  | 'term-removed'
  | 'tense-changed'
  | 'banned-word'

export const BANNED_WORDS = [
  'seamless', 'robust', 'leveraged', 'spearheaded', 'ensured', 'passionate', 'detail-oriented',
  'results-driven', 'collaborated closely', 'worked closely', 'across the stack', 'fast-paced', 'took ownership',
]

const squash = (t: string) => t.replace(/\s+/g, ' ').trim()
const wordCount = (t: string) => squash(t).split(' ').length

// "Swap words, don't expand sentences": no extra words, and at most 20% more characters
// (a JD term can be a bit longer, e.g. "multiple" → "cross-functional")
const MAX_GROWTH = 1.2
const numbers = (t: string) => (t.match(/\d+(?:[.,]\d+)?%?/g) ?? []).sort().join('|')
const firstWord = (t: string) => squash(t).split(' ')[0]?.toLowerCase() ?? ''

// Names that carry facts: tools, products, companies, acronyms (MySQL, Firebase,
// Claude, API, PDF/DOCX, TypeScript, Node.js). A word counts if it has a capital
// letter after its first character, or starts with a capital anywhere but the first
// word of the bullet, or contains a digit or one of / . + #.
function factTerms(text: string): string[] {
  return squash(text).split(' ').slice(1)
    .map(w => w.replace(/^[("'“‘]+|[)"'”’,;:!?]+$|\.$/g, ''))
    .filter(w => w.length > 1 && (/[A-Z]/.test(w.slice(1)) || /^[A-Z]/.test(w) || /[0-9/.+#]/.test(w)))
}

export function rejectReason(diff: RawDiff): RejectReason | null {
  const original = squash(diff.original ?? '')
  const tailored = squash(diff.tailored ?? '')
  if (!original || !tailored) return 'empty'
  if (original === tailored) return 'unchanged'
  if (wordCount(tailored) > wordCount(original) || tailored.length > original.length * MAX_GROWTH) return 'longer'
  if (numbers(original) !== numbers(tailored)) return 'numbers-changed'
  if (factTerms(original).some(term => !tailored.includes(term))) return 'term-removed'
  if (firstWord(original).endsWith('ing') !== firstWord(tailored).endsWith('ing')) return 'tense-changed'
  const lower = tailored.toLowerCase()
  if (BANNED_WORDS.some(w => lower.includes(w) && !original.toLowerCase().includes(w))) return 'banned-word'
  return null
}

export function validateDiffs<T extends RawDiff>(diffs: T[]): { kept: T[]; rejected: { diff: T; reason: RejectReason }[] } {
  const kept: T[] = []
  const rejected: { diff: T; reason: RejectReason }[] = []
  for (const diff of diffs ?? []) {
    const reason = rejectReason(diff)
    if (reason) rejected.push({ diff, reason })
    else kept.push(diff)
  }
  return { kept, rejected }
}
