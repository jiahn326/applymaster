// Answers to application questions, stored on the application (applications.answers)

export type AnswerLength = 'short' | 'medium' | 'long'

export interface ApplicationAnswer {
  id: string
  question: string
  answer: string
  length: AnswerLength
  maxChars: number | null
  // The candidate's own details for story questions ("a time something went wrong");
  // the answer uses only these and the resume. Older answers don't have it.
  notes?: string
  updated_at: string
}

export const LENGTH_LABELS: Record<AnswerLength, string> = { short: 'Short', medium: 'Medium', long: 'Long' }

export function whyQuestion(company: string): string {
  return `Why do you want to work at ${company}?`
}

export function newAnswer(question: string, length: AnswerLength, maxChars: number | null, notes = ''): ApplicationAnswer {
  return { id: crypto.randomUUID(), question: question.trim(), answer: '', length, maxChars, notes: notes.trim(), updated_at: new Date().toISOString() }
}

// When a question asks for a story the resume and notes don't cover, the answer
// leaves "[Add a real example: ...]" instead of inventing one
export const PLACEHOLDER = /\[Add a real example:[^\]]*\]/g

export function placeholderCount(text: string): number {
  return text.match(PLACEHOLDER)?.length ?? 0
}

// Splits an answer into plain text and placeholder parts for highlighting
export function splitPlaceholders(text: string): { text: string; placeholder: boolean }[] {
  const parts: { text: string; placeholder: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index), placeholder: false })
    parts.push({ text: m[0], placeholder: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), placeholder: false })
  return parts
}

// Returns a new list with `patch` applied to the answer with `id`
export function updateAnswer(list: ApplicationAnswer[], id: string, patch: Partial<Omit<ApplicationAnswer, 'id'>>): ApplicationAnswer[] {
  return list.map(a => a.id === id ? { ...a, ...patch, updated_at: new Date().toISOString() } : a)
}

// A limit the user typed ("500", " 500 ") → 500; empty or not a positive number → no limit
export function parseMaxChars(input: string): number | null {
  const n = Number(input.trim())
  return input.trim() && Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

export function isOverLimit(answer: ApplicationAnswer): boolean {
  return answer.maxChars !== null && answer.answer.length > answer.maxChars
}
