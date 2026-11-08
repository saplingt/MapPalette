import type { ColorOccurrence } from './colors'

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
