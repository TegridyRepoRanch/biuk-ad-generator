"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch, useUndo } from "@/lib/store"
import { getPreviewScale } from "@/lib/preview-scale"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"

export default function ComposePage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const { undo, redo } = useUndo()
  const previewRef = useRef<HTMLDivElement>(null)

  const { width, height } = project.format
  const scale = getPreviewScale(width, height)

  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragTarget, setDragTarget] = useState<"text" | "product">("text")
  const [removingBg, setRemovingBg] = useState(false)

  // Product image from scraped data
  const productImageUrl = project.brief.productCutoutUrl || project.brief.productHeroUrl
  const productLayer = project.composition.productImage

  // ── Safe zone violation detection ────────────────────────────────
  const safeZoneWarning = useMemo(() => {
    const pos = project.composition.textPosition
    const sz = project.format.safeZones
    const violations: string[] = []
    if (pos.x < sz.left) violations.push("left")
    if (pos.y < sz.top) violations.push("top")
    if (pos.x > width - sz.right - 100) violations.push("right")
    if (pos.y > height - sz.bottom - 50) violations.push("bottom")
    return violations.length > 0 ? `Text is outside safe zone (${violations.join(", ")})` : null
  }, [project.composition.textPosition, project.format.safeZones, width, height])

  // ── Pointer-agnostic drag (mouse + touch) ───────────────────────
  const getPointerPos = (e: MouseEvent | TouchEvent) => {
    if ('touches' in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    return { x: e.clientX, y: e.clientY }
  }

  const handleTextPointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = 'touches' in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY }
      setDragging(true)
      setDragTarget("text")
      setDragStart({
        x: pos.x - project.composition.textPosition.x * scale,
        y: pos.y - project.composition.textPosition.y * scale,
      })
    },
    [project.composition.textPosition, scale]
  )

  const handleProductPointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!productLayer) return
      const pos = 'touches' in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY }
      setDragging(true)
      setDragTarget("product")
      setDragStart({
        x: pos.x - productLayer.position.x * scale,
        y: pos.y - productLayer.position.y * scale,
      })
    },
    [productLayer, scale]
  )

  useEffect(() => {
    if (!dragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      const pos = getPointerPos(e)
      const newX = Math.max(0, (pos.x - dragStart.x) / scale)
      const newY = Math.max(0, (pos.y - dragStart.y) / scale)

      if (dragTarget === "text") {
        dispatch({
          type: "SET_TEXT_POSITION",
          payload: { x: Math.round(Math.min(newX, width - 100)), y: Math.round(Math.min(newY, height - 50)) },
        })
      } else {
        dispatch({
          type: "UPDATE_PRODUCT_IMAGE",
          payload: { position: { x: Math.round(newX), y: Math.round(newY) } },
        })
      }
    }

    const handleUp = () => setDragging(false)

    window.addEventListener("mousemove", handleMove)
    window.addEventListener("mouseup", handleUp)
    window.addEventListener("touchmove", handleMove, { passive: false })
    window.addEventListener("touchend", handleUp)
    return () => {
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", handleUp)
      window.removeEventListener("touchmove", handleMove)
      window.removeEventListener("touchend", handleUp)
    }
  }, [dragging, dragStart, dragTarget, scale, width, height, dispatch])

  const gradientCSS = project.composition.overlayGradient
    ? `linear-gradient(${project.composition.overlayGradient.direction}, ${project.composition.overlayGradient.from}, ${project.composition.overlayGradient.to})`
    : undefined

  const proceed = () => {
    dispatch({ type: "SET_STEP", payload: 7 })
    router.push("/create/export")
  }

  useKeyboardShortcuts({
    onNext: project.uploadedImage.url && project.copy.selected ? proceed : undefined,
    onBack: () => router.push("/create/copy"),
    onUndo: undo,
    onRedo: redo,
  })

  return (
    <div className="step-transition mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 6: Compose</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Position your text on the image. Drag the text to move it. Adjust styling
        in the controls panel.
      </p>

      {/* Safe zone warning */}
      {safeZoneWarning && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          ⚠ {safeZoneWarning} — some platforms may crop this area
        </div>
      )}

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

            {/* Product Image Layer (draggable + rotatable) */}
            {productLayer?.visible && productLayer.url && (
              <div
                onMouseDown={handleProductPointerDown}
                onTouchStart={handleProductPointerDown}
                className="absolute cursor-move touch-none"
                style={{
                  left: productLayer.position.x * scale,
                  top: productLayer.position.y * scale,
                  width: `${productLayer.scale * 30}%`,
                  transform: `rotate(${productLayer.rotation || 0}deg)`,
                  transformOrigin: "center center",
                  opacity: productLayer.opacity,
                }}
              >
                <img
                  src={productLayer.url}
                  alt="Product"
                  draggable={false}
                  className="h-auto w-full object-contain"
                />
              </div>
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

            {/* Empty state when no copy selected */}
            {!project.copy.selected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="rounded-lg bg-zinc-900/80 px-4 py-2 text-sm text-zinc-400">
                  No copy selected — go back to Step 5
                </p>
              </div>
            )}

            {/* Text Overlay (draggable) */}
            {project.copy.selected && (
              <div
                onMouseDown={handleTextPointerDown}
                onTouchStart={handleTextPointerDown}
                className="absolute cursor-move touch-none"
                style={{
                  left: project.composition.textPosition.x * scale,
                  top: project.composition.textPosition.y * scale,
                  maxWidth: (width * 0.8) * scale,
                }}
              >
                {/* Solid block contrast — sized to wrap the text content */}
                {project.format.contrastMethod === "solid-block" && (
                  <div
                    className="pointer-events-none absolute rounded-lg"
                    style={{
                      background: "rgba(0,0,0,0.7)",
                      inset: `${-12 * scale}px ${-16 * scale}px`,
                    }}
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
                <label className="text-xs text-zinc-500">Font Family</label>
                <select
                  value={project.composition.headlineFontFamily}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_COMPOSITION",
                      payload: { headlineFontFamily: e.target.value },
                    })
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                >
                  <option value="Inter, sans-serif">Inter</option>
                  <option value="'Playfair Display', serif">Playfair Display</option>
                  <option value="'Bebas Neue', sans-serif">Bebas Neue</option>
                  <option value="'Montserrat', sans-serif">Montserrat</option>
                  <option value="'Oswald', sans-serif">Oswald</option>
                  <option value="'Raleway', sans-serif">Raleway</option>
                  <option value="'Roboto Condensed', sans-serif">Roboto Condensed</option>
                  <option value="'DM Serif Display', serif">DM Serif Display</option>
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

          {/* Product Image Layer */}
          {productImageUrl && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300">Product Image</h3>
              <div className="mt-2 space-y-3">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={!!productLayer?.visible}
                    onChange={(e) => {
                      if (e.target.checked && !productLayer) {
                        dispatch({
                          type: "SET_PRODUCT_IMAGE",
                          payload: {
                            url: productImageUrl,
                            position: { x: width * 0.3, y: height * 0.3 },
                            scale: 1,
                            rotation: 0,
                            opacity: 1,
                            visible: true,
                          },
                        })
                      } else {
                        dispatch({
                          type: "UPDATE_PRODUCT_IMAGE",
                          payload: { visible: e.target.checked },
                        })
                      }
                    }}
                    className="rounded"
                  />
                  Show product image
                </label>

                {productLayer?.visible && (
                  <>
                    <div>
                      <label className="text-xs text-zinc-500">Scale</label>
                      <input
                        type="range"
                        min={10}
                        max={200}
                        value={Math.round((productLayer.scale || 1) * 100)}
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_PRODUCT_IMAGE",
                            payload: { scale: Number(e.target.value) / 100 },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-zinc-500">
                        {Math.round((productLayer.scale || 1) * 100)}%
                      </span>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">Opacity</label>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={Math.round((productLayer.opacity || 1) * 100)}
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_PRODUCT_IMAGE",
                            payload: { opacity: Number(e.target.value) / 100 },
                          })
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-zinc-500">Rotation</label>
                        {(productLayer.rotation || 0) !== 0 && (
                          <button
                            onClick={() =>
                              dispatch({
                                type: "UPDATE_PRODUCT_IMAGE",
                                payload: { rotation: 0 },
                              })
                            }
                            className="text-[10px] text-zinc-500 hover:text-zinc-300"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={productLayer.rotation || 0}
                        onChange={(e) =>
                          dispatch({
                            type: "UPDATE_PRODUCT_IMAGE",
                            payload: { rotation: Number(e.target.value) },
                          })
                        }
                        className="w-full"
                      />
                      <span className="text-xs text-zinc-500">
                        {productLayer.rotation || 0}&deg;
                      </span>
                    </div>
                    {project.brief.productCutoutUrl && project.brief.productHeroUrl ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() =>
                            dispatch({
                              type: "UPDATE_PRODUCT_IMAGE",
                              payload: { url: project.brief.productCutoutUrl! },
                            })
                          }
                          className={`flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${
                            productLayer.url === project.brief.productCutoutUrl
                              ? "border-white bg-zinc-800 text-white"
                              : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                          }`}
                        >
                          Cutout
                        </button>
                        <button
                          onClick={() =>
                            dispatch({
                              type: "UPDATE_PRODUCT_IMAGE",
                              payload: { url: project.brief.productHeroUrl! },
                            })
                          }
                          className={`flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${
                            productLayer.url === project.brief.productHeroUrl
                              ? "border-white bg-zinc-800 text-white"
                              : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                          }`}
                        >
                          Original
                        </button>
                      </div>
                    ) : project.brief.productHeroUrl && !project.brief.productCutoutUrl ? (
                      <button
                        disabled={removingBg}
                        onClick={async () => {
                          setRemovingBg(true)
                          try {
                            const res = await fetch("/api/remove-background", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ imageUrl: project.brief.productHeroUrl }),
                            })
                            const data = await res.json()
                            if (res.ok && data.cutoutUrl) {
                              dispatch({
                                type: "SET_BRIEF",
                                payload: { productCutoutUrl: data.cutoutUrl },
                              })
                              dispatch({
                                type: "UPDATE_PRODUCT_IMAGE",
                                payload: { url: data.cutoutUrl },
                              })
                            }
                          } catch {
                            // Non-critical — user still has the original
                          } finally {
                            setRemovingBg(false)
                          }
                        }}
                        className="w-full rounded border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
                      >
                        {removingBg ? "Removing background..." : "Remove Background"}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}

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
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next: Export &rarr;
        </button>
      </div>
    </div>
  )
}
