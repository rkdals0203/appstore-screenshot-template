export interface PixelPlane { width: number; height: number; data: Uint8ClampedArray }
export interface PixelRect { x: number; y: number; width: number; height: number }

/** Same-coordinate comparison only: no registration, resizing, or automatic quality pass. */
export function comparePixels(source: PixelPlane, rendered: PixelPlane, exclusions: PixelRect[] = []) {
  if (source.width !== rendered.width || source.height !== rendered.height) throw new Error('comparison-dimensions-differ')
  const { width, height } = source
  if (source.data.length !== width * height * 4 || rendered.data.length !== source.data.length) throw new Error('comparison-invalid-pixels')
  for (const r of exclusions) if (![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > width || r.y + r.height > height) throw new Error('comparison-invalid-exclusion')
  const diff = new Uint8ClampedArray(source.data.length)
  let compared = 0, excluded = 0, absoluteError = 0, changed = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    diff[i + 3] = 255
    if (exclusions.some(r => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height)) { excluded++; diff[i + 2] = 100; continue }
    compared++; let max = 0
    for (let c = 0; c < 3; c++) {
      const a = source.data[i + c] * source.data[i + 3] / 255 + 255 - source.data[i + 3]
      const b = rendered.data[i + c] * rendered.data[i + 3] / 255 + 255 - rendered.data[i + 3]
      const delta = Math.abs(a - b); diff[i + c] = delta; absoluteError += delta; max = Math.max(max, delta)
    }
    if (max > 8) changed++
  }
  if (!compared) throw new Error('comparison-all-pixels-excluded')
  return { diff, width, height, compared, excluded, changed, meanAbsoluteError: absoluteError / (compared * 3), interpretation: 'diagnostic-not-fidelity-approval' as const }
}

export function inkBounds(plane: PixelPlane, background: [number, number, number], threshold = 24): PixelRect | null {
  let left = plane.width, top = plane.height, right = -1, bottom = -1
  for (let y = 0; y < plane.height; y++) for (let x = 0; x < plane.width; x++) {
    const i = (y * plane.width + x) * 4
    if (plane.data[i + 3] > 0 && background.some((v, c) => Math.abs(plane.data[i + c] - v) > threshold)) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}
