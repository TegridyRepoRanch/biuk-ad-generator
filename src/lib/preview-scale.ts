/**
 * Calculate a preview scale factor to fit platform dimensions
 * into a max bounding box, used across compose/export/upload pages.
 */
export function getPreviewScale(
  width: number,
  height: number,
  maxSize = 500
): number {
  return Math.min(maxSize / width, maxSize / height)
}
