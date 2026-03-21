import { describe, it, expect } from 'vitest'
import { getPreviewScale } from '@/lib/preview-scale'

describe('preview-scale.getPreviewScale', () => {
  it('scales square dimensions', () => {
    const scale = getPreviewScale(1000, 1000, 500)
    expect(scale).toBe(0.5)
  })

  it('scales portrait dimensions', () => {
    const scale = getPreviewScale(1080, 1350, 500)
    // Height is limiting factor: 500/1350 ≈ 0.370
    expect(scale).toBeCloseTo(500 / 1350, 2)
  })

  it('scales landscape dimensions', () => {
    const scale = getPreviewScale(1200, 628, 500)
    // Width is limiting factor: 500/1200 ≈ 0.417
    expect(scale).toBeCloseTo(500 / 1200, 2)
  })

  it('scales up small dimensions to fit maxSize', () => {
    const scale = getPreviewScale(200, 200, 500)
    // 500/200 = 2.5, the function doesn't cap at 1
    expect(scale).toBe(2.5)
  })

  it('uses default maxSize of 500', () => {
    const scale1 = getPreviewScale(1000, 1000)
    const scale2 = getPreviewScale(1000, 1000, 500)
    expect(scale1).toBe(scale2)
  })

  it('respects custom maxSize', () => {
    const scale1 = getPreviewScale(1000, 1000, 250)
    const scale2 = getPreviewScale(1000, 1000, 500)
    expect(scale1).toBe(0.25)
    expect(scale2).toBe(0.5)
    expect(scale1).toBeLessThan(scale2)
  })

  it('handles very small dimensions', () => {
    const scale = getPreviewScale(100, 100, 500)
    // 500/100 = 5
    expect(scale).toBe(5)
  })

  it('handles very large dimensions', () => {
    const scale = getPreviewScale(10000, 10000, 500)
    expect(scale).toBe(0.05)
  })

  it('calculates min correctly for different aspect ratios', () => {
    // Width is limiting: 500/2000 = 0.25
    const scale1 = getPreviewScale(2000, 1000, 500)
    expect(scale1).toBe(0.25)

    // Height is limiting: 500/2000 = 0.25
    const scale2 = getPreviewScale(1000, 2000, 500)
    expect(scale2).toBe(0.25)
  })

  it('handles Instagram feed square', () => {
    const scale = getPreviewScale(1080, 1080, 500)
    expect(scale).toBeCloseTo(500 / 1080, 3)
  })

  it('handles Instagram stories', () => {
    const scale = getPreviewScale(1080, 1920, 500)
    // Height is limiting: 500/1920
    expect(scale).toBeCloseTo(500 / 1920, 3)
  })

  it('handles Facebook landscape', () => {
    const scale = getPreviewScale(1200, 628, 500)
    // Width is limiting: 500/1200
    expect(scale).toBeCloseTo(500 / 1200, 3)
  })

  it('returns positive number', () => {
    const scale = getPreviewScale(1000, 1000, 500)
    expect(scale).toBeGreaterThan(0)
  })

  it('scales proportionally', () => {
    const scale = getPreviewScale(2000, 1000, 500)
    const scaled1 = 2000 * scale
    const scaled2 = 1000 * scale
    // At least one dimension should be at maxSize
    expect(Math.max(scaled1, scaled2)).toBe(500)
  })
})
