"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { getMessageZonePosition } from "@/lib/layout-templates"
import { CopyVariation, CopyResponse } from "@/types/ad"
import { useApiCall } from "@/hooks/useApiCall"
import LoadingOverlay from "@/components/LoadingOverlay"
import ErrorBanner from "@/components/ErrorBanner"

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export default function CopyPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loading, error, elapsed, execute, clearError } = useApiCall()
  const [imageDescription, setImageDescription] = useState(
    project.uploadedImage.aiDescription || ""
  )
  const [userEdited, setUserEdited] = useState(false)
  const autoFired = useRef(false)

  // Sync aiDescription into the textarea when it arrives from Step 4,
  // but only if the user hasn't manually edited it yet
  const prevAiDesc = useRef(project.uploadedImage.aiDescription)
  useEffect(() => {
    if (
      project.uploadedImage.aiDescription &&
      project.uploadedImage.aiDescription !== prevAiDesc.current &&
      !userEdited
    ) {
      setImageDescription(project.uploadedImage.aiDescription)
    }
    prevAiDesc.current = project.uploadedImage.aiDescription
  }, [project.uploadedImage.aiDescription, userEdited])

  const selectedConcept = project.concept.angles.find(
    (a) => a.id === project.concept.selectedAngleId
  )

  const messageZonePosition = getMessageZonePosition(
    project.format.layout.messageZone,
    project.format.width,
    project.format.height
  )

  const generateCopy = useCallback(async (skipCache = false) => {
    if (!selectedConcept) return
    if (!imageDescription) {
      return
    }
    await execute(async () => {
      const res = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: selectedConcept,
          imageDescription,
          layout: project.format.layout,
          messageZonePosition,
          contrastMethod: project.format.contrastMethod,
          targetAudience: project.brief.targetAudience,
          campaignGoal: project.brief.campaignGoal,
          brandVoice: project.brief.brandVoice,
          copyDirection: project.brief.creativeResearch?.copyDirection,
          productAnalysis: project.brief.productAnalysis,
          skipCache,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to generate copy")
      }
      const data: CopyResponse = await res.json()
      if (!data.variations || data.variations.length === 0) {
        throw new Error("No copy variations returned. Try editing the image description or regenerating.")
      }
      dispatch({ type: "SET_COPY_VARIATIONS", payload: data.variations })
    })
  }, [
    selectedConcept,
    imageDescription,
    project.format,
    project.brief,
    messageZonePosition,
    dispatch,
    execute,
  ])

  // Auto-fire copy generation when page loads with all prerequisites
  // (coming from auto-chain or when imageDescription just arrived)
  useEffect(() => {
    const shouldAutoFire =
      !autoFired.current &&
      !loading &&
      project.copy.variations.length === 0 &&
      selectedConcept &&
      imageDescription.trim().length > 0

    if (shouldAutoFire) {
      autoFired.current = true
      generateCopy()
    }
  }, [imageDescription, selectedConcept, loading, project.copy.variations.length, generateCopy])

  const selectCopy = (variation: CopyVariation) => {
    dispatch({
      type: "SELECT_COPY",
      payload: {
        headline: variation.headline,
        subhead: variation.subhead,
        cta: variation.cta,
      },
    })
  }

  const proceed = () => {
    dispatch({ type: "SET_STEP", payload: 6 })
    router.push("/create/compose")
  }

  return (
    <div className="step-transition relative mx-auto max-w-3xl px-6 py-10">
      {loading && <LoadingOverlay message="Generating headlines…" elapsed={elapsed} />}
      <h1 className="text-2xl font-bold">Step 5: Headline Copy</h1>
      <p className="mt-1 text-sm text-zinc-400">
        AI analyzed your image automatically. Review the description below,
        edit if needed, then generate headlines.
      </p>

      {/* Image Preview + Description */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {project.uploadedImage.url && (
          <div className="overflow-hidden rounded-lg border border-zinc-700">
            <img
              src={project.uploadedImage.url}
              alt="Uploaded image"
              className="h-full w-full object-cover"
              style={{ maxHeight: 300 }}
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-zinc-300">
            Image description for the copywriter
          </label>
          {!imageDescription && !project.uploadedImage.aiDescription ? (
            <div className="mt-1 flex h-32 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
                Waiting for image analysis…
              </div>
            </div>
          ) : (
            <textarea
              value={imageDescription}
              onChange={(e) => {
                setImageDescription(e.target.value)
                setUserEdited(true)
              }}
              placeholder="e.g. A close-up of a woman's hands holding a coffee mug, steam rising, warm morning light, kitchen background out of focus..."
              rows={5}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          )}
          {imageDescription && (
            <p className="mt-1 text-xs text-zinc-500">
              Auto-generated by AI — edit to add context the analysis may have missed.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={generateCopy}
          disabled={loading || !selectedConcept || !imageDescription}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generate Headlines
        </button>
        {error && <ErrorBanner error={error} onRetry={generateCopy} onDismiss={clearError} />}
      </div>

      {/* Copy Variations */}
      {project.copy.variations.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pick Your Copy</h2>
            <button
              onClick={generateCopy}
              disabled={loading}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
            >
              {loading ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
          {project.copy.variations.map((variation) => {
            const hw = wordCount(variation.headline)
            const cw = wordCount(variation.cta)
            const isSelected =
              project.copy.selected?.headline === variation.headline

            return (
              <button
                key={variation.id}
                onClick={() => selectCopy(variation)}
                className={`w-full rounded-lg border p-5 text-left transition-colors ${
                  isSelected
                    ? "border-white bg-zinc-800"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xl font-bold text-white">
                      {variation.headline}
                    </p>
                    {variation.subhead && (
                      <p className="mt-1 text-sm text-zinc-300">
                        {variation.subhead}
                      </p>
                    )}
                    <div className="mt-3 inline-block rounded-md bg-zinc-700 px-3 py-1 text-sm font-semibold text-white">
                      {variation.cta}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                      {variation.hookMechanism}
                    </span>
                    <span
                      className={`text-xs ${hw > 6 ? "text-red-400" : "text-zinc-500"}`}
                    >
                      {hw} words {hw > 6 && "(over limit!)"}
                    </span>
                    <span
                      className={`text-xs ${cw > 4 ? "text-red-400" : "text-zinc-500"}`}
                    >
                      CTA: {cw} words {cw > 4 && "(over limit!)"}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-10 flex justify-between">
        <button
          onClick={() => router.push("/create/upload")}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          &larr; Back
        </button>
        <button
          onClick={proceed}
          disabled={!project.copy.selected}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next: Compose &rarr;
        </button>
      </div>
    </div>
  )
}
