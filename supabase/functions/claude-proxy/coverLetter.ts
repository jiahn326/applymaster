// Cover letter template handling. Code fills the fixed placeholders and keeps the
// greeting and closing exactly as written; the model only writes the middle, using
// the resume as its only source of facts. Pure TypeScript so the app's tests can run it.

export interface LetterContext {
  company: string
  role: string
  today: string
  name: string
  contact: string
}

// Both the documented names and the short forms people actually type
const FIXED: [RegExp, keyof LetterContext][] = [
  [/\[(?:TODAY_DATE|DATE)\]/g, 'today'],
  [/\[(?:COMPANY_NAME|COMPANY)\]/g, 'company'],
  [/\[(?:POSITION_NAME|POSITION|ROLE)\]/g, 'role'],
  [/\[NAME\]/g, 'name'],
  [/\[CONTACT\]/g, 'contact'],
]

export function fillFixedPlaceholders(template: string, ctx: LetterContext): string {
  return FIXED.reduce((t, [re, key]) => t.replace(re, ctx[key]), template)
}

export interface TemplateParts {
  top: string     // everything up to and including the greeting line
  middle: string  // what the model rewrites
  bottom: string  // from the thank-you / sign-off paragraph to the end
}

const GREETING = /^(dear|hi|hello|to)\b.*[,:]\s*$/i
const CLOSING = /^(thank you|thanks|sincerely|best regards|kind regards|warm regards|regards|best,|respectfully)/i

// Returns null when the template has no recognizable greeting or closing,
// in which case the whole template goes to the model with prompt-only rules.
export function splitTemplate(template: string): TemplateParts | null {
  const lines = template.replace(/\r\n/g, '\n').split('\n')
  const greetingAt = lines.findIndex(l => GREETING.test(l.trim()))
  if (greetingAt < 0) return null
  const after = lines.slice(greetingAt + 1)
  // The closing must start a paragraph (first line, or after a blank line)
  const closingAt = after.findIndex((l, i) => CLOSING.test(l.trim()) && (i === 0 || after[i - 1].trim() === ''))
  if (closingAt < 0) return null
  const middle = after.slice(0, closingAt).join('\n').trim()
  if (!middle) return null
  return {
    top: lines.slice(0, greetingAt + 1).join('\n').trimEnd(),
    middle,
    bottom: after.slice(closingAt).join('\n').trim(),
  }
}

export function assembleLetter(parts: TemplateParts, writtenMiddle: string): string {
  return `${parts.top}\n\n${writtenMiddle.trim()}\n\n${parts.bottom}`
}

// Target length for the whole letter: 20% shorter than letters averaged before
// (≈1,720 chars). The model only writes the middle, so its budget is the target
// minus the fixed top and bottom, turned into a word range (~6.5 chars per word).
// The range sits a bit under the budget because the model tends to run ~8% over it.
export const LETTER_TARGET_CHARS = 1380
export function middleWordRange(parts: TemplateParts | null, target = LETTER_TARGET_CHARS): [number, number] {
  const fixed = parts ? parts.top.length + parts.bottom.length + 4 : 0
  const words = Math.max(80, Math.round((target - fixed) / 6.5))
  return [Math.round(words * 0.82), Math.round(words * 0.95)]
}

export const LETTER_RULES = `FACTS — the resume is the only source:
- Only mention experience, skills, projects, and results that appear in the resume. Never invent metrics, tools, responsibilities, or stories.
- A tool, language, or technology the job description mentions but the resume doesn't may only be described as part of the role ("the role uses Next.js"), never as something the candidate has used, knows, or has experience with.
- Never claim to have used the company's product, been a customer, or admired the company for years unless the resume says so.
- Reasons for wanting this company or role must come from the job description (the team's work, the tech stack, the problem) connected to the candidate's real experience.

TAILORING:
- Emphasize the parts of the candidate's experience that match what this job description asks for, using the JD's terms where they describe the same thing.
- Keep the candidate's voice, point of view, and paragraph structure from their draft. Rewrite, reorder, or trim sentences as needed; don't add new sections.
- Replace any remaining [BRACKETED NOTE] (e.g. [BODY], [SPECIFIC REASON]) with real content.

STYLE:
- Plain, direct, first person. No generic filler ("passionate", "fast-paced", "excited to contribute", "make an impact", "seamless", "robust").
- Plain text only, no markdown, no bullet points.`

// Tech-looking terms in the job description (Next.js, REST, AWS, PyTorch, CI/CD, Kafka...)
// that the resume never mentions. The list goes into the prompt up front so the model
// knows exactly which tools it must not present as the candidate's experience.
const GENERIC_ACRONYMS = new Set(['AI', 'ML', 'UI', 'UX', 'US', 'USA', 'UK', 'EU', 'HR', 'CEO', 'CTO', 'OK', 'PTO', 'FAQ', 'BS', 'MS', 'BA', 'WA', 'CA', 'NY', 'TX', 'SF'])

function techTerms(jobDescription: string): Set<string> {
  const terms = new Set<string>()
  for (const t of jobDescription.match(/[A-Za-z][A-Za-z0-9+#./-]*[A-Za-z0-9+#]|[A-Za-z]/g) ?? []) {
    const word = t.replace(/[./-]+$/, '')
    if (/[a-z][A-Z]/.test(word)) terms.add(word)                                        // TypeScript, PyTorch
    else if (/^[A-Z][A-Z0-9]+$/.test(word) && !GENERIC_ACRONYMS.has(word)) terms.add(word) // AWS, REST, SQL
    else if (/[A-Za-z][.+#/]|[+#]$/.test(word)) terms.add(word)                          // Next.js, C++, CI/CD
  }
  // Capitalized words in the middle of a sentence: "with Tailwind", "Kafka, PostgreSQL"
  for (const m of jobDescription.matchAll(/[a-z,;(]\s+([A-Z][a-z][A-Za-z0-9]*)/g)) terms.add(m[1])
  return terms
}

export function jdOnlyTerms(jobDescription: string, resumeText: string, alsoKnown = ''): string[] {
  const known = `${resumeText} ${alsoKnown}`.toLowerCase()
  return [...techTerms(jobDescription)].filter(t => !known.includes(t.toLowerCase()))
}

// Which of those terms a written letter names (for logging after generation)
export function unsupportedTerms(letterBody: string, jobDescription: string, resumeText: string, alsoKnown = ''): string[] {
  const body = letterBody.toLowerCase()
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return jdOnlyTerms(jobDescription, resumeText, alsoKnown)
    .filter(t => new RegExp(`(^|[^a-z0-9])${escape(t.toLowerCase())}([^a-z0-9]|$)`).test(body))
}
