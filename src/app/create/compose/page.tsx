"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"

export default function ComposePage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const previewRef = useRef<HTMLDivElement>(null)

  const { width, height } = project.format
  const maxPreview = 500
  const scale = Math.min(maxPreview / width, maxPreview / height)

  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
      setDragStart({
        x: e.clientX - project.composition.textPosition.x * scale,
        y: e.clientY - project.composition.textPosition.y * scale,
      })
    },
    [project.composition.textPosition, scale]
  )

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(width - 100, (e.clientX - dragStart.x) / scale))
      const newY = Math.max(0, Math.min(height - 50, (e.clientY - dragStart.y) / scale))
      dispatch({
        type: "SET_TEXT_POSITION",
        payload: { x: Math.round(newX), y: Math.round(newY) },
      })
    }

    const handleMouseUp = () => setDragging(false)

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [dragging, dragStart, scale, width, height, dispatch])

  const gradientCSS = project.composition.overlayGradient
    ? `linear-gradient(${project.composition.overlayGradient.direction}, ${project.composition.overlayGradient.from}, ${project.composition.overlayGradient.to})`
    : undefined

  const proceed = () => {
    dispatch({ type: "SET_STEP", payload: 7 })
    router.push("/create/export")
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 6: Compose</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Position your text on the image. Drag the text to move it. Adjust styling
        in the controls panel.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        {/* Preview */}
        <div className="flex justify-center">
          <div
            ref={previewRef}
            className="relative select-none overflow-hidden rounded-lg border border-zinc-700"
            style={{
              width: width * scale,
              height: height * scale,
            }}
          >
            {/* Background Image */}
            {project.uploadedImage.url && (
              <img
                src={project.uploadedImage.url}
                alt="Ad background"
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            )}

            {/* Gradient Overlay */}
            {gradientCSS && (
              <div
                className="absolute inset-0"
                style={{ background: gradientCSS }}
              />
            )}

            {/* Safe Zones Indicator */}
            <div
              className="pointer-events-none absolute border border-dashed border-red-500/20"
              style={{
                top: project.format.safeZones.top * scale,
                left: project.format.safeZones.left * scale,
                width:
                  (width -
                    project.format.safeZones.left -
                    project.format.safeZones.right) *
                  scale,
                height:
                  (height -
                    project.format.safeZones.top -
                    project.format.safeZones.bottom) *
                  scale,
              }}
            />

            {/* Text Overlay (draggable) */}
            {project.copy.selected && (
              <div
                onMouseDown={handleMouseDown}
                className="absolute cursor-move"
                style={{
                  left: project.composition.textPosition.x * scale,
                  top: project.composition.textPosition.y * scale,
                  maxWidth: (width * 0.8) * scale,
                }}
              >
                {/* Solid block contrast */}
                {project.format.contrastMethod === "solid-block" && (
                  <div
                    className="absolute inset-0 -m-2 rounded-lg"
                    style={{ background: "rgba(0,0,0,0.7)" }}
                  />
                )}

                <div className="relative">
                  <p
                    style={{
                      fontSize: project.composition.headlineFontSize * scale,
                      fontFamily: project.composition.headlineFontFamily,
                      fontWeight: project.composition.headlineFontWeight,
                      color: project.composition.headlineColor,
                      textAlign: project.composition.headlineAlign,
                      textShadow:
                        project.format.contrastMethod === "text-shadow"
                          ? "0 2px 8px rgba(0,0,0,0.6)"
                          : undefined,
                      WebkitTextStroke:
                        project.format.contrastMethod === "outlined-text"
                          ? "2px rgba(0,0,0,0.5)"
                          : undefined,
                      lineHeight: 1.1,
                    }}
                  >
                    {project.copy.selected.headline}
                  </p>

                  {project.copy.selected.subhead && (
                    <p
                      style={{
                        fontSize: (project.composition.subheadFontSize || 28) * scale,
                        color: project.composition.subheadColor || "#cccccc",
                        fontFamily: project.composition.headlineFontFamily,
                        fontWeight: 400,
                        textAlign: project.composition.headlineAlign,
                        marginTop: 4 * scale,
                        textShadow:
                          project.format.contrastMethod === "text-shadow"
                            ? "0 2px 8px rgba(0,0,0,0.6)"
                            : undefined,
                      }}
                    >
                      {project.copy.selected.subhead}
                    </p>
                  )}

                  <div
                    style={{
                      marginTop: 12 * scale,
                      display: "inline-block",
                      backgroundColor: project.composition.ctaStyle.backgroundColor,
                      color: project.composition.ctaStyle.textColor,
                      borderRadius: project.composition.ctaStyle.borderRadius * scale,
                      paddingLeft: project.composition.ctaStyle.padding.x * scale,
                      paddingRight: project.composition.ctaStyle.padding.x * scale,
                      paddingTop: project.composition.ctaStyle.padding.y * scale,
                      paddingBottom: project.composition.ctaStyle.padding.y * scale,
                      fontSize: project.composition.ctaStyle.fontSize * scale,
                      fontWeight: 700,
                    }}
                  >
                    {project.copy.selected.cta}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls Panel */}
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-zinc-300">Headline</h3>
            <div className="mt-2 space-y-3">
              <div>
                <label className="text-xs text-zinc-500">Font Size</label>
                <input
                  type="range"
                  min={24}
                  max={120}
                  value={project.composition.headlineFontSize}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_COMPOSITION",
                      payload: { headlineFontSize: Number(e.target.value) },
                    })
                  }
                  className="w-full"
                />
                <span className="text-xs text-zinc-500">
                  {project.composition.headlineFontSize}px
                </span>
              </div>

              <div>
                <label className="text-xs text-zinc-500">Font Weight</label>
                <select
                  value={project.composition.headlineFontWeight}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_COMPOSITION",
                      payload: { headlineFontWeight: Number(e.target.value) },
                    })
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                >
                  {[400, 500, 600, 700, 800, 900].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-500">Color</label>
                <input
                  type="color"
                  value={project.composition.headlineColor}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_COMPOSITION",
                      payload: { headlineColor: e.target.value },
                    })
                  }
                  className="h-8 w-full cursor-pointer rounded border border-zinc-700"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500">Alignment</label>
                <div className="mt-1 flex gap-1">
                  {(["left", "center", "right"] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_COMPOSITION",
                          payload: { headlineAlign: align },
                        })
                      }
                      className={`flex-1 rounded border px-2 py-1 text-xs font-medium capitalize transition-colors ${
                        project.composition.headlineAlign === align
                          ? "border-white bg-zinc-800 text-white"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-300">CTA Button</h3>
            <div className="mt-2 space-y-3">
              <div>
                <label className="text-xs text-zinc-500">Background</label>
                <input
                  type="color"
                  value={project.composition.ctaStyle.backgroundColor}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_CTA_STYLE",
                      payload: { backgroundColor: e.target.value },
                    })
                  }
                  className="h-8 w-full cursor-pointer rounded border border-zinc-700"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Text Color</label>
                <input
                  type="color"
                  value={project.composition.ctaStyle.textColor}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_CTA_STYLE",
                      payload: { textColor: e.target.value },
                    })
                  }
                  className="h-8 w-full cursor-pointer rounded border border-zinc-700"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Font Size</label>
                <input
                  type="range"
                  min={14}
                  max={48}
                  value={project.composition.ctaStyle.fontSize}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_CTA_STYLE",
                      payload: { fontSize: Number(e.target.value) },
                    })
                  }
                  className="w-full"
                />
                <span className="text-xs text-zinc-500">
                  {project.composition.ctaStyle.fontSize}px
                </span>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Border Radius</label>
                <input
                  type="range"
                  min={0}
                  max={32}
                  value={project.composition.ctaStyle.borderRadius}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_CTA_STYLE",
                      payload: { borderRadius: Number(e.target.value) },
                    })
                  }
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-300">Overlay</h3>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={!!project.composition.overlayGradient}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_OVERLAY_GRADIENT",
                      payload: e.target.checked
                        ? {
                            direction: "to top",
                            from: "rgba(0,0,0,0.8)",
                            to: "transparent",
                            coverage: 50,
                          }
                        : undefined,
                    })
                  }
                  className="rounded"
                />
                Enable gradient overlay
              </label>
              {project.composition.overlayGradient && (
                <select
                  value={project.composition.overlayGradient.direction}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_OVERLAY_GRADIENT",
                      payload: {
                        ...project.composition.overlayGradient!,
                        direction: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                >
                  <option value="to top">Bottom to Top</option>
                  <option value="to bottom">Top to Bottom</option>
                  <option value="to right">Left to Right</option>
                  <option value="to left">Right to Left</option>
                </select>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-zinc-900 p-3 text-xs text-zinc-500">
            <p>
              Text position: {project.composition.textPosition.x},{" "}
              {project.composition.textPosition.y}
            </p>
            <p>
              Canvas: {width}x{height}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-10 flex justify-between">
        <button
          onClick={() => router.push("/create/copy")}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          &larr; Back
        </button>
        <button
          onClick={proceed}
          disabled={!project.uploadedImage.url || !project.copy.selected}
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next: Export &rarr;
        </button>
      </div>
    </div>
  )
}
