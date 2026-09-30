export interface UiZoomPercentRect {
  x: number
  y: number
  width: number
  height: number
}

export interface UiZoomSourceSize {
  width: number
  height: number
}

export interface UiZoomFrameSize {
  width: number
  height: number
}

const MIN_DIMENSION = 1e-6

/** Converts SourceEvidence's normalized 0–1 rectangle to the persisted 0–100 contract. */
export function normalizedRectToUiZoomPercentRect(rect: UiZoomPercentRect): UiZoomPercentRect {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
    || rect.x + rect.width > 1 || rect.y + rect.height > 1) {
    throw new Error('UI Zoom evidence region must be a positive rectangle inside its source image.')
  }
  return {
    x: rect.x * 100,
    y: rect.y * 100,
    width: rect.width * 100,
    height: rect.height * 100,
  }
}

/**
 * Returns the exact source rectangle exposed after UI Zoom's authored region
 * is center-cropped into its fixed canvas frame. Renderer, compiler, and
 * acceptance evidence share this calculation so they cannot disagree about
 * what the user actually sees.
 */
export function effectiveUiZoomSourceRect(input: {
  sourceRect: UiZoomPercentRect
  sourceSize: UiZoomSourceSize
  frameSize: UiZoomFrameSize
}): UiZoomPercentRect {
  const { sourceRect, sourceSize, frameSize } = input
  let x = sourceRect.x
  let y = sourceRect.y
  let width = sourceRect.width
  let height = sourceRect.height

  const sourcePixelWidth = sourceSize.width * width / 100
  const sourcePixelHeight = sourceSize.height * height / 100
  const sourceAspect = sourcePixelWidth / Math.max(sourcePixelHeight, MIN_DIMENSION)
  const frameAspect = Math.max(frameSize.width, MIN_DIMENSION)
    / Math.max(frameSize.height, MIN_DIMENSION)

  if (sourceAspect > frameAspect) {
    const nextPixelWidth = sourcePixelHeight * frameAspect
    const nextWidth = nextPixelWidth / Math.max(sourceSize.width, MIN_DIMENSION) * 100
    x += (width - nextWidth) / 2
    width = nextWidth
  } else {
    const nextPixelHeight = sourcePixelWidth / Math.max(frameAspect, MIN_DIMENSION)
    const nextHeight = nextPixelHeight / Math.max(sourceSize.height, MIN_DIMENSION) * 100
    y += (height - nextHeight) / 2
    height = nextHeight
  }

  return { x, y, width, height }
}
