import type { StyleSpecification } from 'maplibre-gl'

export type StyleId = 'positron' | 'bright' | 'liberty' | 'dark' | 'fiord'

export interface OfficialStyle {
  id: StyleId
  label: string
  labelEn: string
  url: string
}

/** OpenFreeMap 官方樣式（順序與官網一致；URL 直接回傳 JSON，`/style.json` 會 404）。 */
export const OFFICIAL_STYLES: OfficialStyle[] = [
  {
    id: 'positron',
    label: 'Positron',
    labelEn: 'Positron',
    url: 'https://tiles.openfreemap.org/styles/positron',
  },
  {
    id: 'bright',
    label: 'Bright',
    labelEn: 'Bright',
    url: 'https://tiles.openfreemap.org/styles/bright',
  },
  {
    id: 'liberty',
    label: 'Liberty',
    labelEn: 'Liberty',
    url: 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'dark',
    label: 'Dark',
    labelEn: 'Dark',
    url: 'https://tiles.openfreemap.org/styles/dark',
  },
  {
    id: 'fiord',
    label: 'Fiord',
    labelEn: 'Fiord',
    url: 'https://tiles.openfreemap.org/styles/fiord',
  },
]

export function getStyleById(id: string): OfficialStyle {
  return OFFICIAL_STYLES.find((s) => s.id === id) ?? OFFICIAL_STYLES[0]
}

export async function fetchOfficialStyle(id: StyleId): Promise<StyleSpecification> {
  const style = getStyleById(id)
  const res = await fetch(style.url)
  if (!res.ok) {
    throw new Error(`無法載入樣式 ${style.label}（HTTP ${res.status}）`)
  }
  return (await res.json()) as StyleSpecification
}
