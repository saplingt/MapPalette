/** 將自訂名稱整理成可當下載檔名的字串（不含副檔名）。 */
export function sanitizeStyleFilename(name: string, fallback: string): string {
  const raw = name.trim() || fallback
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || fallback
}

export function styleDownloadFilename(name: string, fallback: string): string {
  const base = sanitizeStyleFilename(name, fallback).replace(/\.json$/i, '')
  return `${base}.json`
}
