"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useProject } from "@/lib/store"
import { AdProject } from "@/types/ad"

const steps = [
  { number: 1, label: "Concept", path: "/create" },
  { number: 2, label: "Format", path: "/create/format" },
  { number: 3, label: "Prompts", path: "/create/image-prompts" },
  { number: 4, label: "Upload", path: "/create/upload" },
  { number: 5, label: "Copy", path: "/create/copy" },
  { number: 6, label: "Compose", path: "/create/compose" },
  { number: 7, label: "Export", path: "/create/export" },
] as const

/** Check whether a step's prerequisites are actually satisfied in state. */
function isStepReady(stepNumber: number, project: AdProject): boolean {
  switch (stepNumber) {
    case 1:
      return true
    case 2:
      return !!project.concept.selectedAngleId
    case 3:
      return !!project.concept.selectedAngleId
    case 4:
      return project.imagePrompts.prompts.length > 0
    case 5:
      return !!project.uploadedImage.url
    case 6:
      return !!project.copy.selected
    case 7:
      return !!project.copy.selected && !!project.uploadedImage.url
    default:
      return false
  }
}

function getStepTooltip(stepNumber: number, project: AdProject): string | null {
  if (isStepReady(stepNumber, project)) return null
  switch (stepNumber) {
    case 2:
      return "Select a concept angle first"
    case 3:
      return "Select a concept angle first"
    case 4:
      return "Generate image prompts first"
    case 5:
      return "Upload an image first"
    case 6:
      return "Select headline copy first"
    case 7:
      return "Complete compose step first"
    default:
      return null
  }
}

export default function StepNav() {
  const pathname = usePathname()
  const project = useProject()

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-center gap-1">
        {steps.map((step, i) => {
          const isActive = pathname === step.path
          const isCompleted = project.currentStep > step.number && isStepReady(step.number, project)
          const isAccessible = step.number <= project.currentStep
          const ready = isStepReady(step.number, project)
          const tooltip = getStepTooltip(step.number, project)

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
                  href={ready ? step.path : "#"}
                  onClick={(e) => {
                    if (!ready) e.preventDefault()
                  }}
                  title={tooltip ?? step.label}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    !ready
                      ? "cursor-not-allowed text-zinc-600"
                      : isActive
                        ? "bg-zinc-800 text-white"
                        : isCompleted
                          ? "text-emerald-400 hover:bg-zinc-800/50"
                          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      !ready
                        ? "bg-zinc-800 text-zinc-600"
                        : isActive
                          ? "bg-white text-black"
                          : isCompleted
                            ? "bg-emerald-500 text-black"
                            : "bg-zinc-700 text-zinc-300"
                    }`}
                  >
                    {isCompleted && ready ? "✓" : step.number}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </Link>
              ) : (
                <div
                  title={tooltip ?? step.label}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600"
                >
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
