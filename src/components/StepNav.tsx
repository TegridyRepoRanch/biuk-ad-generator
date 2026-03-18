"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useProject } from "@/lib/store"

const steps = [
  { number: 1, label: "Concept", path: "/create" },
  { number: 2, label: "Format", path: "/create/format" },
  { number: 3, label: "Prompts", path: "/create/image-prompts" },
  { number: 4, label: "Upload", path: "/create/upload" },
  { number: 5, label: "Copy", path: "/create/copy" },
  { number: 6, label: "Compose", path: "/create/compose" },
  { number: 7, label: "Export", path: "/create/export" },
] as const

export default function StepNav() {
  const pathname = usePathname()
  const project = useProject()

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-center gap-1">
        {steps.map((step, i) => {
          const isActive = pathname === step.path
          const isCompleted = project.currentStep > step.number
          const isAccessible = step.number <= project.currentStep

          return (
            <div key={step.number} className="flex items-center">
              {i > 0 && (
                <div
                  className={`mx-1 h-px w-6 ${
                    isCompleted ? "bg-emerald-500" : "bg-zinc-700"
                  }`}
                />
              )}
              {isAccessible ? (
                <Link
                  href={step.path}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-white"
                      : isCompleted
                        ? "text-emerald-400 hover:bg-zinc-800/50"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isActive
                        ? "bg-white text-black"
                        : isCompleted
                          ? "bg-emerald-500 text-black"
                          : "bg-zinc-700 text-zinc-300"
                    }`}
                  >
                    {isCompleted ? "✓" : step.number}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </Link>
              ) : (
                <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-500">
                    {step.number}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
