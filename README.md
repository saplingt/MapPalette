# MapPalette

從官方 [OpenFreeMap](https://openfreemap.org) 樣式擷取所有色彩 token，即時重新上色，並匯出已重映射的 `style.json`。

## 功能

- 切換官方樣式：Positron／Bright／Dark
- 掃描 layers 的 paint／layout 色彩屬性（含 expression 內的字面色碼）
- 每個唯一色彩附取色器；全域替換後以 MapLibre 即時重繪
- 以 URL hash 保存樣式與色彩對應，分享連結即可還原
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

## OpenFreeMap 樣式網址

實際使用的端點如下（直接回傳 style JSON；加上 `/style.json` 會得到 404）：

| 樣式 | 網址 |
|------|------|
| Positron | `https://tiles.openfreemap.org/styles/positron` |
| Bright | `https://tiles.openfreemap.org/styles/bright` |
| Dark | `https://tiles.openfreemap.org/styles/dark` |

## 技術棧

Vite、React、TypeScript、Tailwind CSS v4、MapLibre GL JS

## 來源與標註

本專案以 [OpenFreeMap](https://openfreemap.org/) 公開樣式與圖磚為底，地圖資料來自 [OpenStreetMap](https://www.openstreetmap.org/copyright)。

建議標註（MapLibre 地圖上也會顯示）：

```text
OpenFreeMap © OpenMapTiles Data from OpenStreetMap
```

匯出並使用重映射後的 `style.json` 時，請保留地圖上的 attribution，並遵守 OpenFreeMap／OpenStreetMap／OpenMapTiles 的授權要求。

## 色彩擷取注意事項

- 只擷取**字串字面量**色碼：`#hex`、`rgb()`／`rgba()`、`hsl()`／`hsla()`，以及常見具名色彩
- 會遞迴走訪 Mapbox style expression（如 `interpolate`、`case`、`match`）中的字串
- **不會**把 data-driven 的屬性參考或非色彩字串當成顏色
- 取色器旁有不透明度滑桿；不透明輸出 `#rrggbb`，半透明輸出 `rgba(...)`（可保留官方樣式的 alpha）
- 空白差異視為不同 token（例如 `rgb(230, 233, 229)` 與 `rgb(230,233,229)` 若同時出現會分列）
