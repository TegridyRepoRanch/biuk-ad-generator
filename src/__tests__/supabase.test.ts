import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '@/lib/supabase'

describe('supabase.normalizeUrl', () => {
  it('removes protocol', () => {
    const result = normalizeUrl('https://example.com/path')
    expect(result).not.toContain('https://')
    expect(result).not.toContain('http://')
  })

  it('removes www prefix', () => {
    const result = normalizeUrl('https://www.example.com')
    expect(result).toContain('example.com')
    expect(result).not.toContain('www.')
  })

  it('removes trailing slash', () => {
    const result = normalizeUrl('https://example.com/')
    expect(result).not.toMatch(/\/$/)
  })

  it('preserves path after domain', () => {
    const result = normalizeUrl('https://example.com/products/widget')
    expect(result).toContain('/products/widget')
  })

  it('converts to lowercase', () => {
    const result = normalizeUrl('https://Example.COM/Path')
    expect(result).toBe(result.toLowerCase())
  })

  it('handles complex URLs with query params', () => {
    // Query params are not stripped in normalizeUrl, only fragments
    const result = normalizeUrl('https://example.com/path?id=123#section')
    expect(result).toBeTruthy()
    expect(result).not.toContain('https://')
  })

  it('produces consistent output', () => {
    const url = 'https://www.example.com/products/'
    const result1 = normalizeUrl(url)
    const result2 = normalizeUrl(url)
    expect(result1).toBe(result2)
  })

  it('handles URLs without path', () => {
    const result = normalizeUrl('https://example.com')
    expect(result).toContain('example.com')
  })

  it('handles malformed URLs gracefully', () => {
    // Falls back to simple lowercase trim
    const result = normalizeUrl('not a valid url at all')
    expect(result).toBe('not a valid url at all')
  })

  it('removes www from subdomains correctly', () => {
    const result = normalizeUrl('https://www.sub.example.com')
    expect(result).toContain('sub.example.com')
  })

  it('handles IP addresses', () => {
    const result = normalizeUrl('https://192.168.1.1/api')
    expect(result).toContain('192.168.1.1')
  })

  it('distinguishes different domains', () => {
    const result1 = normalizeUrl('https://example1.com/path')
    const result2 = normalizeUrl('https://example2.com/path')
    expect(result1).not.toBe(result2)
  })

  it('normalizes both www and non-www to same value', () => {
    const result1 = normalizeUrl('https://www.example.com/path')
    const result2 = normalizeUrl('https://example.com/path')
    expect(result1).toBe(result2)
  })

  it('handles ports in URL', () => {
    const result = normalizeUrl('https://example.com:8080/path')
    // Port is part of hostname parsing
    expect(result).toBeTruthy()
  })
})
