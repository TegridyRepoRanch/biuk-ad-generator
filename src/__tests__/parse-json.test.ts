import { describe, it, expect } from 'vitest'
import { extractJSON } from '@/lib/parse-json'

describe('parse-json.extractJSON', () => {
  it('parses valid JSON object', () => {
    const result = extractJSON('{"name":"test","value":42}')
    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('extracts JSON from markdown code fence with json tag', () => {
    const text = 'Here is the response:\n```json\n{"key":"value"}\n```\nEnd.'
    const result = extractJSON(text)
    expect(result).toEqual({ key: 'value' })
  })

  it('extracts JSON from markdown code fence without json tag', () => {
    const text = 'Response:\n```\n{"x":1,"y":2}\n```'
    const result = extractJSON(text)
    expect(result).toEqual({ x: 1, y: 2 })
  })

  it('handles nested objects', () => {
    const text = '{"outer":{"inner":"value"},"arr":[1,2,3]}'
    const result = extractJSON(text)
    expect(result).toEqual({ outer: { inner: 'value' }, arr: [1, 2, 3] })
  })

  it('ignores text before and after JSON', () => {
    const text = 'Some preamble\n{"id":123}\nSome trailing comment'
    const result = extractJSON(text)
    expect(result).toEqual({ id: 123 })
  })

  it('handles escaped quotes in JSON values', () => {
    const text = '{"message":"He said \\"Hello\\""}'
    const result = extractJSON(text)
    expect(result).toEqual({ message: 'He said "Hello"' })
  })

  it('ignores trailing commentary with braces', () => {
    const text = '{"complete":true}\n\nNote: see {example} for more'
    const result = extractJSON(text)
    expect(result).toEqual({ complete: true })
  })

  it('throws error if no JSON object found', () => {
    expect(() => extractJSON('just plain text')).toThrow('No JSON object found in response')
  })

  it('throws error if JSON is incomplete', () => {
    expect(() => extractJSON('{"unclosed":')).toThrow('No complete JSON object found in response')
  })

  it('handles whitespace and newlines', () => {
    const text = `
    {
      "key": "value",
      "number": 42
    }
    `
    const result = extractJSON(text)
    expect(result).toEqual({ key: 'value', number: 42 })
  })

  it('handles arrays at root level after finding opening brace', () => {
    // Note: This tests the actual behavior - it looks for opening {
    const text = '{"items":[1,2,3]}'
    const result = extractJSON(text)
    expect(result).toEqual({ items: [1, 2, 3] })
  })

  it('handles backslash escaping', () => {
    const text = '{"path":"C:\\\\Users\\\\test"}'
    const result = extractJSON(text)
    expect(result).toEqual({ path: 'C:\\Users\\test' })
  })
})
