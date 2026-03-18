"use client"

import { useState, useRef, useCallback } from "react"

/**
 * Hook for API calls with:
 * - Loading state + elapsed time tracking
 * - Debounce / request deduplication (prevents double-clicks)
 * - Error state
 */
export function useApiCall() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false)

  const startTimer = useCallback(() => {
    setElapsed(0)
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 500)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const execute = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | null> => {
      // Prevent duplicate concurrent calls
      if (inFlightRef.current) return null
      inFlightRef.current = true

      setLoading(true)
      setError(null)
      startTimer()

      try {
        const result = await fn()
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred"
        setError(message)
        return null
      } finally {
        stopTimer()
        setLoading(false)
        inFlightRef.current = false
      }
    },
    [startTimer, stopTimer]
  )

  const clearError = useCallback(() => setError(null), [])

  return { loading, error, elapsed, execute, clearError }
}
