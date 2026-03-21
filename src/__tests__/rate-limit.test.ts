import { describe, it, expect, beforeEach, vi } from 'vitest'
import { rateLimit } from '@/lib/rate-limit'

describe('rate-limit.rateLimit', () => {
  beforeEach(() => {
    // Clear the internal windows map by calling with a new key each time
    // This isn't ideal but works for testing
    vi.useFakeTimers()
  })

  it('allows first request within limit', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const result = rateLimit('test-key', 5, 1000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('allows multiple requests within limit', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'multi-test'

    rateLimit(key, 3, 1000)
    const result2 = rateLimit(key, 3, 1000)
    const result3 = rateLimit(key, 3, 1000)

    expect(result2.allowed).toBe(true)
    expect(result2.remaining).toBe(1)
    expect(result3.allowed).toBe(true)
    expect(result3.remaining).toBe(0)
  })

  it('blocks request after limit exceeded', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'limit-test'
    const limit = 2

    rateLimit(key, limit, 1000)
    rateLimit(key, limit, 1000)
    const result3 = rateLimit(key, limit, 1000)

    expect(result3.allowed).toBe(false)
    expect(result3.remaining).toBe(0)
  })

  it('remaining is 0 after limit exceeded', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'remaining-test'

    rateLimit(key, 1, 1000)
    const result2 = rateLimit(key, 1, 1000)

    expect(result2.remaining).toBe(0)
    expect(result2.allowed).toBe(false)
  })

  it('resets after time window expires', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'window-test'

    rateLimit(key, 1, 1000)

    // Move time forward past window
    vi.setSystemTime(new Date('2024-01-01T00:00:02Z'))

    const result = rateLimit(key, 1, 1000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('different keys have separate limits', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))

    rateLimit('key-a', 1, 1000)
    rateLimit('key-b', 1, 1000)

    const resultA2 = rateLimit('key-a', 1, 1000)
    const resultB2 = rateLimit('key-b', 1, 1000)

    expect(resultA2.allowed).toBe(false)
    expect(resultB2.allowed).toBe(false)
  })

  it('tracks remaining correctly as requests accumulate', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'track-test'

    const r1 = rateLimit(key, 5, 1000)
    expect(r1.remaining).toBe(4)

    const r2 = rateLimit(key, 5, 1000)
    expect(r2.remaining).toBe(3)

    const r3 = rateLimit(key, 5, 1000)
    expect(r3.remaining).toBe(2)
  })

  it('handles limit of 1', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'one-limit'

    const r1 = rateLimit(key, 1, 1000)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(0)

    const r2 = rateLimit(key, 1, 1000)
    expect(r2.allowed).toBe(false)
  })

  it('handles large limits', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'large-limit'

    const r1 = rateLimit(key, 1000, 1000)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(999)
  })

  it('respects different window sizes', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const key = 'window-size-test'

    rateLimit(key, 1, 500)

    // Move just under window
    vi.setSystemTime(new Date('2024-01-01T00:00:00.400Z'))
    const resultBefore = rateLimit(key, 1, 500)
    expect(resultBefore.allowed).toBe(false)

    // Move past window
    vi.setSystemTime(new Date('2024-01-01T00:00:00.600Z'))
    const resultAfter = rateLimit(key, 1, 500)
    expect(resultAfter.allowed).toBe(true)
  })
})
