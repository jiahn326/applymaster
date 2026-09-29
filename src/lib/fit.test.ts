import { describe, it, expect } from 'vitest'
import { computeFit, categoryVerdict, FIT_RULES, FIT_SCHEMA } from '../../supabase/functions/claude-proxy/fit.ts'

const cat = (label: string, score: number) => ({ label, score, summary: '', strengths: [], gaps: [] })
const fit = (skills: number, exp: number, loc: number, extra: object = {}) =>
  computeFit({ verdictReason: 'Strong React match; short on years.', categories: [cat('Skills Match', skills), cat('Experience Level', exp), cat('Location', loc)], ...extra })

describe('categoryVerdict', () => {
  it('maps scores to the rubric bands', () => {
    expect([100, 80, 79, 60, 59, 40, 39, 0].map(categoryVerdict))
      .toEqual(['strong', 'strong', 'good', 'good', 'reach', 'reach', 'weak', 'weak'])
  })
})

describe('computeFit', () => {
  it('weights skills 50%, experience 30%, location 20%', () => {
    expect(fit(80, 60, 100).overallScore).toBe(78) // 40 + 18 + 20
  })

  it('decides the verdict from the overall score', () => {
    expect(fit(70, 70, 70).verdict).toBe('Apply')
    expect(fit(69, 69, 69).verdict).toBe('Maybe')
    expect(fit(50, 50, 50).verdict).toBe('Maybe')
    expect(fit(49, 49, 49).verdict).toBe('Skip')
  })

  it('ignores whatever verdict or overall score the model returns', () => {
    const r = fit(90, 90, 90, { overallScore: 10, verdict: 'Skip' })
    expect(r.overallScore).toBe(90)
    expect(r.verdict).toBe('Apply')
  })

  it('sets category verdicts from scores so they match the rubric', () => {
    const r = computeFit({ categories: [{ ...cat('Experience Level', 65), verdict: 'weak' }] })
    expect(r.categories[0].verdict).toBe('good')
  })

  it('a dealbreaker means Skip regardless of score, with the reason shown', () => {
    const r = fit(95, 90, 90, { dealbreaker: 'Active TS/SCI clearance required' })
    expect(r.verdict).toBe('Skip')
    expect(r.verdictReason).toBe('Dealbreaker: Active TS/SCI clearance required')
  })

  it('treats an empty dealbreaker as none', () => {
    expect(fit(90, 90, 90, { dealbreaker: '  ' }).verdict).toBe('Apply')
    expect(fit(90, 90, 90, { dealbreaker: null }).dealbreaker).toBeNull()
  })

  it('clamps out-of-range or missing scores', () => {
    const r = computeFit({ categories: [{ label: 'Skills Match', score: 140 }, { label: 'Experience Level' }, { label: 'Location', score: -5 }] })
    expect(r.categories.map((c: { score: number }) => c.score)).toEqual([100, 0, 0])
  })

  it('re-weights when a category is missing', () => {
    const r = computeFit({ categories: [cat('Skills Match', 80), cat('Experience Level', 60)] })
    expect(r.overallScore).toBe(73) // (40 + 18) / 0.8 = 72.5 → 73
  })
})

describe('prompt rules', () => {
  it('ground gaps in the JD and keep the current job out of the score', () => {
    expect(FIT_RULES).toContain('A gap must match a requirement or preference the job description actually states')
    expect(FIT_RULES).toContain("current non-engineering job is not a gap")
    expect(FIT_RULES).toContain('plus internships')
    expect(FIT_RULES).toContain('never a dealbreaker')
  })

  it('no longer asks the model for the overall score or verdict', () => {
    expect(FIT_SCHEMA).not.toContain('overallScore')
    expect(FIT_SCHEMA).not.toContain('"verdict"')
    expect(FIT_SCHEMA).toContain('"dealbreaker"')
  })
})
