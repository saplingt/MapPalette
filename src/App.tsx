import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { HelpModal } from './components/HelpModal'
import { MapView } from './components/MapView'
import { Sidebar } from './components/Sidebar'
import { applyColorRemap, extractPaletteFromStyle } from './lib/colors'
import {
  canRedo,
  canUndo,
  clearHistoryStorage,
  loadHistoryForStyle,
  persistHistory,
  pushSnapshot,
  type ColorEditSnapshot,
} from './lib/editHistory'
import { styleDownloadFilename } from './lib/filename'
import { parseHash, sanitizeStyleName, writeHash } from './lib/hashState'
import { fetchOfficialStyle, type StyleId } from './lib/styles'

function readInitialStyleId(): StyleId {
  const parsed = parseHash(window.location.hash)
  return parsed?.styleId ?? 'positron'
}

function readInitialStyleName(styleId: StyleId): string {
  const parsed = parseHash(window.location.hash)
  return sanitizeStyleName(parsed?.styleName) || styleId
}

function readInitialRemap(): Record<string, string> {
  const parsed = parseHash(window.location.hash)
  return parsed?.remap ?? {}
}

function initEditorState(
  styleId: StyleId,
  urlRemap: Record<string, string>,
): ColorEditSnapshot & { stack: ColorEditSnapshot[]; index: number } {
  const loaded = loadHistoryForStyle(styleId)
  const tip = loaded.stack[loaded.index]
  if (
    tip &&
    JSON.stringify(tip.remap) === JSON.stringify(urlRemap)
  ) {
    // 同一工作階段、網址狀態吻合 → 還原本機 previous／undo
    return {
      remap: { ...tip.remap },
      previous: { ...tip.previous },
      stack: loaded.stack,
      index: loaded.index,
    }
  }
  // 分享連結或新狀態：只有網址上的目前色，沒有「修改前」
  const snap: ColorEditSnapshot = { remap: { ...urlRemap }, previous: {} }
  return { ...snap, stack: [snap], index: 0 }
}

function handleStyleNameInput(name: string): string {
  return name.slice(0, 80)
}

export default function App() {
  const initialStyleId = readInitialStyleId()
  const [styleId, setStyleId] = useState<StyleId>(initialStyleId)
  const [styleName, setStyleName] = useState(() =>
    readInitialStyleName(initialStyleId),
  )
  const [baseStyle, setBaseStyle] = useState<StyleSpecification | null>(null)
  const [editor, setEditor] = useState(() =>
    initEditorState(initialStyleId, readInitialRemap()),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  /** 同一色票拖曳取色只算一次歷史手勢 */
  const gestureKeyRef = useRef<string | null>(null)

  const { remap, previous, stack, index } = editor

  useEffect(() => {
    persistHistory(styleId, stack, index)
  }, [styleId, stack, index])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchOfficialStyle(styleId)
      .then((style) => {
        if (cancelled) return
        setBaseStyle(style)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '載入樣式失敗')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [styleId])

  const palette = useMemo(
    () => (baseStyle ? extractPaletteFromStyle(baseStyle) : []),
    [baseStyle],
  )

  const remappedStyle = useMemo(() => {
    if (!baseStyle) return null
    const next = applyColorRemap(baseStyle, remap)
    const name = styleName.trim() || styleId
    return { ...next, name } as StyleSpecification & { name: string }
  }, [baseStyle, remap, styleName, styleId])

  useEffect(() => {
    writeHash({ styleId, styleName, remap })
  }, [styleId, styleName, remap])

  const handleStyleChange = useCallback(
    (id: StyleId) => {
      gestureKeyRef.current = null
      setStyleName((prevName) => {
        if (!prevName.trim() || prevName.trim() === styleId) return id
        return prevName
      })
      setStyleId(id)
      const snap: ColorEditSnapshot = { remap: {}, previous: {} }
      setEditor({ ...snap, stack: [snap], index: 0 })
      setStatusMessage(null)
    },
    [styleId],
  )

  const handleColorChange = useCallback((original: string, next: string) => {
    setEditor((prev) => {
      const before = prev.remap[original] ?? original
      let { stack, index, previous } = prev

      if (gestureKeyRef.current !== original) {
        gestureKeyRef.current = original
        // 先把「改之前」的狀態推進歷史，再開始這次手勢
        const frozen = pushSnapshot(stack, index, {
          remap: prev.remap,
          previous: prev.previous,
        })
        stack = frozen.stack
        index = frozen.index
        previous = { ...prev.previous, [original]: before }

        const started: ColorEditSnapshot = {
          remap: { ...prev.remap },
          previous,
        }
        const nextStack = stack.slice(0, index + 1)
        nextStack.push(started)
        stack = nextStack
        index = stack.length - 1
      }

      const newRemap = { ...prev.remap }
      if (next === original) {
        delete newRemap[original]
        const { [original]: _, ...restPrev } = previous
        previous = restPrev
      } else {
        newRemap[original] = next
      }

      const live: ColorEditSnapshot = { remap: newRemap, previous }
      const updatedStack = stack.map((s, i) => (i === index ? live : s))
      return { ...live, stack: updatedStack, index }
    })
    setStatusMessage(null)
  }, [])

  const handleColorGestureEnd = useCallback(() => {
    gestureKeyRef.current = null
  }, [])

  const handleReset = useCallback(() => {
    gestureKeyRef.current = null
    setEditor((prev) => {
      const frozen = pushSnapshot(prev.stack, prev.index, {
        remap: prev.remap,
        previous: prev.previous,
      })
      const snap: ColorEditSnapshot = { remap: {}, previous: {} }
      const nextStack = frozen.stack.slice(0, frozen.index + 1)
      nextStack.push(snap)
      return { ...snap, stack: nextStack, index: nextStack.length - 1 }
    })
    setStatusMessage('已還原官方樣式')
  }, [])

  /** 清空本機改色歷史／修改前顏色；保留目前配色 */
  const handleClearHistory = useCallback(() => {
    gestureKeyRef.current = null
    clearHistoryStorage()
    setEditor((prev) => {
      const snap: ColorEditSnapshot = {
        remap: { ...prev.remap },
        previous: {},
      }
      return { ...snap, stack: [snap], index: 0 }
    })
    setStatusMessage('已清空本機歷史紀錄')
  }, [])

  const handleUndo = useCallback(() => {
    gestureKeyRef.current = null
    setEditor((prev) => {
      if (!canUndo(prev.index)) return prev
      const index = prev.index - 1
      const tip = prev.stack[index]
      return {
        remap: { ...tip.remap },
        previous: { ...tip.previous },
        stack: prev.stack,
        index,
      }
    })
    setStatusMessage(null)
  }, [])

  const handleRedo = useCallback(() => {
    gestureKeyRef.current = null
    setEditor((prev) => {
      if (!canRedo(prev.index, prev.stack.length)) return prev
      const index = prev.index + 1
      const tip = prev.stack[index]
      return {
        remap: { ...tip.remap },
        previous: { ...tip.previous },
        stack: prev.stack,
        index,
      }
    })
    setStatusMessage(null)
  }, [])

  const handleCopy = useCallback(async () => {
    if (!remappedStyle) return
    const text = JSON.stringify(remappedStyle, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setStatusMessage('已複製 style.json 到剪貼簿')
    } catch {
      setError('無法寫入剪貼簿，請改用下載')
    }
  }, [remappedStyle])

  const handleDownload = useCallback(() => {
    if (!remappedStyle) return
    const text = JSON.stringify(remappedStyle, null, 2)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = styleDownloadFilename(styleName, styleId)
    a.click()
    URL.revokeObjectURL(url)
    setStatusMessage(`已下載 ${a.download}`)
  }, [remappedStyle, styleName, styleId])

  const handleShare = useCallback(async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setStatusMessage('已複製分享網址（不含修改前顏色）')
    } catch {
      setError('無法複製網址，請手動從網址列複製')
    }
  }, [])

  const undoEnabled = canUndo(index)
  const redoEnabled = canRedo(index, stack.length)
  const hasLocalHistory =
    undoEnabled ||
    redoEnabled ||
    Object.keys(previous).length > 0 ||
    stack.length > 1

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />
      <Sidebar
        styleId={styleId}
        styleName={styleName}
        palette={palette}
        remap={remap}
        previous={previous}
        loading={loading}
        error={error}
        statusMessage={statusMessage}
        canUndo={undoEnabled}
        canRedo={redoEnabled}
        canClearHistory={hasLocalHistory}
        onStyleChange={handleStyleChange}
        onStyleNameChange={(name) => setStyleName(handleStyleNameInput(name))}
        onColorChange={handleColorChange}
        onColorGestureEnd={handleColorGestureEnd}
        onReset={handleReset}
        onClearHistory={handleClearHistory}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onShare={handleShare}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <main className="map-stage">
        <MapView style={remappedStyle} />
        {loading && (
          <div className="map-overlay">
            <span>載入 OpenFreeMap 樣式中…</span>
          </div>
        )}
      </main>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
