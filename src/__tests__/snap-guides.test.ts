import { describe, it, expect } from 'vitest'
import { getSnapGuides } from '@/lib/snap-guides'

describe('snap-guides.getSnapGuides', () => {
  const defaultSafeZones = { top: 60, bottom: 60, left: 60, right: 60 }
  const defaultCanvas = { width: 1080, height: 1920 }

  it('returns empty guides when no snapping', () => {
    const element = { x: 100, y: 100, width: 200, height: 200 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones)
    expect(result.guides.length).toBe(0)
    expect(result.snappedX).toBeUndefined()
    expect(result.snappedY).toBeUndefined()
  })

  it('snaps to vertical center', () => {
    const canvasCenter = defaultCanvas.width / 2
    const element = { x: 440, y: 100, width: 200, height: 200 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 5)

    expect(result.snappedX).toBeDefined()
    expect(result.guides).toContainEqual({ axis: 'x', position: canvasCenter })
  })

  it('snaps to horizontal center', () => {
    const canvasCenter = defaultCanvas.height / 2
    // Element center needs to be very close to canvas center for snap
    // Canvas center Y = 1920/2 = 960, element center = 960 + 100 = 1060 (too far)
    const element = { x: 100, y: 860, width: 200, height: 200 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 5)

    expect(result.snappedY).toBeDefined()
    expect(result.guides).toContainEqual({ axis: 'y', position: canvasCenter })
  })

  it('snaps to left safe zone edge', () => {
    const leftSafeZone = defaultSafeZones.left
    const element = { x: 55, y: 100, width: 100, height: 100 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 10)

    expect(result.snappedX).toBe(leftSafeZone)
    expect(result.guides).toContainEqual({ axis: 'x', position: leftSafeZone })
  })

  it('snaps to right safe zone edge', () => {
    const rightSafeZone = defaultCanvas.width - defaultSafeZones.right
    const element = { x: rightSafeZone - 100 + 5, y: 100, width: 100, height: 100 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 10)

    expect(result.snappedX).toBe(rightSafeZone - 100)
    expect(result.guides).toContainEqual({ axis: 'x', position: rightSafeZone })
  })

  it('snaps to top safe zone edge', () => {
    const topSafeZone = defaultSafeZones.top
    const element = { x: 100, y: 55, width: 100, height: 100 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 10)

    expect(result.snappedY).toBe(topSafeZone)
    expect(result.guides).toContainEqual({ axis: 'y', position: topSafeZone })
  })

  it('snaps to bottom safe zone edge', () => {
    const bottomSafeZone = defaultCanvas.height - defaultSafeZones.bottom
    const element = { x: 100, y: bottomSafeZone - 100 + 5, width: 100, height: 100 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 10)

    expect(result.snappedY).toBe(bottomSafeZone - 100)
    expect(result.guides).toContainEqual({ axis: 'y', position: bottomSafeZone })
  })

  it('respects threshold parameter', () => {
    const element = { x: 50, y: 100, width: 100, height: 100 }
    const safeZones = { top: 60, bottom: 60, left: 60, right: 60 }

    // With threshold 20, should snap (60-50=10 < 20)
    const result1 = getSnapGuides(element, defaultCanvas, safeZones, 20)
    expect(result1.snappedX).toBeDefined()

    // With threshold 5, should not snap (60-50=10 > 5)
    const result2 = getSnapGuides(element, defaultCanvas, safeZones, 5)
    expect(result2.snappedX).toBeUndefined()
  })

  it('uses default threshold of 5', () => {
    const element = { x: 60, y: 100, width: 100, height: 100 }
    // At exactly safe zone left (60), should snap within default threshold
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones)
    expect(result.snappedX).toBe(60)
  })

  it('handles multiple snap points', () => {
    // Canvas center: 540, 960. Element center: 438+100=538, 858+100=958 (both close)
    const element = { x: 438, y: 858, width: 200, height: 200 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 5)

    // Should snap to both centers
    expect(result.snappedX).toBeDefined()
    expect(result.snappedY).toBeDefined()
    expect(result.guides.length).toBeGreaterThanOrEqual(2)
  })

  it('returns adjusted position for center snap', () => {
    const canvasCenter = defaultCanvas.width / 2
    const elementWidth = 200
    const element = { x: 440, y: 100, width: elementWidth, height: 200 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 5)

    // Snapped X should position element so center aligns
    expect(result.snappedX).toBe(canvasCenter - elementWidth / 2)
  })

  it('handles different canvas sizes', () => {
    const canvas = { width: 1200, height: 628 }
    const canvasCenter = canvas.width / 2
    const element = { x: 600 - 100, y: 100, width: 200, height: 200 }
    const result = getSnapGuides(element, canvas, defaultSafeZones, 5)

    expect(result.guides).toContainEqual({ axis: 'x', position: canvasCenter })
  })

  it('handles custom safe zones', () => {
    const customSafeZones = { top: 100, bottom: 150, left: 80, right: 120 }
    const element = { x: 75, y: 100, width: 100, height: 100 }
    const result = getSnapGuides(element, defaultCanvas, customSafeZones, 10)

    expect(result.snappedX).toBe(80)
  })

  it('does not snap when outside threshold', () => {
    const element = { x: 100, y: 100, width: 200, height: 200 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 2)

    expect(result.snappedX).toBeUndefined()
    expect(result.snappedY).toBeUndefined()
    expect(result.guides.length).toBe(0)
  })

  it('prioritizes one snap per axis', () => {
    // Element near left safe zone
    const element = { x: 65, y: 100, width: 100, height: 100 }
    const result = getSnapGuides(element, defaultCanvas, defaultSafeZones, 10)

    // Should snap to left safe zone, not center
    expect(result.snappedX).toBe(60)
  })
})
