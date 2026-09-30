// Answers to application questions, stored on the application (applications.answers)

export type AnswerLength = 'short' | 'medium' | 'long'

export interface ApplicationAnswer {
  id: string
  question: string
  answer: string
  length: AnswerLength
  maxChars: number | null
  updated_at: string
}

export const LENGTH_LABELS: Record<AnswerLength, string> = { short: 'Short', medium: 'Medium', long: 'Long' }

export function whyQuestion(company: string): string {
  return `Why do you want to work at ${company}?`
}

export function newAnswer(question: string, length: AnswerLength, maxChars: number | null): ApplicationAnswer {
  return { id: crypto.randomUUID(), question: question.trim(), answer: '', length, maxChars, updated_at: new Date().toISOString() }
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
