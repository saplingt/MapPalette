import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { HelpModal } from './components/HelpModal'
import { MapView } from './components/MapView'
import { Sidebar } from './components/Sidebar'
import {
  applyColorRemap,
  extractColorSitesFromStyle,
  extractPaletteFromStyle,
} from './lib/colors'
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
import { createShortlink, isShortlinkConfigured } from './lib/shortlink'
import { fetchOfficialStyle, type StyleId } from './lib/styles'

function emptySnap(
  partial?: Partial<ColorEditSnapshot>,
): ColorEditSnapshot {
  return {
    remap: { ...(partial?.remap ?? {}) },
    siteRemap: { ...(partial?.siteRemap ?? {}) },
    previous: { ...(partial?.previous ?? {}) },
    previousSites: { ...(partial?.previousSites ?? {}) },
  }
}

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

function readInitialSiteRemap(): Record<string, string> {
  const parsed = parseHash(window.location.hash)
  return parsed?.siteRemap ?? {}
}

function initEditorState(
  styleId: StyleId,
  urlRemap: Record<string, string>,
  urlSiteRemap: Record<string, string>,
): ColorEditSnapshot & { stack: ColorEditSnapshot[]; index: number } {
  const loaded = loadHistoryForStyle(styleId)
  const tip = loaded.stack[loaded.index]
  if (
    tip &&
    JSON.stringify(tip.remap) === JSON.stringify(urlRemap) &&
    JSON.stringify(tip.siteRemap ?? {}) === JSON.stringify(urlSiteRemap)
  ) {
    return {
      ...emptySnap(tip),
      stack: loaded.stack,
      index: loaded.index,
    }
  }
  const snap = emptySnap({ remap: urlRemap, siteRemap: urlSiteRemap })
  return { ...snap, stack: [snap], index: 0 }
}

function handleStyleNameInput(name: string): string {
  return name.slice(0, 80)
}

function currentForSite(
  siteId: string,
  original: string,
  remap: Record<string, string>,
  siteRemap: Record<string, string>,
): string {
  if (Object.prototype.hasOwnProperty.call(siteRemap, siteId)) {
    return siteRemap[siteId]
  }
  return remap[original] ?? original
}

export default function App() {
  const initialStyleId = readInitialStyleId()
  const [styleId, setStyleId] = useState<StyleId>(initialStyleId)
  const [styleName, setStyleName] = useState(() =>
    readInitialStyleName(initialStyleId),
  )
  const [baseStyle, setBaseStyle] = useState<StyleSpecification | null>(null)
  const [editor, setEditor] = useState(() =>
    initEditorState(
      initialStyleId,
      readInitialRemap(),
      readInitialSiteRemap(),
    ),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const gestureKeyRef = useRef<string | null>(null)
  const shareCopiedTimerRef = useRef<number | null>(null)

  const flashShareCopied = useCallback(() => {
    setShareCopied(true)
    if (shareCopiedTimerRef.current != null) {
      window.clearTimeout(shareCopiedTimerRef.current)
    }
    shareCopiedTimerRef.current = window.setTimeout(() => {
      setShareCopied(false)
      shareCopiedTimerRef.current = null
    }, 2400)
  }, [])

  useEffect(() => {
    return () => {
      if (shareCopiedTimerRef.current != null) {
        window.clearTimeout(shareCopiedTimerRef.current)
      }
    }
  }, [])

  const { remap, siteRemap, previous, previousSites, stack, index } = editor

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

  const colorSites = useMemo(
    () => (baseStyle ? extractColorSitesFromStyle(baseStyle) : []),
    [baseStyle],
  )

  const remappedStyle = useMemo(() => {
    if (!baseStyle) return null
    const next = applyColorRemap(baseStyle, remap, siteRemap)
    const name = styleName.trim() || styleId
    return { ...next, name } as StyleSpecification & { name: string }
  }, [baseStyle, remap, siteRemap, styleName, styleId])

  useEffect(() => {
    writeHash({ styleId, styleName, remap, siteRemap })
  }, [styleId, styleName, remap, siteRemap])

  const handleStyleChange = useCallback(
    (id: StyleId) => {
      gestureKeyRef.current = null
      setStyleName((prevName) => {
        if (!prevName.trim() || prevName.trim() === styleId) return id
        return prevName
      })
      setStyleId(id)
      const snap = emptySnap()
      setEditor({ ...snap, stack: [snap], index: 0 })
      setStatusMessage(null)
    },
    [styleId],
  )

  const handleColorChange = useCallback((originals: string[], next: string) => {
    if (originals.length === 0) return
    const gestureKey = `c:${originals.slice().sort().join('\0')}`

    setEditor((prev) => {
      let { stack, index, previous, siteRemap, previousSites } = prev

      if (gestureKeyRef.current !== gestureKey) {
        gestureKeyRef.current = gestureKey
        const frozen = pushSnapshot(stack, index, emptySnap(prev))
        stack = frozen.stack
        index = frozen.index
        previous = { ...prev.previous }
        for (const original of originals) {
          previous[original] = prev.remap[original] ?? original
        }

        const started = emptySnap({
          remap: prev.remap,
          siteRemap: prev.siteRemap,
          previous,
          previousSites: prev.previousSites,
        })
        const nextStack = stack.slice(0, index + 1)
        nextStack.push(started)
        stack = nextStack
        index = stack.length - 1
      }

      const newRemap = { ...prev.remap }
      previous = { ...previous }
      for (const original of originals) {
        if (next === original) {
          delete newRemap[original]
          delete previous[original]
        } else {
          newRemap[original] = next
        }
      }

      const live = emptySnap({
        remap: newRemap,
        siteRemap,
        previous,
        previousSites,
      })
      const updatedStack = stack.map((s, i) => (i === index ? live : s))
      return { ...live, stack: updatedStack, index }
    })
    setStatusMessage(null)
  }, [])

  const handleSiteColorChange = useCallback(
    (siteId: string, original: string, next: string) => {
      const gestureKey = `s:${siteId}`

      setEditor((prev) => {
        let { stack, index, previousSites, remap, previous } = prev

        if (gestureKeyRef.current !== gestureKey) {
          gestureKeyRef.current = gestureKey
          const frozen = pushSnapshot(stack, index, emptySnap(prev))
          stack = frozen.stack
          index = frozen.index
          previousSites = { ...prev.previousSites }
          previousSites[siteId] = currentForSite(
            siteId,
            original,
            prev.remap,
            prev.siteRemap,
          )

          const started = emptySnap({
            remap: prev.remap,
            siteRemap: prev.siteRemap,
            previous: prev.previous,
            previousSites,
          })
          const nextStack = stack.slice(0, index + 1)
          nextStack.push(started)
          stack = nextStack
          index = stack.length - 1
        }

        const newSiteRemap = { ...prev.siteRemap }
        previousSites = { ...previousSites }
        if (next === original) {
          delete newSiteRemap[siteId]
          delete previousSites[siteId]
        } else {
          newSiteRemap[siteId] = next
        }

        const live = emptySnap({
          remap,
          siteRemap: newSiteRemap,
          previous,
          previousSites,
        })
        const updatedStack = stack.map((s, i) => (i === index ? live : s))
        return { ...live, stack: updatedStack, index }
      })
      setStatusMessage(null)
    },
    [],
  )

  const handleColorGestureEnd = useCallback(() => {
    gestureKeyRef.current = null
  }, [])

  const handleReset = useCallback(() => {
    gestureKeyRef.current = null
    setEditor((prev) => {
      const frozen = pushSnapshot(prev.stack, prev.index, emptySnap(prev))
      const snap = emptySnap()
      const nextStack = frozen.stack.slice(0, frozen.index + 1)
      nextStack.push(snap)
      return { ...snap, stack: nextStack, index: nextStack.length - 1 }
    })
    setStatusMessage('已還原官方樣式')
  }, [])

  const handleClearHistory = useCallback(() => {
    gestureKeyRef.current = null
    clearHistoryStorage()
    setEditor((prev) => {
      const snap = emptySnap({
        remap: prev.remap,
        siteRemap: prev.siteRemap,
      })
      return { ...snap, stack: [snap], index: 0 }
    })
    setStatusMessage('已清空本機歷史紀錄')
  }, [])

  const handleUndo = useCallback(() => {
    gestureKeyRef.current = null
    setEditor((prev) => {
      if (!canUndo(prev.index)) return prev
      const index = prev.index - 1
      const tip = emptySnap(prev.stack[index])
      return { ...tip, stack: prev.stack, index }
    })
    setStatusMessage(null)
  }, [])

  const handleRedo = useCallback(() => {
    gestureKeyRef.current = null
    setEditor((prev) => {
      if (!canRedo(prev.index, prev.stack.length)) return prev
      const index = prev.index + 1
      const tip = emptySnap(prev.stack[index])
      return { ...tip, stack: prev.stack, index }
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
    // 先把目前色票／樣式狀態寫進 URL hash，再以此長網址建短碼（僅此時呼叫 API）
    writeHash({ styleId, styleName, remap, siteRemap })
    const longUrl = window.location.href

    setError(null)
    const short = await createShortlink(longUrl)
    const usedShort = Boolean(short?.shortUrl)
    const url = short?.shortUrl || longUrl

    if (!usedShort && isShortlinkConfigured()) {
      // API 已設定但失敗：退回長網址並提示
      setStatusMessage('短網址建立失敗，已改用完整網址')
    } else if (short?.reused) {
      setStatusMessage('已重用既有短網址')
    } else if (usedShort) {
      setStatusMessage('已建立短網址')
    } else {
      setStatusMessage(null)
    }

    const payload = {
      title: 'MapPalette',
      text: styleName.trim() || styleId,
      url,
    }

    // 僅窄螢幕／觸控裝置走原生分享；桌機一律複製網址
    const preferNativeShare =
      typeof window.matchMedia === 'function' &&
      (window.matchMedia('(max-width: 900px)').matches ||
        window.matchMedia('(hover: none) and (pointer: coarse)').matches)

    // 1) 手機：系統原生分享（LINE、FB…）
    // 2) 桌面：複製網址
    // 3) 按鈕文案維持「分享網址」
    if (preferNativeShare && typeof navigator.share === 'function') {
      try {
        const can =
          typeof navigator.canShare !== 'function' || navigator.canShare(payload)
        if (can) {
          await navigator.share(payload)
          return
        }
      } catch (err) {
        // 使用者取消分享不算錯誤
        if (err instanceof DOMException && err.name === 'AbortError') return
        // 分享失敗再退回複製
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      flashShareCopied()
    } catch {
      setError('無法複製網址，請手動從網址列複製')
    }
  }, [styleId, styleName, remap, siteRemap, flashShareCopied])

  const undoEnabled = canUndo(index)
  const redoEnabled = canRedo(index, stack.length)
  const hasLocalHistory =
    undoEnabled ||
    redoEnabled ||
    Object.keys(previous).length > 0 ||
    Object.keys(previousSites).length > 0 ||
    stack.length > 1

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />
      <Sidebar
        styleId={styleId}
        styleName={styleName}
        palette={palette}
        colorSites={colorSites}
        remap={remap}
        siteRemap={siteRemap}
        previous={previous}
        previousSites={previousSites}
        loading={loading}
        error={error}
        statusMessage={statusMessage}
        shareCopied={shareCopied}
        canUndo={undoEnabled}
        canRedo={redoEnabled}
        canClearHistory={hasLocalHistory}
        onStyleChange={handleStyleChange}
        onStyleNameChange={(name) => setStyleName(handleStyleNameInput(name))}
        onColorChange={handleColorChange}
        onSiteColorChange={handleSiteColorChange}
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
