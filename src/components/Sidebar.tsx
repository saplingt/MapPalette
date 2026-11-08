import { useEffect, useMemo, useState } from 'react'
import type { ColorOccurrence } from '../lib/colors'
import { formatRgbLabel } from '../lib/colors'
import {
  groupPaletteByCategory,
  type PaletteCategoryId,
} from '../lib/categories'
import { styleDownloadFilename } from '../lib/filename'
import { OFFICIAL_STYLES, type StyleId } from '../lib/styles'
import { ColorEditor } from './ColorEditor'

interface SidebarProps {
  styleId: StyleId
  styleName: string
  palette: ColorOccurrence[]
  remap: Record<string, string>
  loading: boolean
  error: string | null
  statusMessage: string | null
  onStyleChange: (id: StyleId) => void
  onStyleNameChange: (name: string) => void
  onColorChange: (original: string, next: string) => void
  onReset: () => void
  onCopy: () => void
  onDownload: () => void
  onShare: () => void
  onOpenHelp: () => void
}

export function Sidebar({
  styleId,
  styleName,
  palette,
  remap,
  loading,
  error,
  statusMessage,
  onStyleChange,
  onStyleNameChange,
  onColorChange,
  onReset,
  onCopy,
  onDownload,
  onShare,
  onOpenHelp,
}: SidebarProps) {
  const remappedCount = Object.entries(remap).filter(([a, b]) => a !== b).length
  const groups = useMemo(() => groupPaletteByCategory(palette), [palette])
  const [collapsed, setCollapsed] = useState<Set<PaletteCategoryId>>(
    () => new Set(),
  )
  const [editingColor, setEditingColor] = useState<string | null>(null)

  const groupKey = groups.map((g) => g.id).join('|')

  // 窄螢幕預設全部收合，避免色票區被撐爆；桌面則展開
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 900px)').matches
    if (narrow) {
      setCollapsed(
        new Set(
          groupKey.split('|').filter(Boolean) as PaletteCategoryId[],
        ),
      )
    } else {
      setCollapsed(new Set())
    }
  }, [styleId, groupKey])

  useEffect(() => {
    setEditingColor(null)
  }, [styleId])

  const editingItem = editingColor
    ? palette.find((item) => item.color === editingColor)
    : null
  const editingCurrent = editingColor
    ? (remap[editingColor] ?? editingColor)
    : null

  const toggleCategory = (id: PaletteCategoryId) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-brand">
        <div className="brand-row">
          <p className="brand-mark">MapPalette</p>
          <button
            type="button"
            className="help-trigger"
            onClick={onOpenHelp}
            aria-label="開啟使用教學"
            title="使用教學"
          >
            ?
          </button>
        </div>
        <p className="brand-sub">OpenFreeMap 官方樣式色彩調色盤</p>
      </header>

      <section className="panel">
        <h2 className="panel-title">地圖樣式</h2>
        <div className="style-switch" role="tablist" aria-label="選擇樣式">
          {OFFICIAL_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={styleId === s.id}
              className={`style-chip ${styleId === s.id ? 'is-active' : ''}`}
              onClick={() => onStyleChange(s.id)}
              disabled={loading}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">樣式名稱</h2>
        <label className="name-field">
          <input
            type="text"
            className="name-input"
            value={styleName}
            onChange={(e) => onStyleNameChange(e.target.value)}
            placeholder={styleId}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="name-hint"
          />
        </label>
        <p id="name-hint" className="name-hint">
          下載檔名：{styleDownloadFilename(styleName, styleId)}
        </p>
      </section>

      <section className="panel panel-actions">
        <h2 className="panel-title">操作</h2>
        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onReset} disabled={loading}>
            重設
          </button>
          <button type="button" className="btn btn-ghost" onClick={onShare}>
            分享網址
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCopy} disabled={loading}>
            複製 JSON
          </button>
          <button type="button" className="btn btn-solid" onClick={onDownload} disabled={loading}>
            下載 JSON
          </button>
        </div>
        {statusMessage && <p className="status-ok">{statusMessage}</p>}
        {error && <p className="status-err">{error}</p>}
      </section>

      <section className="panel panel-palette">
        <div className="palette-head">
          <h2 className="panel-title">色彩清單</h2>
          <span className="palette-meta">
            {loading
              ? '載入中…'
              : `${palette.length} 色 · ${groups.length} 類 · 已改 ${remappedCount}`}
          </span>
        </div>

        <div className="color-list">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.id)
            const changedInGroup = group.items.filter(
              (item) => (remap[item.color] ?? item.color) !== item.color,
            ).length

            return (
              <section key={group.id} className="color-group">
                <button
                  type="button"
                  className={`color-group-toggle ${isCollapsed ? 'is-collapsed' : ''}`}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCategory(group.id)}
                >
                  <span className="color-group-chevron" aria-hidden="true" />
                  <span className="color-group-label">{group.label}</span>
                  <span className="color-group-count">
                    {group.items.length}
                    {changedInGroup > 0 ? ` · 改 ${changedInGroup}` : ''}
                  </span>
                </button>

                {!isCollapsed && (
                  <ul className="color-group-list">
                    {group.items.map((item) => {
                      const current = remap[item.color] ?? item.color
                      const changed = current !== item.color
                      const isEditing = editingColor === item.color
                      return (
                        <li
                          key={item.color}
                          className={`color-row ${changed ? 'is-changed' : ''} ${isEditing ? 'is-editing' : ''}`}
                        >
                          <button
                            type="button"
                            className="swatch-wrap"
                            data-swatch-key={item.color}
                            title={formatRgbLabel(item.color)}
                            aria-label={`調整顏色 ${formatRgbLabel(item.color)}`}
                            aria-expanded={isEditing}
                            onClick={() =>
                              setEditingColor(isEditing ? null : item.color)
                            }
                          >
                            <span
                              className="swatch"
                              style={{ background: current }}
                            />
                          </button>
                          <div className="color-meta">
                            <code className="color-code" title={item.color}>
                              {formatRgbLabel(item.color)}
                            </code>
                            {changed && (
                              <code
                                className="color-code color-code-new"
                                title={current}
                              >
                                → {formatRgbLabel(current)}
                              </code>
                            )}
                            <span className="color-hint">
                              {item.count} 處 ·{' '}
                              {item.layers.slice(0, 2).join(', ')}
                              {item.layers.length > 2 ? '…' : ''}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}

          {!loading && palette.length === 0 && (
            <p className="color-empty">此樣式未掃到色彩字串</p>
          )}
        </div>
      </section>

      {editingColor && editingItem && editingCurrent != null && (
        <ColorEditor
          original={editingColor}
          current={editingCurrent}
          getAnchor={() => {
            const node = document.querySelector(
              `[data-swatch-key=${JSON.stringify(editingColor)}]`,
            )
            return node?.getBoundingClientRect() ?? null
          }}
          onChange={(next) => onColorChange(editingColor, next)}
          onClose={() => setEditingColor(null)}
        />
      )}

      <footer className="sidebar-credit">
        <p>
          地圖樣式與圖磚：
          <a
            href="https://openfreemap.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenFreeMap
          </a>
          {' · '}
          <a
            href="https://www.openmaptiles.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            © OpenMapTiles
          </a>
        </p>
        <p>
          資料來源：
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap
          </a>{' '}
          contributors
        </p>
      </footer>
    </aside>
  )
}
