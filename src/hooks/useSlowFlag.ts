import { useEffect, useState } from 'react'

// True once `active` has stayed on for `delayMs` — used to show "taking longer than
// usual" while an AI request runs. Resets when `active` turns off.
export function useSlowFlag(active: boolean, delayMs = 12000): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setSlow(true), delayMs)
    return () => { clearTimeout(t); setSlow(false) }
  }, [active, delayMs])
  return slow
}
