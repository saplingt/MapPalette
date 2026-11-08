import { isColorString } from './colors'
import type { StyleId } from './styles'

export interface AppHashState {
  styleId: StyleId
  /** 自訂樣式名稱（下載檔名／style.name） */
  styleName: string
  /** 官方原始色字串 → 目前重映射後的色 */
  remap: Record<string, string>
}

const VALID_STYLES = new Set<StyleId>(['positron', 'bright', 'dark'])

/** 防止惡意／過大 hash 拖垮解析 */
const MAX_HASH_CHARS = 50_000
const MAX_REMAP_ENTRIES = 256
const MAX_STYLE_NAME_LENGTH = 80

export function sanitizeStyleName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, MAX_STYLE_NAME_LENGTH)
  return trimmed || undefined
}

/**
 * 只接受「色彩字串 → 色彩字串」的純物件；丟棄陣列、非字串、非法色碼。
 */
export function sanitizeRemap(value: unknown): Record<string, string> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const out: Record<string, string> = {}
  for (const [fromRaw, toRaw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_REMAP_ENTRIES) break
    if (typeof fromRaw !== 'string' || typeof toRaw !== 'string') continue
    const from = fromRaw.trim()
    const to = toRaw.trim()
    if (!from || !to) continue
    if (!isColorString(from) || !isColorString(to)) continue
    out[from] = to
  }
  return out
}

function parseRemapJson(raw: string): Record<string, string> {
  try {
    return sanitizeRemap(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function parseHash(hash: string): Partial<AppHashState> | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null
  if (raw.length > MAX_HASH_CHARS) return null

  try {
    // 優先解析 `#` 後的精簡 JSON（URL 編碼）
    if (raw.startsWith('{') || raw.startsWith('%7B') || raw.startsWith('%7b')) {
      const json = decodeURIComponent(raw)
      if (json.length > MAX_HASH_CHARS) return null
      const data = JSON.parse(json) as {
        s?: string
        n?: string
        r?: unknown
      }
      const styleId = (data.s as StyleId) || undefined
      return {
        styleId: styleId && VALID_STYLES.has(styleId) ? styleId : undefined,
        styleName: sanitizeStyleName(data.n),
        remap: sanitizeRemap(data.r),
      }
    }

    // 後備格式：style=positron&r=...
    const params = new URLSearchParams(raw)
    const styleParam = params.get('style') as StyleId | null
    const styleId =
      styleParam && VALID_STYLES.has(styleParam) ? styleParam : undefined
    const styleName = sanitizeStyleName(params.get('name'))
    let remap: Record<string, string> = {}
    const r = params.get('r')
    if (r) {
      try {
        remap = parseRemapJson(decodeURIComponent(r))
      } catch {
        try {
          remap = parseRemapJson(atob(r.replace(/-/g, '+').replace(/_/g, '/')))
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
  const remap = sanitizeRemap(state.remap)
  const payload: { s: StyleId; n?: string; r: Record<string, string> } = {
    s: state.styleId,
    r: Object.fromEntries(
      Object.entries(remap).filter(([from, to]) => from !== to),
    ),
  }
  const name = sanitizeStyleName(state.styleName)
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
