// The device pixel ratio, as state.
//
// Assigning a canvas's width or height clears it, and the backing store has to
// be sized in device pixels to stay sharp. So a canvas drawn once at one ratio
// goes blank the moment the ratio changes, which happens when a window moves
// between a retina and a plain display, or when the browser is zoomed. Every
// canvas therefore redraws on this rather than only on its own data.

import { useEffect, useState } from 'react'

export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => (typeof window === 'undefined'
    ? 1
    : window.devicePixelRatio || 1))

  useEffect(() => {
    // Matching the current ratio exactly means the query stops matching the
    // instant it changes, whichever direction it moves in.
    const media = window.matchMedia(`(resolution: ${String(dpr)}dppx)`)
    const on = (): void => { setDpr(window.devicePixelRatio || 1) }
    media.addEventListener('change', on)
    return () => { media.removeEventListener('change', on) }
  }, [dpr])

  return dpr
}
