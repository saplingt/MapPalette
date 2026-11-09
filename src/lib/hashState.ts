import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'
import { formatHexForInput, isColorString } from './colors'
import type { StyleId } from './styles'

export interface AppHashState {
  styleId: StyleId
  /** 自訂樣式名稱（下載檔名／style.name） */
  styleName: string
  /**
   * 相對官方樣式的色彩對應 JSON（官方色 → 目前色）。
   * 不含「修改前」顏色；那份只存在瀏覽器端。
   */
  remap: Record<string, string>
}

const VALID_STYLES = new Set<StyleId>(['positron', 'bright', 'dark'])

const STYLE_TO_SHORT: Record<StyleId, string> = {
  positron: 'p',
  bright: 'b',
  dark: 'd',
}

const SHORT_TO_STYLE: Record<string, StyleId> = {
  p: 'positron',
  b: 'bright',
  d: 'dark',
  positron: 'positron',
  bright: 'bright',
  dark: 'dark',
}

/** 防止惡意／過大 hash 拖垮解析 */
const MAX_HASH_CHARS = 50_000
const MAX_REMAP_ENTRIES = 256
const MAX_STYLE_NAME_LENGTH = 80

/** 壓縮格式前綴（其後為 lz-string URI 安全字串） */
const COMPRESSED_PREFIX = 'z'

export function sanitizeStyleName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, MAX_STYLE_NAME_LENGTH)
  return trimmed || undefined
}

function resolveStyleId(value: unknown): StyleId | undefined {
  if (typeof value !== 'string') return undefined
  const id = SHORT_TO_STYLE[value.trim()]
  return id && VALID_STYLES.has(id) ? id : undefined
}

/** 網址儲存用：收成 #rrggbb / #rrggbbaa。 */
function compactColorValue(color: string): string {
  if (!isColorString(color)) return color
  try {
    return formatHexForInput(color)
  } catch {
    return color
  }
}

/**
 * 只接受「色彩字串 → 色彩字串」；支援物件或舊版 [[from, to], ...] 陣列。
 */
export function sanitizeRemap(value: unknown): Record<string, string> {
  if (value == null) return {}

  const out: Record<string, string> = {}

  const add = (fromRaw: unknown, toRaw: unknown) => {
    if (Object.keys(out).length >= MAX_REMAP_ENTRIES) return
    if (typeof fromRaw !== 'string' || typeof toRaw !== 'string') return
    const from = fromRaw.trim()
    const to = toRaw.trim()
    if (!from || !to) return
    if (!isColorString(from) || !isColorString(to)) return
    out[from] = to
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length < 2) continue
      add(entry[0], entry[1])
    }
    return out
  }

  if (typeof value !== 'object') return {}

  for (const [fromRaw, toRaw] of Object.entries(value as Record<string, unknown>)) {
    add(fromRaw, toRaw)
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

/** 網址 payload：樣式出處 + 名稱 + 色彩 JSON 物件 */
interface CompactPayload {
  s: string
  n?: string
  /** 色彩對應 JSON：官方色 → 目前色 */
  j?: Record<string, string>
  /** @deprecated 舊版陣列／物件欄位，僅解析用 */
  r?: unknown
}

function parsePayload(data: unknown): Partial<AppHashState> | null {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }
  const obj = data as CompactPayload
  return {
    styleId: resolveStyleId(obj.s),
    styleName: sanitizeStyleName(obj.n),
    remap: sanitizeRemap(obj.j ?? obj.r),
  }
}

function buildCompactPayload(state: AppHashState): CompactPayload {
  const remap = sanitizeRemap(state.remap)
  const compact: Record<string, string> = {}
  for (const [from, to] of Object.entries(remap)) {
    if (from === to) continue
    compact[from] = compactColorValue(to)
  }

  const payload: CompactPayload = {
    s: STYLE_TO_SHORT[state.styleId] ?? state.styleId,
  }
  const name = sanitizeStyleName(state.styleName)
  if (name && name !== state.styleId) {
    payload.n = name
  }
  if (Object.keys(compact).length > 0) {
    payload.j = compact
  }
  return payload
}

export function parseHash(hash: string): Partial<AppHashState> | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null
  if (raw.length > MAX_HASH_CHARS) return null

  try {
    // 壓縮格式：#z + lz-string
    if (raw.startsWith(COMPRESSED_PREFIX)) {
      const compressed = raw.slice(COMPRESSED_PREFIX.length)
      if (!compressed || compressed.length > MAX_HASH_CHARS) return null
      const json = decompressFromEncodedURIComponent(compressed)
      if (!json || json.length > MAX_HASH_CHARS) return null
      return parsePayload(JSON.parse(json))
    }

    // 舊格式：明文／URL 編碼 JSON
    if (raw.startsWith('{') || raw.startsWith('%7B') || raw.startsWith('%7b')) {
      const json = decodeURIComponent(raw)
      if (json.length > MAX_HASH_CHARS) return null
      return parsePayload(JSON.parse(json))
    }

    // 後備：style=positron&r=...
    const params = new URLSearchParams(raw)
    const styleId = resolveStyleId(params.get('style'))
    const styleName = sanitizeStyleName(params.get('name'))
    let remap: Record<string, string> = {}
    const r = params.get('r') ?? params.get('j')
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
  const json = JSON.stringify(buildCompactPayload(state))
  return '#' + COMPRESSED_PREFIX + compressToEncodedURIComponent(json)
}

export function writeHash(state: AppHashState): void {
  const next = serializeHash(state)
  if (window.location.hash === next) return
  const url = `${window.location.pathname}${window.location.search}${next}`
  window.history.replaceState(null, '', url)
}
