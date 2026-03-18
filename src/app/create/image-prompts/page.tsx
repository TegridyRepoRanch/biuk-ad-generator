"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { getMessageZonePosition } from "@/lib/layout-templates"
import { ImagePromptResponse } from "@/types/ad"

export default function ImagePromptsPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    setLoading(true)
    setError(null)
    try {
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
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to generate prompts")
      }
      const data: ImagePromptResponse = await res.json()
      dispatch({
        type: "SET_IMAGE_PROMPTS",
        payload: data.prompts.map((p) => ({ ...p, isEdited: false })),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [selectedConcept, project.format, messageZonePosition, dispatch])

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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 3: Image Prompts</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate image prompts based on your concept and layout. Copy them to
        your image generation tool (Midjourney, DALL-E, etc.).
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
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Generating..." : "Generate Image Prompts"}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {project.imagePrompts.prompts.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">Image Prompts</h2>
          <p className="text-sm text-zinc-400">
            Edit if needed, then copy to your image generation tool. Select one
            to continue.
          </p>
          {project.imagePrompts.prompts.map((prompt) => (
            <div
              key={prompt.id}
              className={`rounded-lg border p-4 transition-colors ${
                project.imagePrompts.selectedPromptId === prompt.id
                  ? "border-white bg-zinc-800"
                  : "border-zinc-700 bg-zinc-900"
              }`}
            >
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
                  onClick={() =>
                    dispatch({ type: "SELECT_IMAGE_PROMPT", payload: prompt.id })
                  }
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    project.imagePrompts.selectedPromptId === prompt.id
                      ? "bg-white text-black"
                      : "border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {project.imagePrompts.selectedPromptId === prompt.id
                    ? "Selected"
                    : "Select This Prompt"}
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
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next: Upload Image &rarr;
        </button>
      </div>
    </div>
  )
}
