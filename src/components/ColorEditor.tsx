import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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
  current: string
  getAnchor: () => DOMRect | null
  onChange: (next: string) => void
  onClose: () => void
}

const PANEL_WIDTH = 248
const PANEL_EST_HEIGHT = 360
const GAP = 8
const VIEW_PAD = 10

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
  current,
  getAnchor,
  onChange,
  onClose,
}: ColorEditorProps) {
  const titleId = useId()
  const inputId = useId()
  const errorId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const inputFocusedRef = useRef(false)
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

  const pickerColor = toRgbaString(current)
  const opacity = getOpacityPercent(current)

  useEffect(() => {
    if (inputFocusedRef.current) return
    setDraft(formatHexForInput(current))
    setInputError(false)
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
            inputFocusedRef.current = true
            setInputError(false)
          }}
          onChange={(e) => {
            setDraft(e.target.value)
            if (inputError) setInputError(false)
          }}
          onBlur={() => {
            inputFocusedRef.current = false
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

      <div className="color-editor-meta">
        <code className="color-editor-rgb">{formatCssRgb(current)}</code>
        <span className="color-editor-alpha">{opacity}%</span>
      </div>

      <p className="color-editor-origin" title={original}>
        原始：{formatCssRgb(original)}
      </p>
    </div>,
    document.body,
  )
}
