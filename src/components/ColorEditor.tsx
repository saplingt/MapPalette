import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { RgbaStringColorPicker } from 'react-colorful'
import {
  formatCssColor,
  formatCssRgb,
  formatHexForInput,
  getOpacityPercent,
  isColorString,
  parseCssColor,
  toRgbaString,
} from '../lib/colors'

interface ColorEditorProps {
  original: string
  /** 同色合併時補充說明，例如「等 3 個色碼」 */
  originalHint?: string
  current: string
  getAnchor: () => DOMRect | null
  onChange: (next: string) => void
  onClose: () => void
}

const PANEL_WIDTH = 248
const PANEL_EST_HEIGHT = 420
const GAP = 8
const VIEW_PAD = 10

type RgbaDraft = { r: string; g: string; b: string; a: string }

function draftsFromColor(color: string): RgbaDraft {
  const { r, g, b } = parseCssColor(color)
  return {
    r: String(r),
    g: String(g),
    b: String(b),
    a: String(getOpacityPercent(color)),
  }
}

function parseByteChannel(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d{1,3}$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 0 || n > 255) return null
  return n
}

function parseOpacityPercent(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d{1,3}$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 0 || n > 100) return null
  return n
}

function placePanel(anchor: DOMRect) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(PANEL_WIDTH, vw - VIEW_PAD * 2)

  let left = anchor.left + anchor.width / 2 - width / 2
  left = Math.max(VIEW_PAD, Math.min(left, vw - width - VIEW_PAD))

  const spaceBelow = vh - anchor.bottom - VIEW_PAD
  const spaceAbove = anchor.top - VIEW_PAD
  const placeBelow =
    spaceBelow >= PANEL_EST_HEIGHT || spaceBelow >= spaceAbove

  let top: number
  let placement: 'below' | 'above'
  if (placeBelow) {
    placement = 'below'
    top = anchor.bottom + GAP
    if (top + PANEL_EST_HEIGHT > vh - VIEW_PAD) {
      top = Math.max(VIEW_PAD, vh - VIEW_PAD - PANEL_EST_HEIGHT)
    }
  } else {
    placement = 'above'
    top = anchor.top - GAP - PANEL_EST_HEIGHT
    if (top < VIEW_PAD) top = VIEW_PAD
  }

  return { top, left, width, placement }
}

export function ColorEditor({
  original,
  originalHint,
  current,
  getAnchor,
  onChange,
  onClose,
}: ColorEditorProps) {
  const titleId = useId()
  const inputId = useId()
  const errorId = useId()
  const rgbaErrorId = useId()
  const rId = useId()
  const gId = useId()
  const bId = useId()
  const aId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const hexFocusedRef = useRef(false)
  const rgbaFocusedRef = useRef(false)
  const getAnchorRef = useRef(getAnchor)
  getAnchorRef.current = getAnchor

  const [pos, setPos] = useState(() => {
    const anchor = getAnchor()
    return anchor
      ? placePanel(anchor)
      : {
          top: VIEW_PAD,
          left: VIEW_PAD,
          width: PANEL_WIDTH,
          placement: 'below' as const,
        }
  })
  const [draft, setDraft] = useState(() => formatHexForInput(current))
  const [inputError, setInputError] = useState(false)
  const [rgbaDraft, setRgbaDraft] = useState<RgbaDraft>(() =>
    draftsFromColor(current),
  )
  const [rgbaError, setRgbaError] = useState(false)

  const pickerColor = toRgbaString(current)

  useEffect(() => {
    if (!hexFocusedRef.current) {
      setDraft(formatHexForInput(current))
      setInputError(false)
    }
    if (!rgbaFocusedRef.current) {
      setRgbaDraft(draftsFromColor(current))
      setRgbaError(false)
    }
  }, [current])

  const commitDraft = () => {
    const trimmed = draft.trim()
    if (isColorString(trimmed)) {
      const next = formatCssColor(parseCssColor(trimmed))
      onChange(next)
      setDraft(formatHexForInput(next))
      setInputError(false)
      return
    }
    setDraft(formatHexForInput(current))
    setInputError(true)
  }

  const commitRgbaDraft = () => {
    const r = parseByteChannel(rgbaDraft.r)
    const g = parseByteChannel(rgbaDraft.g)
    const b = parseByteChannel(rgbaDraft.b)
    const aPct = parseOpacityPercent(rgbaDraft.a)
    if (r == null || g == null || b == null || aPct == null) {
      setRgbaDraft(draftsFromColor(current))
      setRgbaError(true)
      return
    }
    const next = formatCssColor({ r, g, b, a: aPct / 100 })
    onChange(next)
    setRgbaDraft(draftsFromColor(next))
    setRgbaError(false)
  }

  const syncPos = () => {
    const anchor = getAnchorRef.current()
    if (!anchor) return
    if (
      anchor.bottom < 0 ||
      anchor.top > window.innerHeight ||
      anchor.right < 0 ||
      anchor.left > window.innerWidth
    ) {
      onClose()
      return
    }
    setPos(placePanel(anchor))
  }

  useLayoutEffect(() => {
    syncPos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAnchor])

  useEffect(() => {
    window.addEventListener('resize', syncPos)
    window.addEventListener('scroll', syncPos, true)
    return () => {
      window.removeEventListener('resize', syncPos)
      window.removeEventListener('scroll', syncPos, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointer)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  }, [onClose])

  const bindChannel = (key: keyof RgbaDraft) => ({
    value: rgbaDraft[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setRgbaDraft((prev) => ({ ...prev, [key]: value }))
      if (rgbaError) setRgbaError(false)
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        ;(e.target as HTMLInputElement).blur()
      }
    },
  })

  return createPortal(
    <div
      ref={panelRef}
      className={`color-editor color-editor-${pos.placement}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
      }}
    >
      <div className="color-editor-head">
        <h3 id={titleId} className="color-editor-title">
          調整顏色
        </h3>
        <button
          type="button"
          className="color-editor-close"
          onClick={onClose}
          aria-label="關閉"
        >
          ×
        </button>
      </div>

      <div className="color-editor-preview-wrap">
        <span className="color-editor-preview" style={{ background: current }} />
      </div>

      <RgbaStringColorPicker
        color={pickerColor}
        onChange={(next) => onChange(formatCssColor(parseCssColor(next)))}
      />

      <label className="color-editor-field" htmlFor={inputId}>
        <span className="color-editor-label">色碼</span>
        <input
          id={inputId}
          type="text"
          className={`color-editor-input ${inputError ? 'is-invalid' : ''}`}
          value={draft}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={inputError}
          aria-describedby={inputError ? errorId : undefined}
          onFocus={() => {
            hexFocusedRef.current = true
            setInputError(false)
          }}
          onChange={(e) => {
            setDraft(e.target.value)
            if (inputError) setInputError(false)
          }}
          onBlur={() => {
            hexFocusedRef.current = false
            commitDraft()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder="#rrggbb"
        />
        {inputError && (
          <span id={errorId} className="color-editor-error" role="alert">
            色碼格式錯誤，已還原為目前顏色
          </span>
        )}
      </label>

      <div
        className="color-editor-channels"
        role="group"
        aria-label="RGB 與透明度"
        onFocusCapture={() => {
          rgbaFocusedRef.current = true
          setRgbaError(false)
        }}
        onBlurCapture={(e) => {
          const next = e.relatedTarget as Node | null
          if (next && e.currentTarget.contains(next)) return
          rgbaFocusedRef.current = false
          commitRgbaDraft()
        }}
      >
        <label className="color-editor-channel" htmlFor={rId}>
          <span className="color-editor-channel-label">R</span>
          <input
            id={rId}
            type="text"
            inputMode="numeric"
            className={`color-editor-channel-input ${rgbaError ? 'is-invalid' : ''}`}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={rgbaError}
            {...bindChannel('r')}
          />
        </label>
        <label className="color-editor-channel" htmlFor={gId}>
          <span className="color-editor-channel-label">G</span>
          <input
            id={gId}
            type="text"
            inputMode="numeric"
            className={`color-editor-channel-input ${rgbaError ? 'is-invalid' : ''}`}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={rgbaError}
            {...bindChannel('g')}
          />
        </label>
        <label className="color-editor-channel" htmlFor={bId}>
          <span className="color-editor-channel-label">B</span>
          <input
            id={bId}
            type="text"
            inputMode="numeric"
            className={`color-editor-channel-input ${rgbaError ? 'is-invalid' : ''}`}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={rgbaError}
            {...bindChannel('b')}
          />
        </label>
        <label className="color-editor-channel" htmlFor={aId}>
          <span className="color-editor-channel-label">A%</span>
          <input
            id={aId}
            type="text"
            inputMode="numeric"
            className={`color-editor-channel-input ${rgbaError ? 'is-invalid' : ''}`}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={rgbaError}
            aria-describedby={rgbaError ? rgbaErrorId : undefined}
            {...bindChannel('a')}
          />
        </label>
      </div>
      {rgbaError && (
        <span id={rgbaErrorId} className="color-editor-error" role="alert">
          RGB／透明度格式錯誤，已還原為目前顏色
        </span>
      )}

      <p
        className="color-editor-origin"
        title={originalHint ? `${original}（${originalHint}）` : original}
      >
        原始：{formatCssRgb(original)}
        {originalHint ? ` · ${originalHint}` : ''}
      </p>
    </div>,
    document.body,
  )
}
