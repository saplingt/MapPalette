import type { ColorOccurrence, ColorSite } from './colors'
import { normalizeColorKey, parseCssColor } from './colors'

/** 相對亮度（0 深 → 1 淺），供同色清單排序。 */
function relativeLuminance(color: string): number {
  const { r, g, b } = parseCssColor(color)
  const toLinear = (channel: number) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export type PaletteCategoryId =
  | 'background'
  | 'land'
  | 'water'
  | 'building'
  | 'road'
  | 'boundary'
  | 'text'
  | 'other'

export interface PaletteCategory {
  id: PaletteCategoryId
  label: string
}

/** 顯示順序（地圖由底到面的大致語意）。 */
export const PALETTE_CATEGORIES: PaletteCategory[] = [
  { id: 'background', label: '背景' },
  { id: 'land', label: '土地／綠地' },
  { id: 'water', label: '水域' },
  { id: 'building', label: '建築' },
  { id: 'road', label: '道路／軌道' },
  { id: 'boundary', label: '邊界' },
  { id: 'text', label: '文字／標籤' },
  { id: 'other', label: '其他' },
]

const CATEGORY_PRIORITY: Record<PaletteCategoryId, number> = {
  text: 0,
  water: 1,
  road: 2,
  building: 3,
  land: 4,
  boundary: 5,
  background: 6,
  other: 7,
}

/** 依單一 layer id 推斷類別。 */
export function categorizeLayerId(layerId: string): PaletteCategoryId {
  const id = layerId.toLowerCase()

  if (id === 'background' || id.startsWith('background')) return 'background'

  // 標籤／路名／盾牌優先於道路本體
  if (
    /(?:^|[_-])(?:label|place|poi)(?:[_-]|$)/.test(id) ||
    /(?:name|shield|label)/.test(id) ||
    id === 'airport'
  ) {
    return 'text'
  }

  if (/water|waterway|ferry/.test(id)) return 'water'

  if (
    /highway|road|tunnel|bridge|railway|aerow|pier|cablecar|oneway/.test(id)
  ) {
    return 'road'
  }

  if (/building/.test(id)) return 'building'

  if (/park|landcover|landuse/.test(id)) return 'land'

  if (/boundary/.test(id)) return 'boundary'

  return 'other'
}

/** 依屬性鍵補充分類（無明確 layer 語意時）。 */
function categorizeByProperties(properties: string[]): PaletteCategoryId | null {
  const joined = properties.join(' ')
  if (/text-color|text-halo|icon-color|icon-halo/.test(joined)) return 'text'
  if (/background-color/.test(joined)) return 'background'
  if (/line-color/.test(joined)) return 'road'
  if (/fill-color|fill-outline/.test(joined)) return 'land'
  return null
}

/**
 * 為一筆色彩選主類別：各 layer 投票，平手時取較具體的類別。
 */
export function categorizeColor(item: ColorOccurrence): PaletteCategoryId {
  const votes = new Map<PaletteCategoryId, number>()

  for (const layerId of item.layers) {
    const cat = categorizeLayerId(layerId)
    votes.set(cat, (votes.get(cat) ?? 0) + 1)
  }

  if (votes.size === 0) {
    return categorizeByProperties(item.properties) ?? 'other'
  }

  let best: PaletteCategoryId = 'other'
  let bestCount = -1
  for (const [cat, count] of votes) {
    if (
      count > bestCount ||
      (count === bestCount && CATEGORY_PRIORITY[cat] < CATEGORY_PRIORITY[best])
    ) {
      best = cat
      bestCount = count
    }
  }

  // 若全是 other，再試屬性推斷
  if (best === 'other') {
    return categorizeByProperties(item.properties) ?? 'other'
  }

  return best
}

export interface PaletteGroup {
  id: PaletteCategoryId
  label: string
  items: ColorOccurrence[]
}

/** 將色票依類別分組；空類別不回傳。 */
export function groupPaletteByCategory(
  palette: ColorOccurrence[],
): PaletteGroup[] {
  const buckets = new Map<PaletteCategoryId, ColorOccurrence[]>()
  for (const cat of PALETTE_CATEGORIES) {
    buckets.set(cat.id, [])
  }

  for (const item of palette) {
    const cat = categorizeColor(item)
    buckets.get(cat)!.push(item)
  }

  return PALETTE_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    items: buckets.get(cat.id) ?? [],
  })).filter((g) => g.items.length > 0)
}

export type PaletteGroupMode = 'category' | 'same-color' | 'fine'

export interface FineTuneGroup {
  id: PaletteCategoryId
  label: string
  items: ColorSite[]
}

/** 逐項：先依類別，類內再依目前色深淺（深→淺）。 */
export function groupSitesForFineTune(
  sites: ColorSite[],
  getCurrent: (site: ColorSite) => string,
): FineTuneGroup[] {
  const buckets = new Map<PaletteCategoryId, ColorSite[]>()
  for (const cat of PALETTE_CATEGORIES) buckets.set(cat.id, [])

  for (const site of sites) {
    const cat = categorizeLayerId(site.layerId)
    const resolved =
      cat === 'other'
        ? (categorizeByProperties([site.property]) ?? 'other')
        : cat
    buckets.get(resolved)!.push(site)
  }

  return PALETTE_CATEGORIES.map((cat) => {
    const items = [...(buckets.get(cat.id) ?? [])].sort((a, b) => {
      const ca = getCurrent(a)
      const cb = getCurrent(b)
      const diff = relativeLuminance(ca) - relativeLuminance(cb)
      if (diff !== 0) return diff
      const layerCmp = a.layerId.localeCompare(b.layerId)
      if (layerCmp !== 0) return layerCmp
      return a.property.localeCompare(b.property)
    })
    return { id: cat.id, label: cat.label, items }
  }).filter((g) => g.items.length > 0)
}

export interface SameColorGroup {
  /** 目前色的歸一鍵 */
  id: string
  /** 代表用的目前色字串（組內出現最多者） */
  current: string
  items: ColorOccurrence[]
  count: number
  layers: string[]
  /** 目前實際不同的色碼字串數（寫法不同但色相同會 > 1；對齊後變 1） */
  writings: number
}

/**
 * 依「目前」視覺相同顏色分組（含 remap 後結果）。
 * 改一筆會一次套用到目前同色的所有底稿色碼。
 */
export function groupPaletteBySameColor(
  palette: ColorOccurrence[],
  remap: Record<string, string> = {},
): SameColorGroup[] {
  const buckets = new Map<string, ColorOccurrence[]>()
  for (const item of palette) {
    const current = remap[item.color] ?? item.color
    const key = normalizeColorKey(current)
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }

  return [...buckets.entries()]
    .map(([id, items]) => {
      const layers = new Set<string>()
      const writingCounts = new Map<string, number>()
      let count = 0
      for (const item of items) {
        const current = remap[item.color] ?? item.color
        count += item.count
        writingCounts.set(current, (writingCounts.get(current) ?? 0) + item.count)
        for (const layer of item.layers) layers.add(layer)
      }
      items.sort((a, b) => a.color.localeCompare(b.color))

      let current = remap[items[0].color] ?? items[0].color
      let best = -1
      for (const [writing, n] of writingCounts) {
        if (n > best) {
          best = n
          current = writing
        }
      }

      return {
        id,
        current,
        items,
        count,
        layers: [...layers].sort(),
        writings: writingCounts.size,
      }
    })
    .sort((a, b) => {
      // 深 → 淺；同亮度再比色鍵
      const diff = relativeLuminance(a.id) - relativeLuminance(b.id)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
}
