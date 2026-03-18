"use client"

import { ProjectProvider } from "@/lib/store"
import StepNav from "@/components/StepNav"
import ErrorBoundary from "@/components/ErrorBoundary"

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProjectProvider>
      <div className="flex min-h-screen flex-col">
        <StepNav />
        <main className="flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </ProjectProvider>
  )
}
