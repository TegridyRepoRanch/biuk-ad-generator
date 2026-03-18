"use client"

import { ProjectProvider, useHydrated } from "@/lib/store"
import StepNav from "@/components/StepNav"
import ErrorBoundary from "@/components/ErrorBoundary"

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
