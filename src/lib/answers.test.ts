import { describe, it, expect } from 'vitest'
import { whyQuestion, newAnswer, updateAnswer, parseMaxChars, isOverLimit } from './answers'

describe('answers', () => {
  it('builds the default why-company question', () => {
    expect(whyQuestion('Acme')).toBe('Why do you want to work at Acme?')
  })

  it('creates an empty answer with trimmed question and settings', () => {
    const a = newAnswer('  What energizes you most?  ', 'short', 500)
    expect(a).toMatchObject({ question: 'What energizes you most?', answer: '', length: 'short', maxChars: 500 })
    expect(a.id).toBeTruthy()
  })

  it('updates only the matching answer', () => {
    const a = newAnswer('Q1', 'medium', null), b = newAnswer('Q2', 'medium', null)
    const next = updateAnswer([a, b], b.id, { answer: 'Because…' })
    expect(next[0]).toBe(a)
    expect(next[1].answer).toBe('Because…')
  })

  it('parses a typed character limit, treating empty or invalid as none', () => {
    expect(parseMaxChars('500')).toBe(500)
    expect(parseMaxChars(' 250 ')).toBe(250)
    expect(parseMaxChars('')).toBeNull()
    expect(parseMaxChars('0')).toBeNull()
    expect(parseMaxChars('abc')).toBeNull()
  })

  it('flags answers over their limit only when a limit is set', () => {
    expect(isOverLimit({ ...newAnswer('Q', 'short', 10), answer: '12345678901' })).toBe(true)
    expect(isOverLimit({ ...newAnswer('Q', 'short', 10), answer: '1234567890' })).toBe(false)
    expect(isOverLimit({ ...newAnswer('Q', 'short', null), answer: 'x'.repeat(5000) })).toBe(false)
  })
})
