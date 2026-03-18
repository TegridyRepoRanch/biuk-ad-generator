"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { platformOptions, platformSpecs } from "@/lib/platforms"
import { layoutTemplates, LayoutTemplate } from "@/lib/layout-templates"
import { Platform, ContrastMethod } from "@/types/ad"

const contrastMethods: { value: ContrastMethod; label: string }[] = [
  { value: "gradient-overlay", label: "Gradient Overlay" },
  { value: "solid-block", label: "Solid Color Block" },
  { value: "text-shadow", label: "Text Shadow" },
  { value: "natural-area", label: "Natural Dark/Light Area" },
  { value: "outlined-text", label: "Outlined Text" },
]

export default function FormatPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()

  const { width, height, safeZones } = project.format
  const scale = Math.min(400 / width, 500 / height)

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)

  const applyTemplate = (template: LayoutTemplate) => {
    const zones = template.getZones(width, height, safeZones)
    dispatch({ type: "SET_LAYOUT", payload: zones })
    setActiveTemplateId(template.id)
  }

  const proceed = () => {
    dispatch({ type: "SET_STEP", payload: 3 })
    router.push("/create/image-prompts")
  }

  const anchorPercent = Math.round(
    ((project.format.layout.anchorZone.width * project.format.layout.anchorZone.height) /
      (width * height)) *
      100
  )
  const messagePercent = Math.round(
    ((project.format.layout.messageZone.width * project.format.layout.messageZone.height) /
      (width * height)) *
      100
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 2: Format &amp; Layout</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Choose your platform, pick a layout template, and select a contrast
        method for text readability.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Left: Controls */}
        <div className="space-y-6">
          {/* Platform Selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Platform
            </label>
            <select
              value={project.format.platform}
              onChange={(e) =>
                dispatch({ type: "SET_PLATFORM", payload: e.target.value as Platform })
              }
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            >
              {platformOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.dimensions} ({opt.aspectRatio})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              {platformSpecs[project.format.platform].notes}
            </p>
          </div>

          {/* Layout Templates */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Layout Template
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {layoutTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    activeTemplateId === template.id
                      ? "border-white bg-zinc-800"
                      : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                  }`}
                >
                  <div className="font-medium text-zinc-200">{template.name}</div>
                  <div className="text-xs text-zinc-500">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Contrast Method */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Text Contrast Method
            </label>
            <div className="mt-2 space-y-1">
              {contrastMethods.map((cm) => (
                <button
                  key={cm.value}
                  onClick={() =>
                    dispatch({ type: "SET_CONTRAST_METHOD", payload: cm.value })
                  }
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    project.format.contrastMethod === cm.value
                      ? "border-white bg-zinc-800 text-white"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {cm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Zone Percentages */}
          <div className="flex gap-4 text-sm">
            <span className="text-zinc-400">
              Anchor: <span className="font-bold text-blue-400">{anchorPercent}%</span>
            </span>
            <span className="text-zinc-400">
              Message: <span className="font-bold text-emerald-400">{messagePercent}%</span>
            </span>
            <span className="text-zinc-400">
              Empty:{" "}
              <span className="font-bold text-zinc-300">
                {Math.max(0, 100 - anchorPercent - messagePercent)}%
              </span>
            </span>
          </div>

          {anchorPercent < 40 && (
            <p className="text-xs text-amber-400">
              Warning: Anchor zone is under 40%. Consider making it larger.
            </p>
          )}
          {anchorPercent > 80 && (
            <p className="text-xs text-amber-400">
              Warning: Anchor zone exceeds 80%. Leave room for breathing space.
            </p>
          )}
          {messagePercent > 30 && (
            <p className="text-xs text-amber-400">
              Warning: Message zone exceeds 30%. Less text = more impact.
            </p>
          )}
        </div>

        {/* Right: Canvas Preview */}
        <div className="flex flex-col items-center">
          <div
            className="relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900"
            style={{
              width: width * scale,
              height: height * scale,
            }}
          >
            {/* Safe Zones */}
            <div
              className="absolute border border-dashed border-red-500/30"
              style={{
                top: safeZones.top * scale,
                left: safeZones.left * scale,
                right: safeZones.right * scale,
                bottom: safeZones.bottom * scale,
                width: (width - safeZones.left - safeZones.right) * scale,
                height: (height - safeZones.top - safeZones.bottom) * scale,
              }}
            />

            {/* Anchor Zone */}
            <div
              className="absolute border-2 border-blue-500/60 bg-blue-500/10"
              style={{
                left: project.format.layout.anchorZone.x * scale,
                top: project.format.layout.anchorZone.y * scale,
                width: project.format.layout.anchorZone.width * scale,
                height: project.format.layout.anchorZone.height * scale,
              }}
            >
              <span className="absolute left-1 top-1 text-[10px] font-bold text-blue-400">
                ANCHOR
              </span>
            </div>

            {/* Message Zone */}
            <div
              className="absolute border-2 border-emerald-500/60 bg-emerald-500/10"
              style={{
                left: project.format.layout.messageZone.x * scale,
                top: project.format.layout.messageZone.y * scale,
                width: project.format.layout.messageZone.width * scale,
                height: project.format.layout.messageZone.height * scale,
              }}
            >
              <span className="absolute left-1 top-1 text-[10px] font-bold text-emerald-400">
                MESSAGE
              </span>
            </div>

            {/* Grid overlay (rule of thirds) */}
            {[1, 2].map((i) => (
              <div key={`v${i}`}>
                <div
                  className="absolute top-0 h-full w-px bg-zinc-700/40"
                  style={{ left: (width * (i / 3)) * scale }}
                />
                <div
                  className="absolute left-0 h-px w-full bg-zinc-700/40"
                  style={{ top: (height * (i / 3)) * scale }}
                />
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            {width}x{height} — {platformSpecs[project.format.platform].aspectRatio}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-10 flex justify-between">
        <button
          onClick={() => router.push("/create")}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          &larr; Back
        </button>
        <button
          onClick={proceed}
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
        >
          Next: Image Prompts &rarr;
        </button>
      </div>
    </div>
  )
}
