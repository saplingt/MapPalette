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

export function extractPaletteFromStyle(
  style: StyleSpecification,
): ColorOccurrence[] {
  const counts = new Map<string, { count: number; properties: Set<string>; layers: Set<string> }>()

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

  for (const layer of style.layers ?? []) {
    const layerId = layer.id
    for (const section of ['paint', 'layout'] as const) {
      const bag = (layer as Record<string, unknown>)[section] as
        | Record<string, unknown>
        | undefined
      if (!bag) continue
      for (const [key, val] of Object.entries(bag)) {
        if (!isColorPropertyKey(key)) continue
        const found = new Set<string>()
        extractColorsFromValue(val, found)
        for (const c of found) {
          bump(c, `${section}.${key}`, layerId)
        }
      }
    }
  }

  // 一併掃描根層 light／fog（若存在，預留擴充）
  const extras: Array<[string, unknown]> = []
  if ('fog' in style && style.fog) extras.push(['fog', style.fog])
  if ('light' in style && (style as { light?: unknown }).light) {
    extras.push(['light', (style as { light?: unknown }).light])
  }
  for (const [label, obj] of extras) {
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (!isColorPropertyKey(k) && !String(k).includes('color')) continue
        const found = new Set<string>()
        extractColorsFromValue(v, found)
        for (const c of found) bump(c, label + '.' + k, label)
      }
    }
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

/**
 * 依 remap（鍵＝官方原始色字串）深度走訪並替換完全相符的色彩字串 literal。
 */
export function remapColorsInValue(
  value: unknown,
  remap: Record<string, string>,
): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (Object.prototype.hasOwnProperty.call(remap, trimmed)) {
      return remap[trimmed]
    }
    if (Object.prototype.hasOwnProperty.call(remap, value)) {
      return remap[value]
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapColorsInValue(item, remap))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = remapColorsInValue(v, remap)
    }
    return out
  }
  return value
}

/** 將「原始色 → 目前色」套用到所有含色彩的 layer 屬性。 */
export function applyColorRemap(
  style: StyleSpecification,
  remap: Record<string, string>,
): StyleSpecification {
  const active = Object.fromEntries(
    Object.entries(remap).filter(([from, to]) => from !== to && to != null && to !== ''),
  )
  if (Object.keys(active).length === 0) {
    return structuredClone(style)
  }

  const next = structuredClone(style)
  next.layers = (next.layers ?? []).map((layer) => {
    const copy = { ...layer } as Record<string, unknown>
    for (const section of ['paint', 'layout'] as const) {
      const bag = copy[section] as Record<string, unknown> | undefined
      if (!bag) continue
      const remapped: Record<string, unknown> = { ...bag }
      let changed = false
      for (const [key, val] of Object.entries(bag)) {
        if (!isColorPropertyKey(key)) continue
        remapped[key] = remapColorsInValue(val, active)
        changed = true
      }
      if (changed) copy[section] = remapped
    }
    return copy as (typeof next.layers extends (infer L)[] | undefined ? L : never)
  })

  return next
}

/** 將 CSS 色字串轉成 `<input type="color">` 可用的 `#rrggbb`（盡力而為）。 */
export function toHexForPicker(color: string): string {
  const c = color.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const [, r, g, b] = c
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return `#${c.slice(1, 7)}`.toLowerCase()
  if (/^#[0-9a-fA-F]{4}$/.test(c)) {
    const r = c[1],
      g = c[2],
      b = c[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return '#808080'
    ctx.fillStyle = '#000'
    ctx.fillStyle = c
    const computed = ctx.fillStyle
    if (/^#[0-9a-fA-F]{6}$/i.test(computed)) return computed.toLowerCase()
    // 瀏覽器可能回傳 rgb(r, g, b)
    const m = computed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
    if (m) {
      const hex = (n: string) =>
        Math.max(0, Math.min(255, Math.round(Number(n))))
          .toString(16)
          .padStart(2, '0')
      return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
    }
  } catch {
    /* 忽略解析失敗 */
  }
  return '#808080'
}
