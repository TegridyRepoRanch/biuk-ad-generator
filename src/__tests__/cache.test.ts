import { describe, it, expect } from 'vitest'
import { hashKey } from '@/lib/cache'

describe('cache.hashKey', () => {
  it('produces consistent hashes for same input', () => {
    const hash1 = hashKey('example.com', '1080', '1350')
    const hash2 = hashKey('example.com', '1080', '1350')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different inputs', () => {
    const hash1 = hashKey('example.com', '1080', '1350')
    const hash2 = hashKey('example.com', '1080', '1080')
    expect(hash1).not.toBe(hash2)
  })

  it('ignores null and undefined parts', () => {
    const hash1 = hashKey('example.com', '1080', null, '1350')
    const hash2 = hashKey('example.com', '1080', '1350')
    expect(hash1).toBe(hash2)
  })

  it('produces string output in base36', () => {
    const hash = hashKey('test')
    expect(typeof hash).toBe('string')
    // Base36 uses digits 0-9 and a-z
    expect(/^[0-9a-z]+$/.test(hash)).toBe(true)
  })

  it('handles single part', () => {
    const hash = hashKey('single')
    expect(hash).toBeTruthy()
    expect(typeof hash).toBe('string')
  })

  it('handles multiple parts', () => {
    const hash = hashKey('a', 'b', 'c', 'd', 'e')
    expect(hash).toBeTruthy()
    expect(typeof hash).toBe('string')
  })

  it('is order-sensitive', () => {
    const hash1 = hashKey('first', 'second')
    const hash2 = hashKey('second', 'first')
    expect(hash1).not.toBe(hash2)
  })

  it('treats different cases differently', () => {
    const hash1 = hashKey('Example.com')
    const hash2 = hashKey('example.com')
    expect(hash1).not.toBe(hash2)
  })
})
