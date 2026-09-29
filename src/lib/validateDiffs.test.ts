import { describe, it, expect } from 'vitest'
import { rejectReason, validateDiffs } from '../../supabase/functions/claude-proxy/validateDiffs.ts'

const d = (original: string, tailored: string) => ({ section: 'Acme', index: 0, original, tailored })

describe('rejectReason — keeps real terminology swaps', () => {
  it.each([
    ['Built automated deployments for 12 services', 'Built CI/CD pipelines for 12 services'],
    ['Worked with multiple teams to ship a billing dashboard', 'Worked with cross-functional teams to ship a billing dashboard'],
    ['Maintained a large-scale backend for payments', 'Maintained distributed systems for payments'],
    ['Implemented Supabase authentication and data storage, plus PDF/DOCX resume parsing and export',
     'Implemented Supabase authentication and data systems, plus PDF/DOCX resume parsing and export'],
    ['Migrating resume parsing to structured skill groups', 'Migrating resume parsing to typed skill groups'],
  ])('%s', (original, tailored) => {
    expect(rejectReason(d(original, tailored))).toBeNull()
  })
})

// Every "reject" case below is a change Claude actually produced in the prompt comparison run
describe('rejectReason — drops changes that alter facts', () => {
  it('a tool or product name disappears', () => {
    expect(rejectReason(d('Designed the UI in Figma, built the TypeScript frontend, and developed Firebase backend services',
      'Designed the UI in Figma, built the TypeScript frontend, and developed backend/infra services'))).toBe('term-removed')
    expect(rejectReason(d('Designed the MySQL schema with the DB team and documented SRS, specs, and UI mockups',
      'Designed the SQL schema with the DB team and documented SRS, specs, and UI mockups'))).toBe('term-removed')
    expect(rejectReason(d('Integrated the Claude API to analyze job postings and rewrite resume content to match key skills',
      'Integrated the Claude agent to analyze job postings and rewrite resume content to match key skills'))).toBe('term-removed')
  })

  it('the work described changes (documented specs → shaped decisions)', () => {
    expect(rejectReason(d('Designed the MySQL schema with the DB team and documented SRS, specs, and UI mockups',
      'Designed the MySQL schema with the DB team and shaped architecture, product, UX decisions'))).toBe('term-removed')
  })

  it('numbers change', () => {
    expect(rejectReason(d('Cut API latency by 40% across 12 services', 'Cut API latency by 50% across 12 services'))).toBe('numbers-changed')
  })

  it('the bullet gets longer than a word swap', () => {
    expect(rejectReason(d('Built a job queue', 'Built a highly scalable distributed job queue'))).toBe('longer')
  })

  it('ongoing work becomes finished work', () => {
    expect(rejectReason(d('Migrating resume parsing to skill groups', 'Migrated resume parsing to skill groups'))).toBe('tense-changed')
  })

  it('a banned word is introduced', () => {
    expect(rejectReason(d('Built the billing service', 'Built the robust billing service'))).not.toBeNull()
    expect(rejectReason(d('Ensured uptime for the billing service', 'Ensured uptime for billing services'))).toBeNull()
  })

  it('empty or unchanged output', () => {
    expect(rejectReason(d('Built tools', ''))).toBe('empty')
    expect(rejectReason(d('Built tools', 'Built  tools'))).toBe('unchanged')
  })
})

describe('validateDiffs', () => {
  it('splits kept and rejected diffs with reasons', () => {
    const { kept, rejected } = validateDiffs([
      d('Built automated deployments for 12 services', 'Built CI/CD pipelines for 12 services'),
      d('Cut latency by 40%', 'Cut latency by 45%'),
    ])
    expect(kept).toHaveLength(1)
    expect(rejected.map(r => r.reason)).toEqual(['numbers-changed'])
  })
})
