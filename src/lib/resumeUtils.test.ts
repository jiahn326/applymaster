import { describe, it, expect } from 'vitest'
import { resolveTailoring, normalizeBullet, labeledLine, resumeFileName } from './resumeUtils'
import type { ResumeStructure } from './parseResumeStructure'
import type { BulletDiff, TailoredResume } from './tailorResume'

function resume(overrides: Partial<ResumeStructure> = {}): ResumeStructure {
  return {
    header: { name: 'Jane Doe', contact: 'jane@example.com' },
    education: [],
    skills: { groups: [] },
    experience: [
      { company: 'Acme', location: 'Remote', title: 'Engineer', dates: '2022 – Present', bullets: [
        'Built automated deployments for 12 services',
        'Worked with multiple teams to ship a billing dashboard',
        'Cut API latency by 40%',
      ] },
    ],
    projects: [
      { name: 'ApplyMaster', tech: 'React', bullets: ['Migrating resume parsing to structured skill groups'] },
    ],
    ...overrides,
  }
}

const diff = (d: Partial<BulletDiff>): BulletDiff => ({ section: 'Acme', index: 0, original: '', tailored: '', accepted: true, ...d })
const tailored = (...diffs: BulletDiff[]): TailoredResume => ({ diffs })

describe('resolveTailoring', () => {
  it('applies a diff whose original matches the bullet at its index', () => {
    const r = resolveTailoring(resume(), tailored(
      diff({ index: 0, original: 'Built automated deployments for 12 services', tailored: 'Built CI/CD pipelines for 12 services' }),
    ))
    expect(r.structure.experience[0].bullets[0]).toBe('Built CI/CD pipelines for 12 services')
    expect(r.applied).toHaveLength(1)
    expect(r.notApplied).toHaveLength(0)
  })

  it('ignores bullet markers, quote/dash styles, spacing, case and a trailing period', () => {
    const r = resolveTailoring(resume(), tailored(
      diff({ index: 1, original: '•  worked with  MULTIPLE teams to ship a billing dashboard.', tailored: 'Worked with cross-functional teams to ship a billing dashboard' }),
    ))
    expect(r.applied).toHaveLength(1)
    expect(r.structure.experience[0].bullets[1]).toContain('cross-functional')
  })

  it('does not overwrite a different bullet when the index points elsewhere (resume changed)', () => {
    const r = resolveTailoring(resume(), tailored(
      diff({ index: 0, original: 'Led a team of 5 engineers', tailored: 'Led a cross-functional team of 5 engineers' }),
    ))
    expect(r.notApplied).toHaveLength(1)
    expect(r.structure.experience[0].bullets[0]).toBe('Built automated deployments for 12 services')
  })

  it('never matches a bullet whose facts changed (no fuzzy matching)', () => {
    const r = resolveTailoring(resume(), tailored(
      diff({ index: 2, original: 'Cut API latency by 30%', tailored: 'Reduced API latency by 30%' }),
    ))
    expect(r.notApplied).toHaveLength(1)
    expect(r.structure.experience[0].bullets[2]).toBe('Cut API latency by 40%')
  })

  it('follows a bullet that moved within its section when the text appears exactly once', () => {
    const r = resolveTailoring(resume(), tailored(
      diff({ index: 0, original: 'Cut API latency by 40%', tailored: 'Cut p99 API latency by 40%' }),
    ))
    expect(r.applied).toHaveLength(1)
    expect(r.structure.experience[0].bullets[2]).toBe('Cut p99 API latency by 40%')
    expect(r.structure.experience[0].bullets[0]).toBe('Built automated deployments for 12 services')
  })

  it('does not guess when the moved text appears more than once', () => {
    const s = resume()
    s.experience[0].bullets = ['Shipped features', 'Wrote tests', 'Shipped features']
    const r = resolveTailoring(s, tailored(diff({ index: 1, original: 'Shipped features', tailored: 'Shipped React features' })))
    expect(r.notApplied).toHaveLength(1)
    expect(r.structure.experience[0].bullets).toEqual(['Shipped features', 'Wrote tests', 'Shipped features'])
  })

  it('reports a diff for a section that no longer exists as not applied', () => {
    const r = resolveTailoring(resume(), tailored(diff({ section: 'Old Company', original: 'Anything', tailored: 'Something' })))
    expect(r.notApplied).toHaveLength(1)
  })

  it('reports a diff with no original text as not applied', () => {
    const r = resolveTailoring(resume(), tailored(diff({ index: 0, original: '', tailored: 'Replaced' })))
    expect(r.notApplied).toHaveLength(1)
    expect(r.structure.experience[0].bullets[0]).toBe('Built automated deployments for 12 services')
  })

  it('skips diffs the user turned off and counts them separately', () => {
    const r = resolveTailoring(resume(), tailored(
      diff({ index: 0, original: 'Built automated deployments for 12 services', tailored: 'Built CI/CD pipelines', accepted: false }),
    ))
    expect(r.undone).toHaveLength(1)
    expect(r.notApplied).toHaveLength(0)
    expect(r.structure.experience[0].bullets[0]).toBe('Built automated deployments for 12 services')
  })

  it('only changes the role whose bullet matches when a company has several roles', () => {
    const s = resume({
      experience: [
        { company: 'Acme', location: 'Remote', title: 'Senior Engineer', dates: '2024 – Present', bullets: ['Led platform migration'] },
        { company: 'Acme', location: 'Remote', title: 'Engineer', dates: '2022 – 2024', bullets: ['Built internal tools'] },
      ],
    })
    const r = resolveTailoring(s, tailored(diff({ index: 0, original: 'Built internal tools', tailored: 'Built internal developer tools' })))
    expect(r.structure.experience[0].bullets[0]).toBe('Led platform migration')
    expect(r.structure.experience[1].bullets[0]).toBe('Built internal developer tools')
  })

  it('applies project diffs and never lets two diffs replace the same bullet', () => {
    const r = resolveTailoring(resume(), tailored(
      diff({ section: 'ApplyMaster', index: 0, original: 'Migrating resume parsing to structured skill groups', tailored: 'Migrating resume parsing to typed skill groups' }),
      diff({ section: 'ApplyMaster', index: 0, original: 'Migrating resume parsing to structured skill groups', tailored: 'Second edit' }),
    ))
    expect(r.structure.projects[0].bullets[0]).toBe('Migrating resume parsing to typed skill groups')
    expect(r.applied).toHaveLength(1)
    expect(r.notApplied).toHaveLength(1)
  })

  it('does not modify the structure it was given', () => {
    const s = resume()
    resolveTailoring(s, tailored(diff({ index: 0, original: 'Built automated deployments for 12 services', tailored: 'Changed' })))
    expect(s.experience[0].bullets[0]).toBe('Built automated deployments for 12 services')
  })
})

describe('normalizeBullet', () => {
  it('keeps numbers and words that carry meaning', () => {
    expect(normalizeBullet('Cut latency by 40%')).not.toBe(normalizeBullet('Cut latency by 50%'))
  })
})

describe('labeledLine', () => {
  it('removes a repeated label from the value', () => {
    expect(labeledLine('Awards', "Awards: Awards: Dean's List")).toEqual({ label: 'Awards', text: "Dean's List" })
  })
  it('keeps values that only start with the same word', () => {
    expect(labeledLine('Cloud', 'Cloud Run, Cloud SQL').text).toBe('Cloud Run, Cloud SQL')
  })
})

describe('resumeFileName', () => {
  it('names the file after the candidate and drops invalid characters', () => {
    expect(resumeFileName('Jane Doe')).toBe('Jane_Doe_Resume')
    expect(resumeFileName('Jane/Doe: "PhD"')).toBe('JaneDoe_PhD_Resume')
    expect(resumeFileName('')).toBe('Resume')
  })
})
