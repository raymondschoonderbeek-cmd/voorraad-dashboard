'use client'

import { useEffect, useRef, useState } from 'react'

interface TvStageProps {
  children: React.ReactNode
}

const CANVAS_W = 1920
const CANVAS_H = 1080

/**
 * TvStage — vaste 1920×1080 canvas, geschaald naar viewport via CSS transform.
 * De buitenrand (zwart) absorbeeert de overflow bij afwijkende schermratio's.
 * cursor: none en user-select: none — puur display, geen interactie.
 */
export default function TvStage({ children }: TvStageProps) {
  const [scale, setScale] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function bereken() {
      const vw = window.innerWidth
      const vh = window.innerHeight
      setScale(Math.min(vw / CANVAS_W, vh / CANVAS_H))
    }
    bereken()
    window.addEventListener('resize', bereken)
    return () => window.removeEventListener('resize', bereken)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0E1726',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: 'none',
        userSelect: 'none',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          background: 'var(--drg-bg)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}
