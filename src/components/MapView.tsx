import { useEffect, useRef } from 'react'
import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

// Vite 預打包後 import.meta.url 不再指向 dist，需手動指定 worker
setWorkerUrl(maplibreWorkerUrl)

interface MapViewProps {
  style: StyleSpecification | null
}

/** 預設視角：台北市區 */
const DEFAULT_CENTER: [number, number] = [121.5654, 25.033]
const DEFAULT_ZOOM = 11

export function MapView({ style }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'bg',
            type: 'background',
            paint: { 'background-color': '#1a2e28' },
          },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      // 圖磚 TileJSON 已含 OpenFreeMap／OpenMapTiles／OSM 標註，勿再 customAttribution 以免重複
      attributionControl: { compact: true },
    })

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
    map.on('load', () => {
      readyRef.current = true
    })

    mapRef.current = map

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !style) return

    const apply = () => {
      // 換 style 前記住相機，載入後還原，避免重設到預設中心
      const center = map.getCenter()
      const zoom = map.getZoom()
      const bearing = map.getBearing()
      const pitch = map.getPitch()

      map.setStyle(style as StyleSpecification, { diff: false })

      map.once('style.load', () => {
        map.jumpTo({
          center,
          zoom,
          bearing,
          pitch,
        })
      })
    }

    if (readyRef.current || map.isStyleLoaded()) {
      apply()
    } else {
      map.once('load', apply)
    }
  }, [style])

  return <div ref={containerRef} className="map-canvas" aria-label="地圖預覽" />
}
