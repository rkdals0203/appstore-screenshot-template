/**
 * DesignPaint ↔ CSS 배경값 변환 (단일 소스).
 *
 * 에디터의 배경 상태는 두 표현을 오간다.
 *  - `DesignPaint` — 문서 스키마가 저장/검증하는 타입 (SOLID/GRADIENT_LINEAR/GRADIENT_RADIAL/IMAGE)
 *  - CSS 문자열 — 렌더러가 실제로 그리는 값이자 store 의 project/screenshot 배경 필드 타입
 *
 * 두 표현이 어긋나면 인스펙터가 캔버스와 다른 값을 보여주므로, 변환은 여기 한 곳에서만 한다.
 * 칠이 정본이다. CSS 는 칠에서 만들고, CSS 를 칠로 읽을 때는 같은 그림으로 다시 그려지는
 * 경우만 받는다.
 */

import { isGradientPaint, type DesignGradientPaint, type DesignPaint } from './design-document'
import {
  linearCssCoordinates,
  linearGeometryFromAngle,
  UNIT_PAINT_SIZE,
  withGradientGeometry,
  type LinearGradientGeometry,
  type PaintSize,
  type RadialGradientGeometry,
} from './gradient-geometry'

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB_COLOR_RE = /^rgba?\(([^()]*)\)$/i
const GRADIENT_RE = /^(linear|radial)-gradient\s*\(([\s\S]*)\)$/i
const ANGLE_RE = /^(-?\d*\.?\d+)(deg|grad|rad|turn)?$/i
const PERCENT_RE = /^(-?\d*\.?\d+)%$/
const DECLARATION_RE = /^background(?:-image)?\s*:\s*(.+?)\s*;?$/i
/** radial-gradient 첫 세그먼트가 색이 아니라 shape/size/position 인지 (`circle`, `at 50% 0%`, `120% 80% at ...`). */
const RADIAL_GEOMETRY_RE =
  /^(circle|ellipse|at\s|closest-side|closest-corner|farthest-side|farthest-corner|-?\d*\.?\d+(px|%|em|rem|vw|vh)?(\s|$))/i
/** 칠로 그대로 옮길 수 있는 radial prelude: farthest-corner 원, 위치는 선택. */
const RADIAL_CIRCLE_RE = /^circle(?:\s+farthest-corner)?(?:\s+at\s+(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%)?$/i

/** 상자 비율과 무관한 방향 키워드만. 대각선(`to top right`)은 비율에 따라 각도가 달라진다. */
const LINEAR_DIRECTION_ANGLES: Record<string, number> = {
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270,
}

/** `background: <value>;` 처럼 선언 형태로 들어온 문자열에서 CSS 값만 남긴다. */
export function normalizeBackgroundCss(css: string | undefined): string | undefined {
  const value = css?.trim()
  if (!value) return undefined
  const declaration = DECLARATION_RE.exec(value)
  if (declaration) return declaration[1].trim()
  return value.includes(';') ? undefined : value
}

/** paint 를 렌더러가 쓰는 CSS 배경값으로. 그릴 것이 없으면 undefined. */
export function designPaintToCss(paint: DesignPaint | undefined, size: PaintSize = UNIT_PAINT_SIZE): string | undefined {
  if (!paint) return undefined
  if (paint.type === 'SOLID') return colorWithAlpha(paint.color, paint.opacity)
  if (isGradientPaint(paint)) return designGradientToCss(paint, size)
  return `url("${paint.assetRef}")`
}

export type GradientCssInput =
  | { type: 'GRADIENT_LINEAR'; angle?: number; geometry?: LinearGradientGeometry; gradientStops: readonly { color: string; position: number }[] }
  | { type: 'GRADIENT_RADIAL'; geometry?: RadialGradientGeometry; gradientStops: readonly { color: string; position: number }[] }

/**
 * gradient → CSS. With geometry the stop positions map exactly onto the CSS line;
 * without it they are whole percents on the CSS angle / centred circle.
 */
export function designGradientToCss(gradient: GradientCssInput, size: PaintSize = UNIT_PAINT_SIZE): string {
  if (gradient.type === 'GRADIENT_RADIAL') {
    const geometry = gradient.geometry
    if (geometry) {
      const stops = gradient.gradientStops.map(s => `${s.color} ${s.position * geometry.radiusScale * 100}%`).join(', ')
      return `radial-gradient(circle farthest-corner at ${geometry.center.x * 100}% ${geometry.center.y * 100}%, ${stops})`
    }
    return `radial-gradient(circle, ${roundedStops(gradient.gradientStops)})`
  }
  if (gradient.geometry) {
    const { angle, start, length } = linearCssCoordinates({ kind: 'linear', ...gradient.geometry }, size)
    const stops = gradient.gradientStops.map(s => `${s.color} ${(start + s.position * length) * 100}%`).join(', ')
    return `linear-gradient(${angle}deg, ${stops})`
  }
  return `linear-gradient(${gradient.angle ?? 180}deg, ${roundedStops(gradient.gradientStops)})`
}

function roundedStops(stops: readonly { color: string; position: number }[]): string {
  return stops.map((stop) => `${stop.color} ${Math.round(clamp01(stop.position) * 100)}%`).join(', ')
}

/** The gradient with explicit geometry for the editing handles; null for other paints. */
export function editableGradientPaint(paint: DesignPaint | undefined, size: PaintSize = UNIT_PAINT_SIZE): DesignGradientPaint | null {
  if (!isGradientPaint(paint)) return null
  if (paint.geometry) return paint
  return withGradientGeometry(paint, paint.type === 'GRADIENT_RADIAL'
    ? { kind: 'radial', center: { x: 0.5, y: 0.5 }, radiusScale: 1 }
    : linearGeometryFromAngle(paint.angle ?? 180, size))
}

/**
 * CSS 배경값 → paint. 비어 있거나, 칠로 같은 그림을 다시 그릴 수 없는 값은 undefined:
 * conic/repeating, 타원 radial, 대각선 방향 키워드, 길이 단위·두 개 위치·범위 밖 stop,
 * midpoint hint.
 */
export function designPaintFromCss(css: string | undefined): DesignPaint | undefined {
  const value = normalizeBackgroundCss(css)
  if (!value) return undefined
  return solidPaintFromCss(value) ?? gradientPaintFromCss(value)
}

function solidPaintFromCss(value: string): DesignPaint | undefined {
  if (HEX_COLOR_RE.test(value)) return { type: 'SOLID', color: value, opacity: 1 }
  const rgb = RGB_COLOR_RE.exec(value)
  if (!rgb) return undefined
  const parts = rgb[1].split(/[,/]/).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 3) return undefined
  const channels = parts.slice(0, 3).map(parseColorChannel)
  if (channels.some((channel) => channel === undefined)) return undefined
  const [red, green, blue] = channels as number[]
  return {
    type: 'SOLID',
    color: `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`,
    opacity: parts[3] === undefined ? 1 : parseAlphaChannel(parts[3]),
  }
}

function gradientPaintFromCss(value: string): DesignPaint | undefined {
  const match = GRADIENT_RE.exec(value)
  if (!match) return undefined
  const segments = splitOutsideParens(match[2], ',')
  if (segments.length === 0) return undefined
  const first = segments[0]

  if (match[1].toLowerCase() === 'radial') {
    // Without a prelude CSS draws an ellipse; only circles are structured.
    if (!RADIAL_GEOMETRY_RE.test(first) || PERCENT_RE.test(first)) return undefined
    const circle = RADIAL_CIRCLE_RE.exec(first)
    if (!circle) return undefined
    const gradientStops = parseGradientStops(segments.slice(1))
    if (!gradientStops) return undefined
    return {
      type: 'GRADIENT_RADIAL',
      gradientStops,
      opacity: 1,
      ...(circle[1] === undefined ? {} : {
        geometry: { center: { x: Number(circle[1]) / 100, y: Number(circle[2]) / 100 }, radiusScale: 1 },
      }),
    }
  }

  let angle: number | undefined
  let stopSegments = segments
  const keyword = first.toLowerCase().replace(/\s+/g, ' ')
  if (keyword.startsWith('to ')) {
    angle = LINEAR_DIRECTION_ANGLES[keyword]
    if (angle === undefined) return undefined
    stopSegments = segments.slice(1)
  } else {
    angle = parseAngle(first)
    if (angle !== undefined) stopSegments = segments.slice(1)
  }
  const gradientStops = parseGradientStops(stopSegments)
  if (!gradientStops) return undefined
  return {
    type: 'GRADIENT_LINEAR',
    ...(angle === undefined ? {} : { angle }),
    gradientStops,
    opacity: 1,
  }
}

/** Colour stops with at most one percent position each; anything else is not a structured stop list. */
function parseGradientStops(segments: string[]): { color: string; position: number }[] | undefined {
  const parsed: { color: string; position?: number }[] = []
  for (const segment of segments) {
    // A position without a colour is a CSS midpoint hint.
    if (PERCENT_RE.test(segment)) return undefined
    const colorTokens: string[] = []
    let position: number | undefined
    for (const token of splitOutsideParens(segment, ' ')) {
      const percent = PERCENT_RE.exec(token)
      if (percent && colorTokens.length > 0) {
        const value = Number.parseFloat(percent[1])
        if (position !== undefined || value < 0 || value > 100) return undefined
        position = value / 100
        continue
      }
      if (/^-?[\d.]+(?:px|em|rem|vw|vh)$/i.test(token)) return undefined
      colorTokens.push(token)
    }
    const color = colorTokens.join(' ')
    if (!color) return undefined
    parsed.push({ color, ...(position === undefined ? {} : { position }) })
  }
  const stops = withResolvedPositions(parsed)
  return stops.length ? stops : undefined
}

/** 생략된 stop 위치를 CSS 규칙대로 채운다 — 양 끝은 0/1, 사이는 균등 분배 후 단조 증가 보정. */
function withResolvedPositions(
  stops: { color: string; position?: number }[],
): { color: string; position: number }[] {
  const count = stops.length
  if (count === 0) return []
  const positions = stops.map((stop) => (stop.position === undefined ? undefined : clamp01(stop.position)))
  positions[0] ??= 0
  positions[count - 1] ??= count === 1 ? 0 : 1
  for (let index = 1; index < count - 1; index += 1) {
    if (positions[index] !== undefined) continue
    let next = index + 1
    while (next < count && positions[next] === undefined) next += 1
    const start = positions[index - 1] as number
    const end = positions[Math.min(next, count - 1)] as number
    const steps = Math.min(next, count - 1) - (index - 1)
    for (let fill = index; fill < Math.min(next, count - 1); fill += 1) {
      positions[fill] = start + ((end - start) * (fill - index + 1)) / steps
    }
    index = next - 1
  }
  let previous = 0
  return stops.map((stop, index) => {
    const position = roundPosition(Math.max(previous, positions[index] as number))
    previous = position
    return { color: stop.color, position }
  })
}

function parseAngle(token: string): number | undefined {
  const match = ANGLE_RE.exec(token.trim())
  if (!match) return undefined
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value)) return undefined
  switch ((match[2] ?? 'deg').toLowerCase()) {
    case 'grad': return value * 0.9
    case 'rad': return (value * 180) / Math.PI
    case 'turn': return value * 360
    default: return value
  }
}

/** 괄호 안(rgb()/color-mix() 등)을 건너뛰며 구분자로 자른다. 괄호가 안 맞으면 빈 배열. */
function splitOutsideParens(value: string, separator: ',' | ' '): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of value) {
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    if (depth < 0) return []
    const isSeparator = depth === 0 && (separator === ',' ? character === ',' : /\s/.test(character))
    if (isSeparator) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (depth !== 0) return []
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

function parseColorChannel(part: string): number | undefined {
  const value = part.endsWith('%')
    ? (Number.parseFloat(part) / 100) * 255
    : Number.parseFloat(part)
  return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : undefined
}

function parseAlphaChannel(part: string): number {
  const value = part.endsWith('%') ? Number.parseFloat(part) / 100 : Number.parseFloat(part)
  return Number.isFinite(value) ? clamp01(value) : 1
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function roundPosition(value: number): number {
  return Math.round(value * 10000) / 10000
}

export function colorWithAlpha(color: string, alpha = 1): string {
  if (alpha >= 1) return color
  const hex = color.trim()
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex
  const match = /^#([0-9a-f]{6})$/i.exec(normalized)
  if (!match) return color
  const value = match[1]
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`
}
