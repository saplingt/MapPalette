import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StyleSpecification } from 'maplibre-gl'
import { HelpModal } from './components/HelpModal'
import { MapView } from './components/MapView'
import { Sidebar } from './components/Sidebar'
import { applyColorRemap, extractPaletteFromStyle } from './lib/colors'
import { styleDownloadFilename } from './lib/filename'
import { parseHash, sanitizeStyleName, writeHash } from './lib/hashState'
import { fetchOfficialStyle, type StyleId } from './lib/styles'

function readInitialStyleId(): StyleId {
  const parsed = parseHash(window.location.hash)
  return parsed?.styleId ?? 'positron'
}

function readInitialRemap(): Record<string, string> {
  const parsed = parseHash(window.location.hash)
  return parsed?.remap ?? {}
}

function readInitialStyleName(styleId: StyleId): string {
  const parsed = parseHash(window.location.hash)
  return sanitizeStyleName(parsed?.styleName) || styleId
}

function handleStyleNameInput(name: string): string {
  // 輸入中保留空白，只截斷長度；寫入 hash 時再 trim
  return name.slice(0, 80)
}

export default function App() {
  const [styleId, setStyleId] = useState<StyleId>(readInitialStyleId)
  const [styleName, setStyleName] = useState(() =>
    readInitialStyleName(readInitialStyleId()),
  )
  const [baseStyle, setBaseStyle] = useState<StyleSpecification | null>(null)
  const [remap, setRemap] = useState<Record<string, string>>(readInitialRemap)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

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
      setStyleName((prevName) => {
        // 名稱仍等於舊底稿 id 時，跟著換成新底稿 id
        if (!prevName.trim() || prevName.trim() === styleId) return id
        return prevName
      })
      setStyleId(id)
      setRemap({})
      setStatusMessage(null)
    },
    [styleId],
  )

  const handleColorChange = useCallback((original: string, next: string) => {
    setRemap((prev) => {
      const copy = { ...prev }
      if (next === original) {
        delete copy[original]
      } else {
        copy[original] = next
      }
      return copy
    })
    setStatusMessage(null)
  }, [])

  const handleReset = useCallback(() => {
    setRemap({})
    setStatusMessage('已還原官方樣式')
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
      setStatusMessage('已複製分享網址')
    } catch {
      setError('無法複製網址，請手動從網址列複製')
    }
  }, [])

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />
      <Sidebar
        styleId={styleId}
        styleName={styleName}
        palette={palette}
        remap={remap}
        loading={loading}
        error={error}
        statusMessage={statusMessage}
        onStyleChange={handleStyleChange}
        onStyleNameChange={(name) => setStyleName(handleStyleNameInput(name))}
        onColorChange={handleColorChange}
        onReset={handleReset}
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
