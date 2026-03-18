"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"

export default function UploadPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()

  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file)
      dispatch({
        type: "SET_UPLOADED_IMAGE",
        payload: { url },
      })
    },
    [dispatch]
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

  const proceed = () => {
    dispatch({ type: "SET_STEP", payload: 5 })
    router.push("/create/copy")
  }

  const scale = Math.min(
    500 / project.format.width,
    500 / project.format.height
  )

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 4: Upload Image</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate your image using the prompt from the previous step, then upload
        it here.
      </p>

      {/* Selected prompt reminder */}
      {project.imagePrompts.selectedPromptId && (
        <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <div className="text-xs font-medium uppercase text-zinc-500">
            Your Selected Prompt
          </div>
          <p className="mt-1 text-sm text-zinc-300">
            {project.imagePrompts.prompts.find(
              (p) => p.id === project.imagePrompts.selectedPromptId
            )?.text}
          </p>
        </div>
      )}

      {/* Upload Zone */}
      <div className="mt-8">
        {!project.uploadedImage.url ? (
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
            <input
              type="file"
              accept="image/*"
              onChange={handleChange}
              className="absolute inset-0 cursor-pointer opacity-0"
              style={{ position: "relative" }}
            />
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
                  alt="Uploaded ad image"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
            <div className="flex justify-center">
              <label className="cursor-pointer rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800">
                Replace Image
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
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next: Generate Copy &rarr;
        </button>
      </div>
    </div>
  )
}
