"use client"

import { useState } from "react"
import { ProjectProvider, useProject, useDispatch, useHydrated } from "@/lib/store"
import StepNav from "@/components/StepNav"
import ErrorBoundary from "@/components/ErrorBoundary"

function ResumeBanner() {
  const project = useProject()
  const dispatch = useDispatch()
  const [dismissed, setDismissed] = useState(false)

  // Only show if resuming a project with actual progress
  const hasProgress = project.currentStep > 1 || project.brief.description.length > 0
  if (!hasProgress || dismissed) return null

  return (
    <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-2">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <p className="text-xs text-zinc-400">
          Resuming your ad project
          {project.currentStep > 1 && (
            <span className="text-zinc-500"> — Step {project.currentStep} of 7</span>
          )}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              if (!confirm("Start fresh? This will erase all progress, images, and settings.")) return
              dispatch({ type: "RESET" })
              setDismissed(true)
            }}
            className="text-xs text-red-400/70 transition-colors hover:text-red-400"
          >
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateContent({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <div className="flex min-h-screen flex-col">
        <StepNav />
        <main className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            <p className="text-sm text-zinc-500">Loading project…</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ResumeBanner />
      <StepNav />
      <main className="flex-1">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  )
}

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProjectProvider>
      <CreateContent>{children}</CreateContent>
    </ProjectProvider>
  )
}
