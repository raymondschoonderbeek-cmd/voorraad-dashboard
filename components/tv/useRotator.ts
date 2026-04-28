'use client'

import { useEffect, useState } from 'react'

/**
 * Geeft de huidige index terug die elke `intervalMs` milliseconden met 1 verhoogt.
 * Wraps terug naar 0 wanneer `count` bereikt is.
 */
export function useRotator(count: number, intervalMs: number): number {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (count <= 1) return
    const t = setInterval(() => {
      setIndex(i => (i + 1) % count)
    }, intervalMs)
    return () => clearInterval(t)
  }, [count, intervalMs])

  return index
}
