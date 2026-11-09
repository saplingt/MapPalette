# MapPalette

從官方 [OpenFreeMap](https://openfreemap.org) 樣式擷取所有色彩 token，即時重新上色，並匯出已重映射的 `style.json`。

## 功能

- 切換官方樣式：Positron／Bright／Liberty／Dark／Fiord（順序同官網）
- 掃描 layers 的 paint／layout 色彩屬性（含 expression 內的字面色碼）
- 色彩清單三種檢視：**同類**（依分類批次改同色碼）、**同色**（合併相同顏色一次改）、**逐項**（每一處用色單獨改，不連動同色）
- 以 URL hash 保存樣式出處、名稱與目前色彩 JSON，分享連結即可還原目前配色
- 「修改前」顏色與前一步／後一步歷史只存在本機瀏覽器，不會隨網址分享
- 重設／複製 JSON／下載 JSON

## 快速開始

在專案根目錄執行：

```bash
npm install
npm run dev
```

於瀏覽器開啟終端機顯示的本機網址（通常為 `http://localhost:5173`）。

正式建置：

```bash
npm run build
npm run preview
```

## 分享短網址（選用）

同層的 `mappalette-shortlink`（Cloudflare Worker）可把長 hash 網址縮成短碼。  
**只有按下「分享網址」時**才會呼叫 API；以當下長網址（含色票 hash）送出，由 Worker 內容 hash 去重（無則新建、有則重用）。不會預先批次建碼。

環境變數（專案根目錄）：

| 檔案 | 用途 |
|------|------|
| `.env`／`.env.production` | 正式／預設：已部署 Worker |
| `.env.local` | 本機覆寫（已被 git ignore） |
| `.env.example` | 範例說明 |

```bash
VITE_SHORTLINK_API=https://mappalette-shortlink.saplingt.workers.dev
```

本機若要打 `wrangler dev`，在 `.env.local` 改成 `http://127.0.0.1:8787` 後重啟 `npm run dev`。  
API 失敗時會退回完整長網址並提示；未設定變數時行為與先前相同。

## OpenFreeMap 樣式網址

實際使用的端點如下（直接回傳 style JSON；加上 `/style.json` 會得到 404）：

| 樣式 | 網址 |
|------|------|
| Positron | `https://tiles.openfreemap.org/styles/positron` |
| Bright | `https://tiles.openfreemap.org/styles/bright` |
| Liberty | `https://tiles.openfreemap.org/styles/liberty` |
| Dark | `https://tiles.openfreemap.org/styles/dark` |
| Fiord | `https://tiles.openfreemap.org/styles/fiord` |

## 技術棧

Vite、React、TypeScript、Tailwind CSS v4、MapLibre GL JS

## 來源與標註

本專案以 [OpenFreeMap](https://openfreemap.org/) 公開樣式與圖磚為底，地圖資料來自 [OpenStreetMap](https://www.openstreetmap.org/copyright)。

建議標註（MapLibre 地圖上也會顯示）：

```text
OpenFreeMap © OpenMapTiles Data from OpenStreetMap
```

匯出並使用重映射後的 `style.json` 時，請保留地圖上的 attribution，並遵守 OpenFreeMap／OpenStreetMap／OpenMapTiles 的授權要求。

## 色彩清單模式

| 模式 | 意義 | 改色行為 |
|------|------|----------|
| 同類 | 依圖層分類（背景、水域、道路…） | 改某一色碼 → 樣式內相同寫法的該色一起變 |
| 同色 | 依目前顏色合併（含不同寫法） | 改一組 → 組內全部色碼一次變 |
| 逐項 | 每一處用色（圖層 × 屬性）拆開 | **只改點選的那一筆**，不連動其他同色／同色碼 |

## 色彩擷取注意事項

- 只擷取**字串字面量**色碼：`#hex`、`rgb()`／`rgba()`、`hsl()`／`hsla()`，以及常見具名色彩
- 會遞迴走訪 Mapbox style expression（如 `interpolate`、`case`、`match`）中的字串
- **不會**把 data-driven 的屬性參考或非色彩字串當成顏色
- 取色器旁有不透明度滑桿；不透明輸出 `#rrggbb`，半透明輸出 `rgba(...)`（可保留官方樣式的 alpha）
- 空白差異視為不同 token（例如 `rgb(230, 233, 229)` 與 `rgb(230,233,229)` 若同時出現會分列）
