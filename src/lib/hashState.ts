import type { StyleId } from './styles'

export interface AppHashState {
  styleId: StyleId
  /** 自訂樣式名稱（下載檔名／style.name） */
  styleName: string
  /** 官方原始色字串 → 目前重映射後的色 */
  remap: Record<string, string>
}

const VALID_STYLES = new Set<StyleId>(['positron', 'bright', 'dark'])

export function parseHash(hash: string): Partial<AppHashState> | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null

  try {
    // 優先解析 `#` 後的精簡 JSON（URL 編碼）
    if (raw.startsWith('{') || raw.startsWith('%7B') || raw.startsWith('%7b')) {
      const json = decodeURIComponent(raw)
      const data = JSON.parse(json) as {
        s?: string
        n?: string
        r?: Record<string, string>
      }
      const styleId = (data.s as StyleId) || undefined
      return {
        styleId: styleId && VALID_STYLES.has(styleId) ? styleId : undefined,
        styleName: typeof data.n === 'string' ? data.n : undefined,
        remap: data.r && typeof data.r === 'object' ? data.r : {},
      }
    }

    // 後備格式：style=positron&r=...
    const params = new URLSearchParams(raw)
    const styleParam = params.get('style') as StyleId | null
    const styleId =
      styleParam && VALID_STYLES.has(styleParam) ? styleParam : undefined
    const styleName = params.get('name') ?? undefined
    let remap: Record<string, string> = {}
    const r = params.get('r')
    if (r) {
      try {
        remap = JSON.parse(decodeURIComponent(r)) as Record<string, string>
      } catch {
        try {
          remap = JSON.parse(atob(r.replace(/-/g, '+').replace(/_/g, '/'))) as Record<
            string,
            string
          >
        } catch {
          remap = {}
        }
      }
    }
    return { styleId, styleName, remap }
  } catch {
    return null
  }
}

export function serializeHash(state: AppHashState): string {
  const payload: { s: StyleId; n?: string; r: Record<string, string> } = {
    s: state.styleId,
    r: Object.fromEntries(
      Object.entries(state.remap).filter(([from, to]) => from !== to),
    ),
  }
  const name = state.styleName.trim()
  if (name && name !== state.styleId) {
    payload.n = name
  }
  return '#' + encodeURIComponent(JSON.stringify(payload))
}

export function writeHash(state: AppHashState): void {
  const next = serializeHash(state)
  if (window.location.hash === next) return
  // 用 replaceState，避免拖曳取色時灌爆瀏覽歷史
  const url = `${window.location.pathname}${window.location.search}${next}`
  window.history.replaceState(null, '', url)
}
