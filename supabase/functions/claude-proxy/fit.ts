// Fit analysis rules shared by analyzeJobFit and analyzeAndExtract, plus the score and
// verdict calculation. The model scores each category; the overall score and verdict
// are computed here so they stay consistent. Pure TypeScript so the app's tests can run it.

export const FIT_RULES = `FOR EACH CATEGORY, list why it scored that way:
- "strengths": up to 3 specific matches; "gaps": up to 3 specific shortfalls. Use [] when there are none.
- "item" is the concrete thing in 1-4 words: a skill, requirement, or fact (e.g. "Kubernetes", "5+ yrs", "React, TypeScript", "Seattle").
- For gaps, "note" is "required" or "preferred" when the JD says so, otherwise a 1-4 word fact (e.g. "you have ~1.2 yrs"). Do not write "not in resume" — a gap already means that.
- For strengths, "note" is where it shows up in the resume in 1-3 words (e.g. "Acme", "ApplyMaster project").
- Only cite what is actually in the resume and the job description. Never invent experience.

EVERY GAP MUST COME FROM THE JOB DESCRIPTION:
- A gap must match a requirement or preference the job description actually states.
- Never list something the job description doesn't ask for — for example the candidate's current job being outside engineering, employment gaps, job tenure, or anything the JD doesn't specify.

EXPERIENCE LEVEL:
- Years of experience = paid software or engineering roles plus internships (count internships in full, and write "incl. internship" in the note when they are part of the total). Personal and side projects do not add years.
- Projects do count as evidence for specific experience the JD asks for (e.g. "experience integrating LLM APIs") and as recent or current engineering work.
- The candidate's current non-engineering job is not a gap unless the JD explicitly requires current or recent employment in the role.
- Score it with this rubric:
  - Meets the JD's years requirement, or the JD states no years, entry level, or new grad: 80-100
  - Short by up to 1 year: 60-79
  - Short by 1-3 years: 40-59
  - Short by more than 3 years, or the JD requires a senior, lead, staff, or principal level: 0-39
  - If the only shortfall is a preferred (not required) item, score at least 60.

DEALBREAKER:
- Set "dealbreaker" only when the JD states a hard requirement that the resume or location clearly shows the candidate cannot meet (e.g. an active security clearance the resume doesn't have, a required license). Quote the requirement briefly.
- When it's unknown whether the candidate meets it (citizenship, willingness to relocate), list it as a gap instead and leave "dealbreaker" null.
- Working outside engineering right now is never a dealbreaker.

"verdictReason" is one sentence naming the main strength and the main gap, without saying whether to apply.`

const CATEGORY = (label: string) =>
  `{ "label": "${label}", "score": <0-100>, "summary": "<one sentence>", "strengths": [{ "item": "", "note": "" }], "gaps": [{ "item": "", "note": "" }] }`

export const FIT_SCHEMA = `{
  "verdictReason": "<one sentence>",
  "dealbreaker": null | "<the JD requirement the candidate cannot meet>",
  "categories": [
    ${CATEGORY('Skills Match')},
    ${CATEGORY('Experience Level')},
    ${CATEGORY('Location')}
  ]
}`

export type CategoryVerdict = 'strong' | 'good' | 'reach' | 'weak'
export type FitVerdict = 'Apply' | 'Maybe' | 'Skip'

const WEIGHTS: Record<string, number> = { 'Skills Match': 0.5, 'Experience Level': 0.3, 'Location': 0.2 }

export function categoryVerdict(score: number): CategoryVerdict {
  if (score >= 80) return 'strong'
  if (score >= 60) return 'good'
  if (score >= 40) return 'reach'
  return 'weak'
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))

// Takes the model's category scores and returns the full analysis the app stores:
// category verdicts from the score bands, a weighted overall score, and the verdict
// (Apply ≥ 70, Maybe ≥ 50, otherwise Skip; a stated dealbreaker always means Skip).
// deno-lint-ignore no-explicit-any
export function computeFit(raw: any) {
  const categories = (raw?.categories ?? []).map((c: { score?: unknown }) => {
    const score = clamp(c.score)
    return { ...c, score, verdict: categoryVerdict(score) }
  })
  const weighted = categories.filter((c: { label: string }) => WEIGHTS[c.label] !== undefined)
  const totalWeight = weighted.reduce((s: number, c: { label: string }) => s + WEIGHTS[c.label], 0)
  const overallScore = totalWeight
    ? Math.round(weighted.reduce((s: number, c: { label: string; score: number }) => s + c.score * WEIGHTS[c.label], 0) / totalWeight)
    : 0
  const dealbreaker = typeof raw?.dealbreaker === 'string' && raw.dealbreaker.trim() ? raw.dealbreaker.trim() : null
  const verdict: FitVerdict = dealbreaker ? 'Skip' : overallScore >= 70 ? 'Apply' : overallScore >= 50 ? 'Maybe' : 'Skip'
  return {
    ...raw,
    categories,
    overallScore,
    verdict,
    dealbreaker,
    verdictReason: dealbreaker ? `Dealbreaker: ${dealbreaker}` : String(raw?.verdictReason ?? ''),
  }
}
