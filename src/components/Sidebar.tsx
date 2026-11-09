import { useEffect, useMemo, useRef, useState } from 'react'
import type { ColorOccurrence, ColorSite } from '../lib/colors'
import { formatRgbLabel } from '../lib/colors'
import {
  groupPaletteByCategory,
  groupPaletteBySameColor,
  groupSitesForFineTune,
  type PaletteGroupMode,
} from '../lib/categories'
import { styleDownloadFilename } from '../lib/filename'
import { OFFICIAL_STYLES, type StyleId } from '../lib/styles'
import { ColorEditor } from './ColorEditor'

interface SidebarProps {
  styleId: StyleId
  styleName: string
  palette: ColorOccurrence[]
  colorSites: ColorSite[]
  remap: Record<string, string>
  siteRemap: Record<string, string>
  /** 本機「修改前」顏色；分享連結不會帶這份資料 */
  previous: Record<string, string>
  previousSites: Record<string, string>
  loading: boolean
  error: string | null
  statusMessage: string | null
  shareCopied: boolean
  canUndo: boolean
  canRedo: boolean
  canClearHistory: boolean
  onStyleChange: (id: StyleId) => void
  onStyleNameChange: (name: string) => void
  /** 同色模式可一次傳入多個原始字面量 */
  onColorChange: (originals: string[], next: string) => void
  onSiteColorChange: (siteId: string, original: string, next: string) => void
  onColorGestureEnd: () => void
  onReset: () => void
  onClearHistory: () => void
  onUndo: () => void
  onRedo: () => void
  onCopy: () => void
  onDownload: () => void
  onShare: () => void
  onOpenHelp: () => void
}

interface EditingTarget {
  /** 編輯錨點（色票 data 屬性） */
  anchorKey: string
  /** 同類／同色：原始色字串列表 */
  originals?: string[]
  /** 逐項：單一位置 */
  site?: ColorSite
}

function siteCurrent(
  site: ColorSite,
  remap: Record<string, string>,
  siteRemap: Record<string, string>,
): string {
  if (Object.prototype.hasOwnProperty.call(siteRemap, site.id)) {
    return siteRemap[site.id]
  }
  return remap[site.color] ?? site.color
}

function sharedPrevious(
  originals: string[],
  previous: Record<string, string>,
  current: string,
): string | null {
  if (originals.length === 0) return null
  const first = previous[originals[0]]
  if (typeof first !== 'string' || first === current) return null
  for (let i = 1; i < originals.length; i++) {
    if (previous[originals[i]] !== first) return null
  }
  return first
}

export function Sidebar({
  styleId,
  styleName,
  palette,
  colorSites,
  remap,
  siteRemap,
  previous,
  previousSites,
  loading,
  error,
  statusMessage,
  shareCopied,
  canUndo,
  canRedo,
  canClearHistory,
  onStyleChange,
  onStyleNameChange,
  onColorChange,
  onSiteColorChange,
  onColorGestureEnd,
  onReset,
  onClearHistory,
  onUndo,
  onRedo,
  onCopy,
  onDownload,
  onShare,
  onOpenHelp,
}: SidebarProps) {
  const remappedCount =
    Object.entries(remap).filter(([a, b]) => a !== b).length +
    Object.keys(siteRemap).length
  const [groupMode, setGroupMode] = useState<PaletteGroupMode>('category')
  const categoryGroups = useMemo(
    () => groupPaletteByCategory(palette),
    [palette],
  )
  const sameColorGroups = useMemo(
    () => groupPaletteBySameColor(palette, remap),
    [palette, remap],
  )
  const fineGroups = useMemo(
    () =>
      groupSitesForFineTune(colorSites, (site) =>
        siteCurrent(site, remap, siteRemap),
      ),
    [colorSites, remap, siteRemap],
  )
  const currentWritingCount = useMemo(() => {
    const set = new Set(
      palette.map((item) => remap[item.color] ?? item.color),
    )
    return set.size
  }, [palette, remap])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [editing, setEditing] = useState<EditingTarget | null>(null)
  const colorListRef = useRef<HTMLDivElement>(null)

  const categoryGroupKey = categoryGroups.map((g) => g.id).join('|')
  const fineGroupKey = fineGroups.map((g) => g.id).join('|')
  const showHistoryNav = canUndo || canRedo || canClearHistory

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 900px)').matches
    if ((groupMode === 'category' || groupMode === 'fine') && narrow) {
      const key = groupMode === 'fine' ? fineGroupKey : categoryGroupKey
      setCollapsed(new Set(key.split('|').filter(Boolean)))
    } else {
      setCollapsed(new Set())
    }
  }, [styleId, categoryGroupKey, fineGroupKey, groupMode])

  useEffect(() => {
    setEditing(null)
    onColorGestureEnd()
    const list = colorListRef.current
    if (list) list.scrollTop = 0
  }, [styleId, groupMode, onColorGestureEnd])

  const toggleCategory = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const closeEditor = () => {
    setEditing(null)
    onColorGestureEnd()
  }

  const metaLabel = loading
    ? '載入中…'
    : groupMode === 'category'
      ? `${palette.length} 色 · ${categoryGroups.length} 類 · 已改 ${remappedCount}`
      : groupMode === 'same-color'
        ? `${sameColorGroups.length} 同色 · ${currentWritingCount} 色碼 · 已改 ${remappedCount}`
        : `${colorSites.length} 處 · ${fineGroups.length} 類 · 已改 ${remappedCount}`

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
          <span className="share-wrap">
            <button type="button" className="btn btn-ghost btn-share-url" onClick={onShare}>
              分享網址
            </button>
            {shareCopied && (
              <span className="share-copied-tip" role="status" aria-live="polite">
                複製成功
              </span>
            )}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-copy-json"
            onClick={onCopy}
            disabled={loading}
          >
            複製 JSON
          </button>
          <button
            type="button"
            className="btn btn-solid btn-download-json"
            onClick={onDownload}
            disabled={loading}
          >
            下載 JSON
          </button>
        </div>
        {showHistoryNav && (
          <div className="action-row action-row-history" role="group" aria-label="改色歷史">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onUndo}
              disabled={!canUndo}
            >
              前一步
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onRedo}
              disabled={!canRedo}
            >
              後一步
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClearHistory}
              disabled={!canClearHistory}
              title="清除 sessionStorage 中的改色歷史與修改前顏色"
            >
              清空歷史紀錄
            </button>
          </div>
        )}
        {statusMessage && <p className="status-ok">{statusMessage}</p>}
        {error && <p className="status-err">{error}</p>}
      </section>

      <section className="panel panel-palette">
        <div className="palette-head">
          <h2 className="panel-title">色彩清單</h2>
          <span className="palette-meta">{metaLabel}</span>
        </div>

        <div className="palette-panel">
          <div className="palette-mode" role="tablist" aria-label="色彩分類方式">
            <button
              type="button"
              role="tab"
              id="palette-tab-category"
              aria-controls="palette-tabpanel"
              aria-selected={groupMode === 'category'}
              tabIndex={groupMode === 'category' ? 0 : -1}
              className={`palette-mode-tab ${groupMode === 'category' ? 'is-active' : ''}`}
              onClick={() => setGroupMode('category')}
            >
              同類
            </button>
            <button
              type="button"
              role="tab"
              id="palette-tab-same-color"
              aria-controls="palette-tabpanel"
              aria-selected={groupMode === 'same-color'}
              tabIndex={groupMode === 'same-color' ? 0 : -1}
              className={`palette-mode-tab ${groupMode === 'same-color' ? 'is-active' : ''}`}
              onClick={() => setGroupMode('same-color')}
              title="將視覺相同、寫法不同的色碼合併，一次改掉組內全部"
            >
              同色
            </button>
            <button
              type="button"
              role="tab"
              id="palette-tab-fine"
              aria-controls="palette-tabpanel"
              aria-selected={groupMode === 'fine'}
              tabIndex={groupMode === 'fine' ? 0 : -1}
              className={`palette-mode-tab ${groupMode === 'fine' ? 'is-active' : ''}`}
              onClick={() => setGroupMode('fine')}
              title="每一處用色拆開，可個別改色；先依類別再依深淺排序"
            >
              逐項
            </button>
          </div>

          <div
            ref={colorListRef}
            className="color-list"
            id="palette-tabpanel"
            role="tabpanel"
            aria-labelledby={
              groupMode === 'category'
                ? 'palette-tab-category'
                : groupMode === 'same-color'
                  ? 'palette-tab-same-color'
                  : 'palette-tab-fine'
            }
          >
          {groupMode === 'category' &&
            categoryGroups.map((group) => {
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
                        const prevColor = sharedPrevious(
                          [item.color],
                          previous,
                          current,
                        )
                        const changed = current !== item.color
                        const isEditing = editing?.anchorKey === item.color
                        return (
                          <li
                            key={item.color}
                            className={`color-row ${changed ? 'is-changed' : ''} ${isEditing ? 'is-editing' : ''}`}
                          >
                            <button
                              type="button"
                              className="swatch-wrap"
                              data-swatch-key={item.color}
                              title={formatRgbLabel(current)}
                              aria-label={`調整顏色 ${formatRgbLabel(current)}`}
                              aria-expanded={isEditing}
                            onClick={() =>
                              setEditing(
                                isEditing
                                  ? null
                                  : {
                                      anchorKey: item.color,
                                      originals: [item.color],
                                      site: undefined,
                                    },
                              )
                            }
                            >
                              <span
                                className="swatch"
                                style={{ background: current }}
                              />
                            </button>
                            <div className="color-meta">
                              <code className="color-code" title={current}>
                                {formatRgbLabel(current)}
                              </code>
                              {prevColor && (
                                <code
                                  className="color-code color-code-prev"
                                  title={prevColor}
                                >
                                  前：{formatRgbLabel(prevColor)}
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

          {groupMode === 'same-color' && (
            <ul className="color-group-list color-group-list-flat">
              {sameColorGroups.map((group) => {
                const current = group.current
                const originals = group.items.map((item) => item.color)
                const changed = group.items.some(
                  (item) => (remap[item.color] ?? item.color) !== item.color,
                )
                const prevColor = sharedPrevious(originals, previous, current)
                const isEditing = editing?.anchorKey === group.id
                const writingHint =
                  group.writings > 1 ? `${group.writings} 色碼 · ` : ''

                return (
                  <li
                    key={group.id}
                    className={`color-row ${changed ? 'is-changed' : ''} ${isEditing ? 'is-editing' : ''}`}
                  >
                    <button
                      type="button"
                      className="swatch-wrap"
                      data-swatch-key={group.id}
                      title={
                        group.writings > 1
                          ? `目前有 ${group.writings} 種色碼寫法，調整後會對齊`
                          : formatRgbLabel(current)
                      }
                      aria-label={`調整同色組 ${formatRgbLabel(current)}`}
                      aria-expanded={isEditing}
                      onClick={() =>
                        setEditing(
                          isEditing
                            ? null
                            : {
                                anchorKey: group.id,
                                originals,
                                site: undefined,
                              },
                        )
                      }
                    >
                      <span
                        className="swatch"
                        style={{ background: current }}
                      />
                    </button>
                    <div className="color-meta">
                      <code className="color-code" title={current}>
                        {formatRgbLabel(current)}
                      </code>
                      {prevColor && (
                        <code
                          className="color-code color-code-prev"
                          title={prevColor}
                        >
                          前：{formatRgbLabel(prevColor)}
                        </code>
                      )}
                      <span className="color-hint">
                        {writingHint}
                        {group.count} 處 ·{' '}
                        {group.layers.slice(0, 2).join(', ')}
                        {group.layers.length > 2 ? '…' : ''}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {groupMode === 'fine' &&
            fineGroups.map((group) => {
              const isCollapsed = collapsed.has(group.id)
              const changedInGroup = group.items.filter((site) => {
                const current = siteCurrent(site, remap, siteRemap)
                return current !== site.color
              }).length

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
                      {group.items.map((site) => {
                        const current = siteCurrent(site, remap, siteRemap)
                        const prevColor = previousSites[site.id]
                        const hasPrevious =
                          typeof prevColor === 'string' &&
                          prevColor !== current
                        const changed = current !== site.color
                        const isEditing = editing?.anchorKey === site.id
                        return (
                          <li
                            key={site.id}
                            className={`color-row ${changed ? 'is-changed' : ''} ${isEditing ? 'is-editing' : ''}`}
                          >
                            <button
                              type="button"
                              className="swatch-wrap"
                              data-swatch-key={site.id}
                              title={formatRgbLabel(current)}
                              aria-label={`調整 ${site.layerId} ${site.property}`}
                              aria-expanded={isEditing}
                              onClick={() =>
                                setEditing(
                                  isEditing
                                    ? null
                                    : {
                                        anchorKey: site.id,
                                        site,
                                      },
                                )
                              }
                            >
                              <span
                                className="swatch"
                                style={{ background: current }}
                              />
                            </button>
                            <div className="color-meta">
                              <code className="color-code" title={current}>
                                {formatRgbLabel(current)}
                              </code>
                              {hasPrevious && (
                                <code
                                  className="color-code color-code-prev"
                                  title={prevColor}
                                >
                                  前：{formatRgbLabel(prevColor)}
                                </code>
                              )}
                              <span className="color-hint">
                                {site.layerId} · {site.property}
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
        </div>
      </section>

      {editing?.site && (
        <ColorEditor
          original={editing.site.color}
          originalHint={`${editing.site.layerId} · ${editing.site.property}`}
          current={siteCurrent(editing.site, remap, siteRemap)}
          getAnchor={() => {
            const node = document.querySelector(
              `[data-swatch-key=${JSON.stringify(editing.anchorKey)}]`,
            )
            return node?.getBoundingClientRect() ?? null
          }}
          onChange={(next) =>
            onSiteColorChange(editing.site!.id, editing.site!.color, next)
          }
          onClose={closeEditor}
        />
      )}

      {editing?.originals && editing.originals.length > 0 && !editing.site && (
        <ColorEditor
          original={editing.originals[0]}
          originalHint={
            editing.originals.length > 1
              ? `目前同色 ${editing.originals.length} 筆一次更改`
              : undefined
          }
          current={remap[editing.originals[0]] ?? editing.originals[0]}
          getAnchor={() => {
            const node = document.querySelector(
              `[data-swatch-key=${JSON.stringify(editing.anchorKey)}]`,
            )
            return node?.getBoundingClientRect() ?? null
          }}
          onChange={(next) => onColorChange(editing.originals!, next)}
          onClose={closeEditor}
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
