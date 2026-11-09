/** 改色歷史與「修改前顏色」——只存在瀏覽器端，不進分享網址。 */

export interface ColorEditSnapshot {
  remap: Record<string, string>
  /** 逐項：位置 id → 目前色 */
  siteRemap: Record<string, string>
  /** 官方色 → 修改前的顏色（同類／同色第二排） */
  previous: Record<string, string>
  /** 位置 id → 修改前的顏色（逐項第二排） */
  previousSites: Record<string, string>
}

const STORAGE_KEY = 'mappalette.editHistory.v1'
const MAX_STACK = 60

interface StoredHistory {
  styleId: string
  stack: ColorEditSnapshot[]
  index: number
}

function cloneSnapshot(s: ColorEditSnapshot): ColorEditSnapshot {
  return {
    remap: { ...s.remap },
    siteRemap: { ...s.siteRemap },
    previous: { ...s.previous },
    previousSites: { ...s.previousSites },
  }
}

function normalizeSnapshot(raw: Partial<ColorEditSnapshot> | null | undefined): ColorEditSnapshot {
  return {
    remap: { ...(raw?.remap ?? {}) },
    siteRemap: { ...(raw?.siteRemap ?? {}) },
    previous: { ...(raw?.previous ?? {}) },
    previousSites: { ...(raw?.previousSites ?? {}) },
  }
}

function emptySnapshot(): ColorEditSnapshot {
  return { remap: {}, siteRemap: {}, previous: {}, previousSites: {} }
}

function readStored(): StoredHistory | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as StoredHistory
    if (!data || typeof data !== 'object') return null
    if (typeof data.styleId !== 'string') return null
    if (!Array.isArray(data.stack) || typeof data.index !== 'number') return null
    return data
  } catch {
    return null
  }
}

function writeStored(data: StoredHistory): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // quota / private mode：忽略即可
  }
}

export function loadHistoryForStyle(styleId: string): {
  stack: ColorEditSnapshot[]
  index: number
} {
  const stored = readStored()
  if (!stored || stored.styleId !== styleId || stored.stack.length === 0) {
    return { stack: [emptySnapshot()], index: 0 }
  }
  const stack = stored.stack.map((s) => normalizeSnapshot(s))
  const index = Math.max(0, Math.min(stored.index, stack.length - 1))
  return { stack, index }
}

export function persistHistory(
  styleId: string,
  stack: ColorEditSnapshot[],
  index: number,
): void {
  writeStored({
    styleId,
    stack: stack.map(cloneSnapshot),
    index,
  })
}

export function clearHistoryStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * 在目前指標後推入新快照（丟棄 redo 分支），並裁切長度。
 */
export function pushSnapshot(
  stack: ColorEditSnapshot[],
  index: number,
  snapshot: ColorEditSnapshot,
): { stack: ColorEditSnapshot[]; index: number } {
  const trimmed = stack.slice(0, index + 1)
  const last = trimmed[trimmed.length - 1]
  const next = normalizeSnapshot(snapshot)
  if (last && JSON.stringify(normalizeSnapshot(last)) === JSON.stringify(next)) {
    return { stack: trimmed, index: trimmed.length - 1 }
  }
  trimmed.push(cloneSnapshot(next))
  while (trimmed.length > MAX_STACK) trimmed.shift()
  return { stack: trimmed, index: trimmed.length - 1 }
}

export function canUndo(index: number): boolean {
  return index > 0
}

export function canRedo(index: number, stackLen: number): boolean {
  return index < stackLen - 1
}
