'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Invisible R3F component that measures FPS and reports it
 * to a subscriber callback. Does not render anything.
 */
export default function FPSMonitor({ onFPS }: { onFPS: (fps: number) => void }) {
  const frames = useRef(0)
  const lastTime = useRef(performance.now())
  const cbRef = useRef(onFPS)
  cbRef.current = onFPS

  useFrame(() => {
    frames.current++
    const now = performance.now()
    if (now - lastTime.current >= 1000) {
      const fps = Math.round((frames.current * 1000) / (now - lastTime.current))
      cbRef.current(fps)
      frames.current = 0
      lastTime.current = now
    }
  })

  return null
}

/** Hook version for non-R3F contexts — reads from a shared global. */
let _globalFps = 0
export function setGlobalFPS(fps: number) {
  _globalFps = fps
}
export function useGlobalFPS(interval = 1000): number {
  const [fps, setFps] = useRef(0) as unknown as [number, (v: number) => void]
  // poll
  const ref = useRef(0)
  useEffect(() => {
    const id = setInterval(() => {
      if (_globalFps !== ref.current) {
        ref.current = _globalFps
      }
    }, interval)
    return () => clearInterval(id)
  }, [interval])
  void fps; void setFps
  return _globalFps
}

// Simpler: use a callback that writes to a DOM element directly
export function useFPSCallback(): (fps: number) => void {
  return useCallback((fps: number) => {
    setGlobalFPS(fps)
    const el = document.getElementById('fps-display')
    if (el) el.textContent = `${fps}`
  }, [])
}
