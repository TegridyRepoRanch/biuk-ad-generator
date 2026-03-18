"use client"

import { ReactNode } from "react"

/**
 * Full-screen (relative to parent) overlay with spinner and elapsed time.
 * Used during AI generation calls in steps 1, 3, 4, 5.
 */
export default function LoadingOverlay({
  message = "Generating…",
  elapsed,
  children,
}: {
  message?: string
  elapsed?: number
  children?: ReactNode
}) {
  const formatElapsed = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-xl bg-zinc-900/90 px-8 py-6 shadow-lg">
        <div className="spinner spinner-lg" />
        <p className="text-sm font-medium text-zinc-200">{message}</p>
        {elapsed !== undefined && elapsed > 0 && (
          <p className="text-xs text-zinc-500">{formatElapsed(elapsed)} elapsed</p>
        )}
        {children}
      </div>
    </div>
  )
}
