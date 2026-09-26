import { useEffect, useRef } from 'react'

// One cancelable operation at a time. start() aborts any previous run and returns
// a fresh signal; cancel() aborts the current run; isCurrent() tells a finishing
// run whether it is still the latest (so a canceled run doesn't clobber a newer one).
// By default the in-flight request is also aborted when the component unmounts;
// pass abortOnUnmount: false for work that should finish in the background.
export function useAbortable({ abortOnUnmount = true } = {}) {
  const ref = useRef<AbortController | null>(null)

  useEffect(() => () => { if (abortOnUnmount) ref.current?.abort() }, [abortOnUnmount])

  return {
    start() {
      ref.current?.abort()
      ref.current = new AbortController()
      return ref.current.signal
    },
    cancel() {
      ref.current?.abort()
    },
    isCurrent(signal: AbortSignal) {
      return ref.current?.signal === signal
    },
  }
}
