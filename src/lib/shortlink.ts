/**
 * 短網址 API 客戶端。
 * 僅在使用者按下「分享網址」時呼叫；以目前長網址（含 hash／色票狀態）送出，
 * 由 Worker 做內容 hash 去重（無重複建新碼、有重複重用）。失敗回傳 null。
 */

export interface ShortlinkResult {
  id: string
  shortUrl: string
  url: string
  /** Worker 是否重用既有短碼 */
  reused: boolean
}

function apiBase(): string | null {
  const raw = import.meta.env.VITE_SHORTLINK_API as string | undefined
  if (!raw || !String(raw).trim()) return null
  return String(raw).replace(/\/+$/, '')
}

/** 是否已設定短網址 API（未設定則分享流程直接用長網址） */
export function isShortlinkConfigured(): boolean {
  return apiBase() != null
}

/**
 * 以目前要分享的長網址建立或重用短碼。
 * 不要預先批次呼叫；每次分享點擊再打一次即可。
 */
export async function createShortlink(longUrl: string): Promise<ShortlinkResult | null> {
  const base = apiBase()
  if (!base) return null

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(`${base}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: longUrl }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<ShortlinkResult>
    if (!data.shortUrl || typeof data.shortUrl !== 'string') return null
    return {
      id: String(data.id || ''),
      shortUrl: data.shortUrl,
      url: String(data.url || longUrl),
      reused: Boolean(data.reused),
    }
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}
