"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { getPreviewScale } from "@/lib/preview-scale"
import ErrorBanner from "@/components/ErrorBanner"

async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const buffer = await file.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  )
  return { base64, mediaType: file.type || "image/png" }
}

interface GeneratedImage {
  url: string
  status: "loading" | "done" | "error"
  error?: string
}

export default function UploadPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<"generate" | "upload">("generate")
  const [dragging, setDragging] = useState(false)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [describing, setDescribing] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const describeAbortRef = useRef<AbortController | null>(null)
  const autoFired = useRef(false)
  const latestImageUrlRef = useRef(project.uploadedImage.url)
  latestImageUrlRef.current = project.uploadedImage.url

  const selectedPrompt = project.imagePrompts.prompts.find(
    (p) => p.id === project.imagePrompts.selectedPromptId
  )

  const isGenerating = images.some((img) => img.status === "loading")
  const doneCount = images.filter((img) => img.status === "done").length

  // ── Describe image for Step 5 ──────────────────────────────────
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
        const currentUrl = latestImageUrlRef.current
        if (data.description && currentUrl) {
          dispatch({
            type: "SET_UPLOADED_IMAGE",
            payload: { url: currentUrl, aiDescription: data.description },
          })
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
      } finally {
        setDescribing(false)
      }
    },
    [dispatch]
  )

  // ── Generate a single image ────────────────────────────────────
  const generateOne = useCallback(
    async (prompt: string, index: number) => {
      setImages((prev) => {
        const next = [...prev]
        next[index] = { url: "", status: "loading" }
        return next
      })
      try {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Generation failed")
        setImages((prev) => {
          const next = [...prev]
          next[index] = { url: data.imageUrl, status: "done" }
          return next
        })
      } catch (err) {
        setImages((prev) => {
          const next = [...prev]
          next[index] = {
            url: "",
            status: "error",
            error: err instanceof Error ? err.message : "Failed",
          }
          return next
        })
      }
    },
    []
  )

  // ── Generate 3 images in parallel ──────────────────────────────
  const generateAll = useCallback(async () => {
    if (!selectedPrompt) return
    setGenError(null)
    setSelectedIdx(null)
    setImages([
      { url: "", status: "loading" },
      { url: "", status: "loading" },
      { url: "", status: "loading" },
    ])

    // Fire all 3 in parallel with slight prompt variations
    const basePrompt = selectedPrompt.text
    const variations = [
      basePrompt,
      basePrompt + " — variation with slightly different camera angle and lighting mood",
      basePrompt + " — variation with alternative color grading and atmosphere",
    ]

    await Promise.allSettled(
      variations.map((prompt, i) => generateOne(prompt, i))
    )
  }, [selectedPrompt, generateOne])

  const generateAllRef = useRef(generateAll)
  generateAllRef.current = generateAll

  // ── Select an image from the grid ──────────────────────────────
  const selectImage = useCallback(
    (idx: number) => {
      const img = images[idx]
      if (!img || img.status !== "done") return

      setSelectedIdx(idx)
      dispatch({
        type: "SET_UPLOADED_IMAGE",
        payload: { url: img.url },
      })

      // Auto-describe the selected image
      const match = img.url.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        describeImage(match[2], match[1])
      }
    },
    [images, dispatch, describeImage]
  )

  // ── File upload handler ────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        setGenError("Image must be under 10MB.")
        return
      }
      if (project.uploadedImage.url?.startsWith("blob:")) {
        URL.revokeObjectURL(project.uploadedImage.url)
      }
      const url = URL.createObjectURL(file)
      dispatch({ type: "SET_UPLOADED_IMAGE", payload: { url } })
      setGenError(null)
      setImages([])
      setSelectedIdx(null)

      const { base64, mediaType } = await fileToBase64(file)
      describeImage(base64, mediaType)
    },
    [dispatch, describeImage, project.uploadedImage.url]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file?.type.startsWith("image/")) handleFile(file)
    },
    [handleFile]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  // ── Auto-fire when arriving from Step 3 with ?auto=1 ──────────
  useEffect(() => {
    if (
      searchParams.get("auto") === "1" &&
      selectedPrompt &&
      !autoFired.current &&
      !isGenerating &&
      images.length === 0
    ) {
      autoFired.current = true
      generateAllRef.current()
    }
  }, [searchParams, selectedPrompt, isGenerating, images.length])

  // ── Auto-advance to Step 5 when image selected + described ────
  useEffect(() => {
    if (
      project.uploadedImage.url &&
      project.uploadedImage.aiDescription &&
      !describing &&
      !isGenerating &&
      autoFired.current &&
      selectedIdx !== null
    ) {
      dispatch({ type: "SET_STEP", payload: 5 })
      router.push("/create/copy?auto=1")
    }
  }, [
    project.uploadedImage.url,
    project.uploadedImage.aiDescription,
    describing,
    isGenerating,
    selectedIdx,
    dispatch,
    router,
  ])

  const proceed = () => {
    dispatch({ type: "SET_STEP", payload: 5 })
    router.push("/create/copy")
  }

  const scale = getPreviewScale(project.format.width, project.format.height)

  return (
    <div className="step-transition relative mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 4: Generate Images</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {images.length > 0
          ? `${doneCount}/3 images generated. Pick your favorite.`
          : "Generate 3 image variations from your prompt, or upload your own."}
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
          AI Generate (3x)
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

      <div className="mt-6">
        {mode === "generate" ? (
          <>
            {/* 2x2 Image Grid */}
            {images.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => img.status === "done" && selectImage(idx)}
                      disabled={img.status !== "done"}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                        selectedIdx === idx
                          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                          : img.status === "done"
                            ? "border-zinc-700 hover:border-zinc-500"
                            : "border-zinc-800"
                      }`}
                    >
                      {img.status === "loading" && (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
                          <span className="text-xs text-zinc-500">Generating…</span>
                        </div>
                      )}
                      {img.status === "done" && (
                        <>
                          <img
                            src={img.url}
                            alt={`Variation ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                          {selectedIdx === idx && (
                            <div className="absolute right-2 top-2 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white">
                              Selected
                            </div>
                          )}
                        </>
                      )}
                      {img.status === "error" && (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-900 p-3 text-center">
                          <p className="text-xs text-red-400">{img.error || "Failed"}</p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Description status */}
                {describing && selectedIdx !== null && (
                  <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
                    Analyzing selected image…
                  </div>
                )}
                {!describing && project.uploadedImage.aiDescription && selectedIdx !== null && (
                  <div className="mx-auto max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">AI Description</div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-300">{project.uploadedImage.aiDescription}</p>
                  </div>
                )}

                <div className="flex justify-center">
                  <button
                    onClick={generateAll}
                    disabled={isGenerating}
                    className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {isGenerating ? `Generating (${doneCount}/3)…` : "Regenerate All (3x)"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={generateAll}
                  disabled={isGenerating || !selectedPrompt}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-700 py-16 text-sm font-medium transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-zinc-300">
                    Click to Generate 3 Image Variations
                  </span>
                </button>
                {genError && (
                  <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
                    {genError}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Upload mode */
          project.uploadedImage.url && images.length === 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div
                  className="relative overflow-hidden rounded-lg border border-zinc-700"
                  style={{ width: project.format.width * scale, height: project.format.height * scale }}
                >
                  <img src={project.uploadedImage.url} alt="Uploaded" className="h-full w-full object-cover" />
                </div>
              </div>
              {describing && (
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
                  Analyzing image…
                </div>
              )}
              <div className="flex justify-center">
                <label className="cursor-pointer rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                  Replace
                  <input type="file" accept="image/*" onChange={handleChange} className="hidden" />
                </label>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex h-64 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                dragging ? "border-white bg-zinc-800" : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <div className="text-4xl text-zinc-600">+</div>
              <p className="mt-2 text-sm text-zinc-400">Drag &amp; drop or browse</p>
              <label className="mt-4 cursor-pointer rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                Browse Files
                <input type="file" accept="image/*" onChange={handleChange} className="hidden" />
              </label>
            </div>
          )
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
