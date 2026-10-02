import { describe, it, expect } from 'vitest'
import { splitLetter, contactRuns } from './letterLayout'

const header = { name: 'Jane Doe', contact: '555-123-4567 | jane@example.com' }

describe('splitLetter', () => {
  it('takes the name and contact line off the top', () => {
    const letter = 'Jane Doe\n555-123-4567 | jane@example.com\n\nOctober 2, 2026\n\nDear Hiring Manager,\n\nBody.\n\nSincerely,\nJane Doe\n'
    expect(splitLetter(letter, header)).toEqual({
      name: 'Jane Doe',
      contact: '555-123-4567 | jane@example.com',
      body: ['October 2, 2026', '', 'Dear Hiring Manager,', '', 'Body.', '', 'Sincerely,', 'Jane Doe'],
    })
  })

  it('recognizes a letterhead that differs from the resume by its contact line', () => {
    const parts = splitLetter('J. Doe\njane@example.com\n\nDear team,', header)
    expect([parts.name, parts.contact, parts.body]).toEqual(['J. Doe', 'jane@example.com', ['Dear team,']])
  })

  it('falls back to the resume header when the letter has none', () => {
    expect(splitLetter('Dear Hiring Manager,\n\nBody.', header)).toEqual({ ...header, body: ['Dear Hiring Manager,', '', 'Body.'] })
  })

  it('does not mistake a greeting for a name', () => {
    expect(splitLetter('Dear Hiring Manager,\njane@example.com').body[0]).toBe('Dear Hiring Manager,')
  })
})

describe('contactRuns', () => {
  it('links emails and web addresses, leaving phone numbers and separators as text', () => {
    expect(contactRuns('203-690-9355 | jane@example.com | linkedin.com/in/jane | https://jane.dev')).toEqual([
      { text: '203-690-9355' }, { text: ' | ' },
      { text: 'jane@example.com', url: 'mailto:jane@example.com' }, { text: ' | ' },
      { text: 'linkedin.com/in/jane', url: 'https://linkedin.com/in/jane' }, { text: ' | ' },
      { text: 'https://jane.dev', url: 'https://jane.dev' },
    ])
  })
})
