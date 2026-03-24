'use client'

import { useEffect, useId, useMemo, useRef } from 'react'
import { DYNAMO_BLUE } from '@/lib/theme'

export type CampagneFietsMapPunt = {
  lat: number
  lng: number
  naam: string
  stad?: string | null
  voorraad: number
}

type Props = {
  punten: CampagneFietsMapPunt[]
  className?: string
  height?: number
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Leaflet-kaart NL met markers (alleen punten met geldige lat/lng) */
export function CampagneFietsNlMap({ punten, className = '', height = 320 }: Props) {
  const mapId = useId().replace(/:/g, '')
  const mapRef = useRef<{ remove: () => void } | null>(null)

  const metCoords = useMemo(
    () => punten.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [punten]
  )
  const puntenKey = useMemo(
    () => metCoords.map(p => `${p.lat},${p.lng},${p.voorraad}`).join('|'),
    [metCoords]
  )

  useEffect(() => {
    if (metCoords.length === 0) return
    if (typeof window === 'undefined') return

    const initMap = () => {
      const L = (window as unknown as { L?: any }).L
      if (!L) return
      const el = document.getElementById(mapId)
      if (!el || (el as unknown as { _leaflet_id?: number })._leaflet_id) return

      const map = L.map(mapId, { zoomControl: true, scrollWheelZoom: false })
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)

      const bounds: [number, number][] = []
      metCoords.forEach(p => {
        const icon = L.divIcon({
          html: `<div style="background:${DYNAMO_BLUE};width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold;">${p.voorraad > 9 ? '9+' : p.voorraad}</span></div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        })
        const marker = L.marker([p.lat, p.lng], { icon })
        marker.addTo(map)
        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:160px"><strong style="color:${DYNAMO_BLUE}">${escapeHtml(p.naam)}</strong><br/><span style="color:#64748b;font-size:12px">${escapeHtml(p.stad ?? '')}</span><br/><span style="font-size:13px;margin-top:4px;display:inline-block">Voorraad: <strong>${p.voorraad}</strong></span></div>`
        )
        bounds.push([p.lat, p.lng])
      })

      if (bounds.length === 1) {
        map.setView(bounds[0], 10)
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [48, 48] })
      }
    }

    if ((window as unknown as { L?: unknown }).L) {
      initMap()
    } else {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = initMap
      document.head.appendChild(script)
    }

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          /* ignore */
        }
        mapRef.current = null
      }
    }
  }, [mapId, metCoords, puntenKey])

  if (metCoords.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500 ${className}`}
        style={{ minHeight: height }}
      >
        Geen winkelcoördinaten voor deze fiets (voeg postcodes toe bij winkels en geocodeer in DRG Portal).
      </div>
    )
  }

  return <div id={mapId} className={`z-0 w-full rounded-2xl overflow-hidden border border-gray-200 ${className}`} style={{ height }} />
}
