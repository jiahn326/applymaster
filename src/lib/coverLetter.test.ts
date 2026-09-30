import { describe, it, expect } from 'vitest'
import { fillFixedPlaceholders, splitTemplate, assembleLetter, middleWordRange, unsupportedTerms, jdOnlyTerms, LETTER_RULES, LETTER_TARGET_CHARS } from '../../supabase/functions/claude-proxy/coverLetter.ts'
import { resumeToText } from './resumeUtils'
import type { ResumeStructure } from './parseResumeStructure'

const ctx = { company: 'Acme', role: 'Frontend Engineer', today: 'September 28, 2026', name: 'Jane Doe', contact: 'jane@example.com' }

// Same shape as a real user template: date, greeting, intro, two experience
// paragraphs, a why-company line with a note, thank-you, sign-off
const TEMPLATE = `[DATE]

Dear Hiring Manager,

I am excited to apply for the [POSITION] role at [COMPANY].

At Example Co, I built internal tools.

I have kept building since then.

I am drawn to [COMPANY] because [SPECIFIC REASON].

Thank you for your time and consideration. I would welcome the chance to talk.

Sincerely,
Jane Doe`

describe('fillFixedPlaceholders', () => {
  it('fills short and long placeholder names alike', () => {
    const t = fillFixedPlaceholders('[DATE] [TODAY_DATE] [COMPANY] [COMPANY_NAME] [POSITION] [POSITION_NAME] [NAME] [CONTACT]', ctx)
    expect(t).toBe('September 28, 2026 September 28, 2026 Acme Acme Frontend Engineer Frontend Engineer Jane Doe jane@example.com')
  })

  it('leaves notes for the model untouched', () => {
    expect(fillFixedPlaceholders('because [SPECIFIC REASON]. [BODY]', ctx)).toBe('because [SPECIFIC REASON]. [BODY]')
  })
})

describe('splitTemplate', () => {
  const parts = splitTemplate(fillFixedPlaceholders(TEMPLATE, ctx))!

  it('keeps the date and greeting on top, verbatim', () => {
    expect(parts.top).toBe('September 28, 2026\n\nDear Hiring Manager,')
  })

  it('gives the model only the paragraphs between greeting and closing', () => {
    expect(parts.middle.startsWith('I am excited to apply for the Frontend Engineer role at Acme.')).toBe(true)
    expect(parts.middle.endsWith('I am drawn to Acme because [SPECIFIC REASON].')).toBe(true)
    expect(parts.middle).not.toContain('Thank you')
  })

  it('keeps the thank-you paragraph and sign-off verbatim at the bottom', () => {
    expect(parts.bottom).toBe('Thank you for your time and consideration. I would welcome the chance to talk.\n\nSincerely,\nJane Doe')
  })

  it('reassembles top + new middle + bottom', () => {
    expect(assembleLetter(parts, '  New body.\n\nSecond paragraph.  ')).toBe(`${parts.top}\n\nNew body.\n\nSecond paragraph.\n\n${parts.bottom}`)
  })

  it('works with the default template ([BODY] + "Thank you for considering…")', () => {
    const p = splitTemplate('Jane\n\nDate\n\nDear Hiring Manager,\n\n[BODY]\n\nThank you for considering my application.\n\nSincerely,\nJane')!
    expect(p.middle).toBe('[BODY]')
    expect(p.bottom.startsWith('Thank you for considering')).toBe(true)
  })

  it('does not treat "thank you" inside a paragraph as the closing', () => {
    const p = splitTemplate('Dear team,\n\nI want to thank you for reading. More text.\n\nBest regards,\nJane')!
    expect(p.middle).toBe('I want to thank you for reading. More text.')
  })

  it('returns null without a greeting or closing, so the prompt-only path is used', () => {
    expect(splitTemplate('Hello there\n\n[BODY]')).toBeNull()
    expect(splitTemplate('Dear Hiring Manager,\n\n[BODY]\n\nJane')).toBeNull()
    expect(splitTemplate('Dear Hiring Manager,\n\nSincerely,\nJane')).toBeNull()
  })
})

describe('middleWordRange', () => {
  it('budgets the middle as the target minus the fixed top and bottom', () => {
    const parts = { top: 'x'.repeat(40), middle: '', bottom: 'y'.repeat(150) }
    const [min, max] = middleWordRange(parts)
    const words = Math.round((LETTER_TARGET_CHARS - 194) / 6.5)
    expect([min, max]).toEqual([Math.round(words * 0.82), Math.round(words * 0.95)])
  })

  it('never goes below a readable minimum', () => {
    expect(middleWordRange({ top: 'x'.repeat(2000), middle: '', bottom: '' })[0]).toBe(66)
  })
})

describe('unsupportedTerms', () => {
  const jd = 'Requirements: 2+ years with React and TypeScript, experience with REST APIs, comfortable with Tailwind CSS. Preferred: Next.js, Supabase or Firebase, deploying on Vercel, C++ and CI/CD.'
  const resume = 'Built a React and TypeScript app with Supabase, deployed on Vercel. Set up CI/CD with GitHub Actions.'

  it('lists the JD tools the resume never mentions, for the prompt', () => {
    expect(jdOnlyTerms(jd, resume).sort()).toEqual(['C++', 'CSS', 'Firebase', 'Next.js', 'REST', 'Tailwind'])
  })

  it('flags JD tools the letter names that the resume never mentions', () => {
    const letter = 'I have hands-on experience with React, TypeScript, and REST APIs, and a stack I already use, including Next.js and Tailwind.'
    expect(unsupportedTerms(letter, jd, resume).sort()).toEqual(['Next.js', 'REST', 'Tailwind'])
  })

  it('does not flag tools that are on the resume', () => {
    expect(unsupportedTerms('I built React and TypeScript apps on Supabase and Vercel with CI/CD.', jd, resume)).toEqual([])
  })

  it('ignores the company, role, and template text passed as known', () => {
    const jd2 = 'Brightpath is hiring. You will work with Kafka at Brightpath.'
    expect(unsupportedTerms('I am drawn to Brightpath.', jd2, resume, 'Brightpath Full Stack Engineer')).toEqual([])
    expect(unsupportedTerms('I have used Kafka.', jd2, resume)).toEqual(['Kafka'])
  })

  it('does not treat generic acronyms or word fragments as tools', () => {
    expect(unsupportedTerms('I build AI features with a good UI.', 'Build AI features and UI for US customers.', resume)).toEqual([])
    expect(unsupportedTerms('I restored service.', jd, resume)).toEqual([])
  })
})

describe('resumeToText', () => {
  it('renders the resume the letter should draw facts from', () => {
    const s: ResumeStructure = {
      header: { name: 'Jane Doe', contact: 'jane@example.com' },
      sectionTitles: { experience: 'WORK EXPERIENCE' },
      education: [{ school: 'State U', location: 'Seattle, WA', degree: 'B.S. CS', dates: '2022', awards: "Awards: Dean's List" }],
      skills: { groups: [{ label: 'Tools', items: ['Supabase', 'Figma'] }] },
      experience: [{ company: 'Acme', location: 'Remote', title: 'Engineer', dates: '2023', bullets: ['Built CI/CD pipelines'] }],
      projects: [{ name: 'ApplyMaster', tech: 'React', dates: '2026 - Present', bullets: ['Migrating parsing'] }],
    }
    const t = resumeToText(s)
    expect(t).toContain("Awards: Dean's List")
    expect(t).not.toContain('Awards: Awards:')
    expect(t).toContain('WORK EXPERIENCE\nEngineer — Acme, Remote (2023)\n- Built CI/CD pipelines')
    expect(t).toContain('ApplyMaster (React) — 2026 - Present\n- Migrating parsing')
    expect(t).toContain('Tools: Supabase, Figma')
  })
})

describe('LETTER_RULES', () => {
  it('asks for a placeholder instead of an invented story', () => {
    expect(LETTER_RULES).toContain('Never invent a specific event or anecdote')
    expect(LETTER_RULES).toContain('Add a real example:')
  })
})
