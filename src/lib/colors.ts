/**
 * 從 Mapbox／MapLibre style 的 paint、layout 屬性擷取色彩字串 literal，
 * 含巢狀 style expression 內的色碼。
 */

import type { StyleSpecification } from 'maplibre-gl'

/** MapLibre 樣式中常見的色彩屬性鍵名。 */
const KNOWN_COLOR_KEYS = new Set([
  'background-color',
  'fill-color',
  'fill-outline-color',
  'fill-extrusion-color',
  'fill-extrusion-ambient-occlusion-color',
  'line-color',
  'line-gradient',
  'circle-color',
  'circle-stroke-color',
  'heatmap-color',
  'icon-color',
  'icon-halo-color',
  'text-color',
  'text-halo-color',
  'raster-color',
  'hillshade-shadow-color',
  'hillshade-highlight-color',
  'hillshade-accent-color',
  'sky-color',
  'sky-horizon-color',
  'sky-atmosphere-color',
  'sky-atmosphere-halo-color',
])

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(\s*[^)]+\)$/i

/** 樣式中偶見的 CSS 具名色彩（精簡子集）。 */
const NAMED_COLORS = new Set(
  [
    'transparent',
    'black',
    'white',
    'red',
    'green',
    'blue',
    'yellow',
    'cyan',
    'magenta',
    'gray',
    'grey',
    'orange',
    'purple',
    'pink',
    'brown',
    'navy',
    'teal',
    'olive',
    'maroon',
    'silver',
    'lime',
    'aqua',
    'fuchsia',
  ].map((c) => c.toLowerCase()),
)

export function isColorString(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (HEX_RE.test(v)) return true
  if (FUNC_RE.test(v)) return true
  if (NAMED_COLORS.has(v.toLowerCase())) return true
  return false
}

export function isColorPropertyKey(key: string): boolean {
  if (KNOWN_COLOR_KEYS.has(key)) return true
  // 捕捉未來的 *-color 鍵；略過 opacity／width 等非色彩屬性
  if (key.endsWith('-color') || key === 'color') return true
  if (key === 'line-gradient') return true
  return false
}

/** 遞迴收集 paint／layout 值或 expression 中的色彩字串 literal。 */
export function extractColorsFromValue(value: unknown, out: Set<string>): void {
  if (value == null) return

  if (typeof value === 'string') {
    if (isColorString(value)) {
      out.add(value.trim())
    }
    return
  }

  if (Array.isArray(value)) {
    // Style expression：走訪每個元素（運算子、stops、巢狀陣列）
    for (const item of value) {
      extractColorsFromValue(item, out)
    }
    return
  }

  if (typeof value === 'object') {
    // 少數情況：屬性物件
    for (const v of Object.values(value as Record<string, unknown>)) {
      extractColorsFromValue(v, out)
    }
  }
}

export interface ColorOccurrence {
  color: string
  count: number
  properties: string[]
  layers: string[]
}

/** 逐項用：單一用色位置（layer × 屬性 × 出現序）。 */
export interface ColorSite {
  id: string
  color: string
  layerId: string
  property: string
}

export function makeColorSiteId(
  layerId: string,
  property: string,
  index: number,
): string {
  return `${encodeURIComponent(layerId)}|${property}|${index}`
}

/** 與 extract／apply 共用的 DFS 色碼走訪順序。 */
function forEachColorLiteral(
  value: unknown,
  visit: (color: string, index: number) => void,
  state: { i: number } = { i: 0 },
): void {
  if (value == null) return
  if (typeof value === 'string') {
    if (isColorString(value)) visit(value.trim(), state.i++)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) forEachColorLiteral(item, visit, state)
    return
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      forEachColorLiteral(v, visit, state)
    }
  }
}

function mapColorLiterals(
  value: unknown,
  mapOne: (color: string, index: number) => string,
  state: { i: number } = { i: 0 },
): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    if (isColorString(value)) {
      const trimmed = value.trim()
      const index = state.i++
      return mapOne(trimmed, index)
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapColorLiterals(item, mapOne, state))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = mapColorLiterals(v, mapOne, state)
    }
    return out
  }
  return value
}

function collectStyleColorTargets(
  style: StyleSpecification,
): Array<{ layerId: string; property: string; value: unknown }> {
  const targets: Array<{ layerId: string; property: string; value: unknown }> =
    []

  for (const layer of style.layers ?? []) {
    const layerId = layer.id
    for (const section of ['paint', 'layout'] as const) {
      const bag = (layer as Record<string, unknown>)[section] as
        | Record<string, unknown>
        | undefined
      if (!bag) continue
      for (const [key, val] of Object.entries(bag)) {
        if (!isColorPropertyKey(key)) continue
        targets.push({
          layerId,
          property: `${section}.${key}`,
          value: val,
        })
      }
    }
  }

  const extras: Array<[string, unknown]> = []
  if ('fog' in style && style.fog) extras.push(['fog', style.fog])
  if ('light' in style && (style as { light?: unknown }).light) {
    extras.push(['light', (style as { light?: unknown }).light])
  }
  for (const [label, obj] of extras) {
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (!isColorPropertyKey(k) && !String(k).includes('color')) continue
        targets.push({ layerId: label, property: `${label}.${k}`, value: v })
      }
    }
  }

  return targets
}

export function extractPaletteFromStyle(
  style: StyleSpecification,
): ColorOccurrence[] {
  const counts = new Map<
    string,
    { count: number; properties: Set<string>; layers: Set<string> }
  >()

  const bump = (color: string, prop: string, layerId: string) => {
    let entry = counts.get(color)
    if (!entry) {
      entry = { count: 0, properties: new Set(), layers: new Set() }
      counts.set(color, entry)
    }
    entry.count += 1
    entry.properties.add(prop)
    entry.layers.add(layerId)
  }

  for (const target of collectStyleColorTargets(style)) {
    forEachColorLiteral(target.value, (color) => {
      bump(color, target.property, target.layerId)
    })
  }

  return [...counts.entries()]
    .map(([color, meta]) => ({
      color,
      count: meta.count,
      properties: [...meta.properties].sort(),
      layers: [...meta.layers].sort(),
    }))
    .sort((a, b) => a.color.localeCompare(b.color))
}

/** 拆成每一處用色，供逐項個別改色。 */
export function extractColorSitesFromStyle(
  style: StyleSpecification,
): ColorSite[] {
  const sites: ColorSite[] = []
  for (const target of collectStyleColorTargets(style)) {
    forEachColorLiteral(target.value, (color, index) => {
      sites.push({
        id: makeColorSiteId(target.layerId, target.property, index),
        color,
        layerId: target.layerId,
        property: target.property,
      })
    })
  }
  return sites
}

/**
 * 依 remap（鍵＝官方原始色字串）深度走訪並替換完全相符的色彩字串 literal。
 */
export function remapColorsInValue(
  value: unknown,
  remap: Record<string, string>,
): unknown {
  return mapColorLiterals(value, (color) => {
    if (Object.prototype.hasOwnProperty.call(remap, color)) return remap[color]
    return color
  })
}

/**
 * 套用全域色 remap，以及逐項用的位置 remap（位置優先）。
 */
export function applyColorRemap(
  style: StyleSpecification,
  remap: Record<string, string>,
  siteRemap: Record<string, string> = {},
): StyleSpecification {
  const activeColor = Object.fromEntries(
    Object.entries(remap).filter(
      ([from, to]) => from !== to && to != null && to !== '',
    ),
  )
  const activeSite = Object.fromEntries(
    Object.entries(siteRemap).filter(
      ([, to]) => to != null && to !== '',
    ),
  )
  if (
    Object.keys(activeColor).length === 0 &&
    Object.keys(activeSite).length === 0
  ) {
    return structuredClone(style)
  }

  const next = structuredClone(style)

  next.layers = (next.layers ?? []).map((layer) => {
    const copy = { ...layer } as Record<string, unknown>
    for (const section of ['paint', 'layout'] as const) {
      const bag = copy[section] as Record<string, unknown> | undefined
      if (!bag) continue
      const rewritten: Record<string, unknown> = { ...bag }
      let changed = false
      for (const [key, val] of Object.entries(bag)) {
        if (!isColorPropertyKey(key)) continue
        const propPath = `${section}.${key}`
        rewritten[key] = mapColorLiterals(val, (color, index) => {
          const siteId = makeColorSiteId(layer.id, propPath, index)
          if (Object.prototype.hasOwnProperty.call(activeSite, siteId)) {
            return activeSite[siteId]
          }
          if (Object.prototype.hasOwnProperty.call(activeColor, color)) {
            return activeColor[color]
          }
          return color
        })
        changed = true
      }
      if (changed) copy[section] = rewritten
    }
    return copy as (typeof next.layers extends (infer L)[] | undefined ? L : never)
  })

  // fog / light
  for (const label of ['fog', 'light'] as const) {
    const obj = (next as Record<string, unknown>)[label]
    if (!obj || typeof obj !== 'object') continue
    const bag = { ...(obj as Record<string, unknown>) }
    let changed = false
    for (const [key, val] of Object.entries(bag)) {
      if (!isColorPropertyKey(key) && !String(key).includes('color')) continue
      const propPath = `${label}.${key}`
      bag[key] = mapColorLiterals(val, (color, index) => {
        const siteId = makeColorSiteId(label, propPath, index)
        if (Object.prototype.hasOwnProperty.call(activeSite, siteId)) {
          return activeSite[siteId]
        }
        if (Object.prototype.hasOwnProperty.call(activeColor, color)) {
          return activeColor[color]
        }
        return color
      })
      changed = true
    }
    if (changed) (next as Record<string, unknown>)[label] = bag
  }

  return next
}

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function clampAlpha(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

function hexByte(n: number): string {
  return clampByte(n).toString(16).padStart(2, '0')
}

function parseHexColor(c: string): RgbaColor | null {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) {
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
      a: 1,
    }
  }
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const r = c[1],
      g = c[2],
      b = c[3]
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
      a: 1,
    }
  }
  if (/^#[0-9a-fA-F]{8}$/.test(c)) {
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
      a: parseInt(c.slice(7, 9), 16) / 255,
    }
  }
  if (/^#[0-9a-fA-F]{4}$/.test(c)) {
    const r = c[1],
      g = c[2],
      b = c[3],
      a = c[4]
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
      a: parseInt(a + a, 16) / 255,
    }
  }
  return null
}

function parseRgbFunc(c: string): RgbaColor | null {
  const m = c.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i,
  )
  if (!m) return null
  let a = 1
  if (m[4] != null) {
    a = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
  }
  return {
    r: clampByte(Number(m[1])),
    g: clampByte(Number(m[2])),
    b: clampByte(Number(m[3])),
    a: clampAlpha(a),
  }
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t
  if (x < 0) x += 1
  if (x > 1) x -= 1
  if (x < 1 / 6) return p + (q - p) * 6 * x
  if (x < 1 / 2) return q
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
  return p
}

function hslToRgba(h: number, s: number, l: number, a: number): RgbaColor {
  const hh = ((h % 360) + 360) % 360 / 360
  const ss = clampAlpha(s / 100)
  const ll = clampAlpha(l / 100)
  if (ss === 0) {
    const v = clampByte(ll * 255)
    return { r: v, g: v, b: v, a: clampAlpha(a) }
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  return {
    r: clampByte(hueToRgb(p, q, hh + 1 / 3) * 255),
    g: clampByte(hueToRgb(p, q, hh) * 255),
    b: clampByte(hueToRgb(p, q, hh - 1 / 3) * 255),
    a: clampAlpha(a),
  }
}

function parseHslFunc(c: string): RgbaColor | null {
  const m = c.match(
    /^hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i,
  )
  if (!m) return null
  let a = 1
  if (m[4] != null) {
    a = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
  }
  return hslToRgba(Number(m[1]), Number(m[2]), Number(m[3]), a)
}

/** 解析 CSS 色字串為 RGBA（含 alpha）。 */
export function parseCssColor(color: string): RgbaColor {
  const c = color.trim()
  if (!c) return { r: 128, g: 128, b: 128, a: 1 }
  if (c.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  const hex = parseHexColor(c)
  if (hex) return hex

  const rgb = parseRgbFunc(c)
  if (rgb) return rgb

  const hsl = parseHslFunc(c)
  if (hsl) return hsl

  // 具名色等：用 canvas 取 RGB（通常不含可靠 alpha）
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      const computed = String(ctx.fillStyle)
      const fromHex = parseHexColor(computed)
      if (fromHex) return fromHex
      const fromRgb = parseRgbFunc(computed)
      if (fromRgb) return fromRgb
    }
  } catch {
    /* 忽略 */
  }

  return { r: 128, g: 128, b: 128, a: 1 }
}

function formatAlphaNumber(a: number): string {
  const alpha = clampAlpha(a)
  return Math.round(alpha * 1000) % 10 === 0
    ? (Math.round(alpha * 100) / 100).toString()
    : (Math.round(alpha * 1000) / 1000).toString()
}

/** 輸出 style 用色字串：不透明用 #rrggbb，否則 rgba()。 */
export function formatCssColor(color: RgbaColor): string {
  const r = clampByte(color.r)
  const g = clampByte(color.g)
  const b = clampByte(color.b)
  const a = clampAlpha(color.a)
  if (a >= 0.999) return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`
  return `rgba(${r}, ${g}, ${b}, ${formatAlphaNumber(a)})`
}

/** react-colorful 用的 rgba(...) 字串（含不透明）。 */
export function toRgbaString(color: string): string {
  const { r, g, b, a } = parseCssColor(color)
  return `rgba(${r}, ${g}, ${b}, ${formatAlphaNumber(a)})`
}

/** 色碼輸入欄顯示／還原用：#rrggbb 或 #rrggbbaa。 */
export function formatHexForInput(color: string): string {
  const { r, g, b, a } = parseCssColor(color)
  const rgb = `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`
  if (a >= 0.999) return rgb
  return `${rgb}${hexByte(a * 255)}`
}

/** 視覺相同顏色的歸一鍵（小寫 #rrggbb / #rrggbbaa），供同色分組。 */
export function normalizeColorKey(color: string): string {
  return formatHexForInput(color).toLowerCase()
}

/** 將 CSS 色字串轉成 `<input type="color">` 可用的 `#rrggbb`。 */
export function toHexForPicker(color: string): string {
  const { r, g, b } = parseCssColor(color)
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`
}

/**
 * 清單顯示用：
 * - 不透明 → #rrggbb(r, g, b)
 * - 有透明度 → #rrggbbaa(r, g, b, a)
 */
export function formatRgbLabel(color: string): string {
  const { r, g, b, a } = parseCssColor(color)
  const hex = formatHexForInput(color)
  if (a >= 0.999) return `${hex}(${r}, ${g}, ${b})`
  return `${hex}(${r}, ${g}, ${b}, ${formatAlphaNumber(a)})`
}

/** 編輯面板用：已有 hex 輸入時改顯示 rgb / rgba。 */
export function formatCssRgb(color: string): string {
  const { r, g, b, a } = parseCssColor(color)
  if (a >= 0.999) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${formatAlphaNumber(a)})`
}

/** 是否具有半透明（alpha < 1）。 */
export function hasTransparency(color: string): boolean {
  return parseCssColor(color).a < 0.999
}

/** 0–100 的不透明度百分比。 */
export function getOpacityPercent(color: string): number {
  return Math.round(parseCssColor(color).a * 100)
}

/** 保留目前 alpha，套用取色器的 #rrggbb。 */
export function withPickerHex(currentColor: string, hex: string): string {
  const prev = parseCssColor(currentColor)
  const next = parseHexColor(hex.trim()) ?? parseCssColor(hex)
  return formatCssColor({ ...next, a: prev.a })
}

/** 保留目前 RGB，套用 0–100 不透明度。 */
export function withOpacityPercent(currentColor: string, percent: number): string {
  const prev = parseCssColor(currentColor)
  return formatCssColor({
    ...prev,
    a: clampAlpha(percent / 100),
  })
}
