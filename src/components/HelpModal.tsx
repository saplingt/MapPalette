import { useEffect, useId, useRef } from 'react'

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: HelpModalProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="help-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="help-modal-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="help-modal-panel">
        <header className="help-modal-head">
          <div>
            <p className="help-modal-kicker">使用教學</p>
            <h2 id={titleId} className="help-modal-title">
              如何用這份 JSON 替換地圖顏色
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="help-modal-close"
            onClick={onClose}
            aria-label="關閉教學"
          >
            ×
          </button>
        </header>

        <div className="help-modal-body">
          <section className="help-section">
            <h3>你下載的是什麼？</h3>
            <p>
              檔案是一份完整的{' '}
              <strong>MapLibre／Mapbox Style JSON</strong>
              。它以 OpenFreeMap 官方樣式為底，把你在 MapPalette
              調整過的色碼寫回各圖層的 <code>paint</code> 屬性。地圖圖磚、字型、圖示仍使用
              OpenFreeMap 的公開位址，你通常不必自己架 tiles。
            </p>
          </section>

          <section className="help-section">
            <h3>建議流程</h3>
            <ol className="help-steps">
              <li>
                在左側選底稿（Positron／Bright／Liberty／Dark／Fiord），用色彩清單的
                「同類／同色／逐項」調整色票。
              </li>
              <li>填好「樣式名稱」，決定下載檔名與 JSON 內的 <code>name</code>。</li>
              <li>
                桌上型可用「複製／下載 JSON」。手機點「分享網址」會開系統分享（LINE、FB
                等）；若不支援則改為複製網址。
              </li>
              <li>把檔案放到你的網站（例如 <code>/styles/my-map.json</code>）。</li>
              <li>在地圖程式裡改為載入這份 style，即可替換原本顏色。</li>
            </ol>
          </section>

          <section className="help-section">
            <h3>方法一：用網址載入（最常見）</h3>
            <p>
              把 JSON 託管成可公開存取的 URL 後，建立地圖時把原本的
              OpenFreeMap style 網址換成你的檔案：
            </p>
            <pre className="help-code">{`import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const map = new maplibregl.Map({
  container: 'map',
  // 原本可能是：
  // style: 'https://tiles.openfreemap.org/styles/positron',
  style: '/styles/my-map.json',
  center: [121.5654, 25.033],
  zoom: 11,
})`}</pre>
          </section>

          <section className="help-section">
            <h3>方法二：已經有地圖時切換樣式</h3>
            <p>地圖已初始化的話，直接替換 style 即可即時換色：</p>
            <pre className="help-code">{`// 從你的伺服器載入
map.setStyle('/styles/my-map.json')

// 或先 fetch 成物件再套用
const style = await fetch('/styles/my-map.json').then((r) => r.json())
map.setStyle(style)`}</pre>
          </section>

          <section className="help-section">
            <h3>方法三：打包進前端專案</h3>
            <p>
              若不想另開 URL，也可把 JSON 當模組匯入（視 bundler 設定而定）：
            </p>
            <pre className="help-code">{`import myStyle from './styles/my-map.json'

const map = new maplibregl.Map({
  container: 'map',
  style: myStyle,
  center: [121.5654, 25.033],
  zoom: 11,
})`}</pre>
          </section>

          <section className="help-section">
            <h3>和官方網址差在哪？</h3>
            <ul>
              <li>
                <strong>官方</strong>：
                <code>https://tiles.openfreemap.org/styles/positron</code>{' '}
                （或 bright／liberty／dark／fiord）
              </li>
              <li>
                <strong>你的檔案</strong>：同樣結構，但 <code>layers</code> 裡的色彩已是你調過的版本
              </li>
              <li>
                <code>sources</code>／<code>sprite</code>／<code>glyphs</code>{' '}
                仍指向 OpenFreeMap，地圖資料來源不變
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>來源標註</h3>
            <p>
              使用 OpenFreeMap 圖磚／樣式時必須標註來源。MapLibre
              通常會自動顯示；若自行嵌入或用於印刷／影片，請加上：
            </p>
            <pre className="help-code">{`OpenFreeMap © OpenMapTiles Data from OpenStreetMap`}</pre>
            <p>
              詳見{' '}
              <a
                href="https://openfreemap.org/"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenFreeMap
              </a>
              、
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenStreetMap copyright
              </a>
              。
            </p>
          </section>

          <section className="help-section">
            <h3>色彩清單：同類／同色／逐項</h3>
            <ul>
              <li>
                <strong>同類</strong>
                （依分類）：依圖層類型分組（背景、水域、道路…）。改某一色碼時，樣式裡所有相同寫法的該色會一起變。
              </li>
              <li>
                <strong>同色</strong>
                （依分色）：把看起來一樣、寫法不同的色碼合併（如 <code>#fff</code> 與{' '}
                <code>#ffffff</code>）。改一組會一次改掉組內全部色碼。
              </li>
              <li>
                <strong>逐項</strong>
                ：每一處用色（圖層 × 屬性）各自一列，只改你點的那一筆，
                <strong>不會</strong>連動其他同色或同色碼的地方。
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h3>注意事項</h3>
            <ul>
              <li>
                「同類／同色」是依色碼批次替換；若只要改單一圖層的某一處顏色，請用「逐項」。
              </li>
              <li>
                若之後官方更新樣式，你的 JSON 不會自動同步；需要時可回 MapPalette
                重新匯出。
              </li>
              <li>匯出 JSON 後請保留地圖 attribution，勿隱藏或遮住標註。</li>
            </ul>
          </section>
        </div>

        <footer className="help-modal-foot">
          <button type="button" className="btn btn-solid" onClick={onClose}>
            知道了
          </button>
        </footer>
      </div>
    </div>
  )
}
