import { describe, it, expect } from 'vitest'
import { needsFollowUp, daysSince, FOLLOW_UP_DAYS, TRACKED_STATUSES } from './status'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-09-29T12:00:00Z').getTime()
const ago = (days: number) => new Date(now - days * DAY).toISOString()

describe('needsFollowUp', () => {
  it('flags applications still "applied" after 30 days', () => {
    expect(FOLLOW_UP_DAYS).toBe(30)
    expect(needsFollowUp({ status: 'applied', created_at: ago(30) }, now)).toBe(true)
    expect(needsFollowUp({ status: 'applied', created_at: ago(29) }, now)).toBe(false)
  })

  it('never flags applications that moved on, or saved postings', () => {
    for (const status of ['interviewing', 'no_response', 'rejected', 'offer', 'saved'])
      expect(needsFollowUp({ status, created_at: ago(90) }, now)).toBe(false)
  })
})

describe('daysSince', () => {
  it('counts whole days', () => {
    expect(daysSince(ago(45), now)).toBe(45)
    expect(daysSince(ago(0.5), now)).toBe(0)
  })
})

describe('TRACKED_STATUSES', () => {
  it('lets a tracked application move to no response but not back to saved', () => {
    expect(TRACKED_STATUSES).toContain('no_response')
    expect(TRACKED_STATUSES).not.toContain('saved')
  })
})
