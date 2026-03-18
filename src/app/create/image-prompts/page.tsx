"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { getMessageZonePosition } from "@/lib/layout-templates"
import { ImagePromptResponse } from "@/types/ad"
import { useApiCall } from "@/hooks/useApiCall"
import LoadingOverlay from "@/components/LoadingOverlay"
import ErrorBanner from "@/components/ErrorBanner"

export default function ImagePromptsPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const { loading, error, elapsed, execute, clearError } = useApiCall()

  const [copiedId, setCopiedId] = useState<string | null>(null)

  const selectedConcept = project.concept.angles.find(
    (a) => a.id === project.concept.selectedAngleId
  )

  const messageZonePosition = getMessageZonePosition(
    project.format.layout.messageZone,
    project.format.width,
    project.format.height
  )

  const generatePrompts = useCallback(async () => {
    if (!selectedConcept) return
    await execute(async () => {
      const res = await fetch("/api/image-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: selectedConcept,
          layout: project.format.layout,
          platform: project.format.platform,
          width: project.format.width,
          height: project.format.height,
          messageZonePosition,
          contrastMethod: project.format.contrastMethod,
          visualDirection: project.brief.creativeResearch?.visualDirection,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to generate prompts")
      }
      const data: ImagePromptResponse = await res.json()
      if (!data.prompts || data.prompts.length === 0) {
        throw new Error("No image prompts returned. Try regenerating.")
      }
      // Sort by rank (best first) and store
      const sorted = [...data.prompts].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      dispatch({
        type: "SET_IMAGE_PROMPTS",
        payload: sorted.map((p) => ({ ...p, isEdited: false })),
      })
    })
  }, [selectedConcept, project.format, project.brief.creativeResearch, messageZonePosition, dispatch, execute])

  // Auto-fire prompt generation when page loads with prerequisites and no prompts yet
  const autoFired = useRef(false)
  useEffect(() => {
    if (
      !autoFired.current &&
      !loading &&
      selectedConcept &&
      project.imagePrompts.prompts.length === 0
    ) {
      autoFired.current = true
      generatePrompts()
    }
  }, [selectedConcept, loading, project.imagePrompts.prompts.length, generatePrompts])

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const proceed = () => {
    dispatch({ type: "SET_STEP", payload: 4 })
    router.push("/create/upload")
  }

  return (
    <div className="step-transition relative mx-auto max-w-3xl px-6 py-10">
      {loading && <LoadingOverlay message="Generating image prompts…" elapsed={elapsed} />}
      <h1 className="text-2xl font-bold">Step 3: Image Prompts</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate image prompts based on your concept and layout. Select one
        to use for AI image generation in the next step.
      </p>

      {selectedConcept && (
        <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <div className="text-xs font-medium uppercase text-zinc-500">
            Selected Concept
          </div>
          <p className="mt-1 font-semibold text-white">{selectedConcept.hook}</p>
          <p className="mt-1 text-sm text-zinc-400">
            Text placement: {messageZonePosition} | {project.format.width}x
            {project.format.height}
          </p>
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={generatePrompts}
          disabled={loading || !selectedConcept}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generate Image Prompts
        </button>
        {error && <ErrorBanner error={error} onRetry={generatePrompts} onDismiss={clearError} />}
      </div>

      {project.imagePrompts.prompts.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Image Prompts</h2>
            <button
              onClick={generatePrompts}
              disabled={loading}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
            >
              {loading ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
          <p className="text-sm text-zinc-400">
            Ranked by AI — #1 is the strongest. Click to generate that image.
          </p>
          {project.imagePrompts.prompts.map((prompt, idx) => (
            <div
              key={prompt.id}
              className={`rounded-lg border p-4 transition-colors ${
                project.imagePrompts.selectedPromptId === prompt.id
                  ? "border-white bg-zinc-800"
                  : "border-zinc-700 bg-zinc-900"
              }`}
            >
              {/* Rank badge + reasoning */}
              <div className="mb-2 flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  idx === 0
                    ? "bg-emerald-500 text-black"
                    : idx === 1
                      ? "bg-zinc-600 text-zinc-200"
                      : "bg-zinc-700 text-zinc-400"
                }`}>
                  #{prompt.rank ?? idx + 1}
                </span>
                {prompt.reason && (
                  <span className="text-xs text-zinc-500">{prompt.reason}</span>
                )}
              </div>

              <textarea
                value={prompt.text}
                onChange={(e) =>
                  dispatch({
                    type: "EDIT_IMAGE_PROMPT",
                    payload: { id: prompt.id, text: e.target.value },
                  })
                }
                rows={4}
                className="w-full bg-transparent text-sm text-zinc-200 focus:outline-none"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => copyToClipboard(prompt.text, prompt.id)}
                  className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  {copiedId === prompt.id ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => {
                    dispatch({ type: "SELECT_IMAGE_PROMPT", payload: prompt.id })
                    dispatch({ type: "SET_STEP", payload: 4 })
                    router.push("/create/upload?auto=1")
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    project.imagePrompts.selectedPromptId === prompt.id
                      ? "bg-white text-black"
                      : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                  }`}
                >
                  {project.imagePrompts.selectedPromptId === prompt.id
                    ? "Selected"
                    : "Select & Generate"}
                </button>
                {prompt.isEdited && (
                  <span className="self-center text-xs text-amber-400">Edited</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-10 flex justify-between">
        <button
          onClick={() => router.push("/create/format")}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          &larr; Back
        </button>
        <button
          onClick={proceed}
          disabled={!project.imagePrompts.selectedPromptId}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next: Upload Image &rarr;
        </button>
      </div>
    </div>
  )
}
