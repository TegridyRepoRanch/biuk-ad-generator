"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { ConceptAngle, ConceptResponse } from "@/types/ad"

export default function ConceptPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canGenerate = project.brief.description.trim().length > 10

  const generateConcepts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: project.brief.description,
          referenceAnalysis: project.brief.referenceAnalysis,
          targetAudience: project.brief.targetAudience,
          campaignGoal: project.brief.campaignGoal,
          brandVoice: project.brief.brandVoice,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to generate concepts")
      }
      const data: ConceptResponse = await res.json()
      dispatch({ type: "SET_CONCEPT_ANGLES", payload: data.angles })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [project.brief, dispatch])

  const selectAngle = (angle: ConceptAngle) => {
    dispatch({ type: "SELECT_CONCEPT", payload: angle.id })
  }

  const proceed = () => {
    if (project.concept.selectedAngleId) {
      dispatch({ type: "SET_STEP", payload: 2 })
      router.push("/create/format")
    }
  }

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      dispatch({
        type: "SET_BRIEF",
        payload: {
          referenceImages: [...project.brief.referenceImages, url],
        },
      })

      // Analyze reference in background
      const formData = new FormData()
      formData.append("image", file)
      formData.append("imageId", `ref-${Date.now()}`)

      try {
        const res = await fetch("/api/analyze-reference", {
          method: "POST",
          body: formData,
        })
        if (res.ok) {
          const analysis = await res.json()
          dispatch({
            type: "SET_BRIEF",
            payload: {
              referenceAnalysis: [...project.brief.referenceAnalysis, analysis],
            },
          })
        }
      } catch {
        // Reference analysis is optional — don't block the flow
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 1: Brief &amp; Concept</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Describe what you need. Upload reference ads if you have them. Then
        generate concept angles.
      </p>

      {/* Brief Input */}
      <div className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300">
            Client Brief *
          </label>
          <textarea
            value={project.brief.description}
            onChange={(e) =>
              dispatch({ type: "SET_BRIEF", payload: { description: e.target.value } })
            }
            placeholder="Describe the product/service, the campaign goal, and any key messages or offers..."
            rows={5}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Target Audience
            </label>
            <input
              type="text"
              value={project.brief.targetAudience || ""}
              onChange={(e) =>
                dispatch({ type: "SET_BRIEF", payload: { targetAudience: e.target.value } })
              }
              placeholder="e.g. Women 25-45, fitness enthusiasts"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Campaign Goal
            </label>
            <input
              type="text"
              value={project.brief.campaignGoal || ""}
              onChange={(e) =>
                dispatch({ type: "SET_BRIEF", payload: { campaignGoal: e.target.value } })
              }
              placeholder="e.g. Drive trial subscriptions"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Brand Voice
            </label>
            <input
              type="text"
              value={project.brief.brandVoice || ""}
              onChange={(e) =>
                dispatch({ type: "SET_BRIEF", payload: { brandVoice: e.target.value } })
              }
              placeholder="e.g. Bold, confident, playful"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Reference Uploads */}
        <div>
          <label className="block text-sm font-medium text-zinc-300">
            Reference Ads (optional)
          </label>
          <div className="mt-2 flex flex-wrap gap-3">
            {project.brief.referenceImages.map((url, i) => (
              <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg border border-zinc-700">
                <img src={url} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
                {project.brief.referenceAnalysis[i] && (
                  <div className="absolute bottom-0 left-0 right-0 bg-emerald-500/80 px-1 py-0.5 text-center text-[10px] font-bold text-black">
                    Analyzed
                  </div>
                )}
              </div>
            ))}
            <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300">
              <span className="text-2xl">+</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleReferenceUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div className="mt-8">
        <button
          onClick={generateConcepts}
          disabled={!canGenerate || loading}
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Generating..." : "Generate Concept Angles"}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {/* Concept Angles */}
      {project.concept.angles.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">Pick a Concept Angle</h2>
          <div className="mt-4 space-y-3">
            {project.concept.angles.map((angle) => (
              <button
                key={angle.id}
                onClick={() => selectAngle(angle)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  project.concept.selectedAngleId === angle.id
                    ? "border-white bg-zinc-800"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{angle.hook}</p>
                    <p className="mt-1 text-sm text-zinc-400">{angle.rationale}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-700 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                    {angle.mechanism}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Next Step */}
      {project.concept.selectedAngleId && (
        <div className="mt-8 flex justify-end">
          <button
            onClick={proceed}
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            Next: Format &amp; Layout &rarr;
          </button>
        </div>
      )}
    </div>
  )
}
