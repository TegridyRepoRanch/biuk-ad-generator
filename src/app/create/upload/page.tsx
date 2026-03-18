"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { getPreviewScale } from "@/lib/preview-scale"
import { useApiCall } from "@/hooks/useApiCall"
import LoadingOverlay from "@/components/LoadingOverlay"
import ErrorBanner from "@/components/ErrorBanner"

async function imageUrlToBase64(url: string): Promise<{ base64: string; mediaType: string }> {
  const res = await fetch(url)
  const blob = await res.blob()
  const buffer = await blob.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  )
  const mediaType = blob.type || "image/png"
  return { base64, mediaType }
}

async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const buffer = await file.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  )
  return { base64, mediaType: file.type || "image/png" }
}

export default function UploadPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const { loading: generating, error: genError, elapsed, execute, clearError } = useApiCall()

  const [dragging, setDragging] = useState(false)
  const [mode, setMode] = useState<"generate" | "upload">("generate")
  const [describing, setDescribing] = useState(false)
  const describeAbortRef = useRef<AbortController | null>(null)

  const selectedPrompt = project.imagePrompts.prompts.find(
    (p) => p.id === project.imagePrompts.selectedPromptId
  )

  const describeImage = useCallback(
    async (base64: string, mediaType: string) => {
      describeAbortRef.current?.abort()
      const controller = new AbortController()
      describeAbortRef.current = controller

      setDescribing(true)
      try {
        const res = await fetch("/api/describe-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mediaType }),
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.description && project.uploadedImage.url) {
          dispatch({
            type: "SET_UPLOADED_IMAGE",
            payload: { url: project.uploadedImage.url, aiDescription: data.description },
          })
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        // Non-blocking — description is nice-to-have
      } finally {
        setDescribing(false)
      }
    },
    [dispatch, project.uploadedImage.url]
  )

  const handleFile = useCallback(
    async (file: File) => {
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        alert("Image must be under 10MB. Try compressing it first.")
        return
      }
      // Revoke previous blob URL to prevent memory leak
      if (project.uploadedImage.url?.startsWith("blob:")) {
        URL.revokeObjectURL(project.uploadedImage.url)
      }
      const url = URL.createObjectURL(file)
      dispatch({
        type: "SET_UPLOADED_IMAGE",
        payload: { url },
      })
      clearError()

      const { base64, mediaType } = await fileToBase64(file)
      describeImage(base64, mediaType)
    },
    [dispatch, describeImage, project.uploadedImage.url, clearError]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith("image/")) {
        handleFile(file)
      }
    },
    [handleFile]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleGenerate = async () => {
    if (!selectedPrompt) return

    await execute(async () => {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: selectedPrompt.text }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Image generation failed")
      }

      dispatch({
        type: "SET_UPLOADED_IMAGE",
        payload: { url: data.imageUrl },
      })

      // Auto-describe the generated image (data URL already has base64)
      const match = (data.imageUrl as string).match(
        /^data:(image\/\w+);base64,(.+)$/
      )
      if (match) {
        describeImage(match[2], match[1])
      }
    })
  }

  const proceed = () => {
    dispatch({ type: "SET_STEP", payload: 5 })
    router.push("/create/copy")
  }

  const scale = getPreviewScale(project.format.width, project.format.height)

  return (
    <div className="step-transition relative mx-auto max-w-3xl px-6 py-10">
      {generating && <LoadingOverlay message="Generating image with Nano Banana Pro…" elapsed={elapsed}><p className="text-xs text-zinc-500">This usually takes 10–30 seconds</p></LoadingOverlay>}
      <h1 className="text-2xl font-bold">Step 4: Generate or Upload Image</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate an image with AI using your prompt, or upload one you made
        externally.
      </p>

      {/* Selected prompt reminder */}
      {selectedPrompt && (
        <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <div className="text-xs font-medium uppercase text-zinc-500">
            Your Selected Prompt
          </div>
          <p className="mt-1 text-sm text-zinc-300">{selectedPrompt.text}</p>
        </div>
      )}

      {/* Mode toggle */}
      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setMode("generate")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "generate"
              ? "bg-white text-black"
              : "border border-zinc-700 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          AI Generate
        </button>
        <button
          onClick={() => setMode("upload")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "upload"
              ? "bg-white text-black"
              : "border border-zinc-700 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Upload File
        </button>
      </div>

      {/* Content area */}
      <div className="mt-6">
        {!project.uploadedImage.url ? (
          <>
            {mode === "generate" ? (
              <div className="space-y-4">
                <button
                  onClick={handleGenerate}
                  disabled={generating || !selectedPrompt}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-700 py-16 text-sm font-medium transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generating ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                      <span className="text-zinc-300">
                        Generating with NanoBanana Pro…
                      </span>
                    </>
                  ) : (
                    <span className="text-zinc-300">
                      Click to Generate Image
                    </span>
                  )}
                </button>

                {genError && (
                  <ErrorBanner error={genError} onRetry={handleGenerate} onDismiss={clearError} />
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`flex h-64 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                  dragging
                    ? "border-white bg-zinc-800"
                    : "border-zinc-700 hover:border-zinc-500"
                }`}
              >
                <div className="text-4xl text-zinc-600">+</div>
                <p className="mt-2 text-sm text-zinc-400">
                  Drag &amp; drop your image here, or click to browse
                </p>
                <p className="mt-1 text-xs text-zinc-500">PNG, JPG, WebP</p>
                <label className="mt-4 cursor-pointer rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800">
                  Browse Files
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleChange}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <div
                className="relative overflow-hidden rounded-lg border border-zinc-700"
                style={{
                  width: project.format.width * scale,
                  height: project.format.height * scale,
                }}
              >
                <img
                  src={project.uploadedImage.url}
                  alt="Generated ad image"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
            {/* Description status */}
            {describing && (
              <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
                Analyzing image for copywriter…
              </div>
            )}
            {!describing && project.uploadedImage.aiDescription && (
              <div className="mx-auto max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  AI Description
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  {project.uploadedImage.aiDescription}
                </p>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={generating || !selectedPrompt}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generating ? "Regenerating…" : "Regenerate"}
              </button>
              <label className="cursor-pointer rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800">
                Replace with File
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-10 flex justify-between">
        <button
          onClick={() => router.push("/create/image-prompts")}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          &larr; Back
        </button>
        <button
          onClick={proceed}
          disabled={!project.uploadedImage.url}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next: Generate Copy &rarr;
        </button>
      </div>
    </div>
  )
}
