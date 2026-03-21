"use client"

import Link from "next/link"
import { useState } from "react"
import { getProjectHistory, ProjectSnapshot } from "@/lib/project-history"

const steps = [
  { label: "Concept", desc: "AI generates angles from your brief", icon: "💡" },
  { label: "Format", desc: "Pick platform + layout zones", icon: "📐" },
  { label: "Prompts", desc: "AI writes image gen prompts", icon: "✍️" },
  { label: "Upload", desc: "Generate or upload your image", icon: "🖼️" },
  { label: "Copy", desc: "AI writes headlines for your image", icon: "📝" },
  { label: "Compose", desc: "Drag text, style, preview", icon: "🎨" },
  { label: "Export", desc: "Render PNG at exact dimensions", icon: "📤" },
]

function RecentProjects({ projects }: { projects: ProjectSnapshot[] }) {
  if (projects.length === 0) return null
  return (
    <div className="mt-16 w-full max-w-3xl">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Recent Projects
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {projects.map((p) => (
          <Link
            key={p.id}
            href="/create"
            className="group flex flex-col items-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
          >
            {p.thumbnailUrl ? (
              <div className="aspect-square w-full overflow-hidden rounded-md bg-zinc-800">
                <img src={p.thumbnailUrl} alt={p.productName} className="h-full w-full object-cover" loading="lazy" />
              </div>
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md bg-zinc-800 text-2xl text-zinc-600">
                📷
              </div>
            )}
            <p className="mt-2 w-full truncate text-center text-xs font-medium text-zinc-300 group-hover:text-white">
              {p.productName}
            </p>
            <p className="text-[10px] text-zinc-600">{p.platform}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

function checkHasActiveProject(): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = localStorage.getItem("ad-creator-project")
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed.currentStep > 1 || !!parsed.brief?.description
    }
  } catch { /* ignore */ }
  return false
}

function ActiveProjectBanner() {
  const [hasActive] = useState(checkHasActiveProject)

  if (!hasActive) return null

  return (
    <div className="mt-6 w-full max-w-lg">
      <Link
        href="/create"
        className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm transition-colors hover:border-zinc-500 hover:bg-zinc-800"
      >
        <span className="text-zinc-300">Continue where you left off</span>
        <span className="text-zinc-500">&rarr;</span>
      </Link>
    </div>
  )
}

export default function Home() {
  const [history] = useState(() => getProjectHistory())

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
      {/* Subtle gradient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(99, 102, 241, 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-lg text-center">
        <div className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">
          BIUK Creative
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-white">
          Ad Generator
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-400">
          Create scroll-stopping social media ads in 7 structured steps.
          Concept first, then visual, then copy that complements your image.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Start New Ad
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>

      <ActiveProjectBanner />

      {/* Step overview */}
      <div className="relative mt-16 w-full max-w-3xl">
        <div className="grid grid-cols-7 gap-1">
          {steps.map((step, i) => (
            <div key={step.label} className="flex flex-col items-center text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/80 text-lg">
                {step.icon}
              </div>
              {i < 6 && (
                <div className="mt-0.5 mb-0.5 h-0 w-full border-t border-dashed border-zinc-800" />
              )}
              <span className="mt-1.5 text-xs font-medium text-zinc-300">
                {step.label}
              </span>
              <span className="mt-0.5 hidden text-[10px] leading-tight text-zinc-600 sm:block">
                {step.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      <RecentProjects projects={history} />

      <div className="relative mt-12 text-center text-xs text-zinc-600">
        Powered by Gemini + Nano Banana Pro
      </div>
    </div>
  )
}
