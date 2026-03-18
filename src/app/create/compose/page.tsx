"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch, useUndo } from "@/lib/store"
import { getPreviewScale } from "@/lib/preview-scale"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"

type DragTarget = "text" | "product" | null
type EditingField = "headline" | "subhead" | "cta" | null

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
  const [dragTarget, setDragTarget] = useState<DragTarget>(null)
  const [removingBg, setRemovingBg] = useState(false)
  const [editing, setEditing] = useState<EditingField>(null)
  const [selectedElement, setSelectedElement] = useState<"text" | "product" | null>("text")
  const editRef = useRef<HTMLDivElement>(null)

  // Product image from scraped data
  const productImageUrl = project.brief.productCutoutUrl || project.brief.productHeroUrl
  const productLayer = project.composition.productImage

  // Auto-enable product layer when compose loads if a product image exists but layer isn't initialized
  useEffect(() => {
    if (productImageUrl && !productLayer) {
      dispatch({
        type: "SET_PRODUCT_IMAGE",
        payload: {
          url: productImageUrl,
          position: { x: width * 0.35, y: height * 0.35 },
          scale: 0.8,
          rotation: 0,
          opacity: 1,
          visible: true,
        },
      })
    }
  }, [productImageUrl, productLayer, dispatch, width, height])

  // Auto-upgrade product layer to cutout when it becomes available
  // (e.g., async cutout generation finishes after compose already loaded with hero)
  const prevCutoutUrl = useRef(project.brief.productCutoutUrl)
  useEffect(() => {
    if (
      project.brief.productCutoutUrl &&
      project.brief.productCutoutUrl !== prevCutoutUrl.current &&
      productLayer?.visible &&
      productLayer.url === project.brief.productHeroUrl
    ) {
      dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { url: project.brief.productCutoutUrl } })
    }
    prevCutoutUrl.current = project.brief.productCutoutUrl
  }, [project.brief.productCutoutUrl, project.brief.productHeroUrl, productLayer, dispatch])

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

  // ── Inline editing ─────────────────────────────────────────────
  const startEditing = (field: EditingField) => {
    if (dragging) return
    setEditing(field)
    setSelectedElement("text")
    // Focus the contentEditable after React re-renders
    setTimeout(() => editRef.current?.focus(), 0)
  }

  const finishEditing = useCallback(() => {
    if (!editing || !editRef.current) {
      setEditing(null)
      return
    }
    const newText = editRef.current.innerText.trim()
    if (!newText || !project.copy.selected) {
      setEditing(null)
      return
    }

    const updated = { ...project.copy.selected }
    if (editing === "headline") updated.headline = newText
    else if (editing === "subhead") updated.subhead = newText
    else if (editing === "cta") updated.cta = newText

    dispatch({ type: "SELECT_COPY", payload: updated })
    setEditing(null)
  }, [editing, project.copy.selected, dispatch])

  // Finish editing on Escape or Enter
  useEffect(() => {
    if (!editing) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault()
        finishEditing()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [editing, finishEditing])

  // Click outside to deselect / finish editing
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (previewRef.current && !previewRef.current.contains(e.target as Node)) {
        if (editing) finishEditing()
        setSelectedElement(null)
      }
    }
    window.addEventListener("mousedown", handleClickOutside)
    return () => window.removeEventListener("mousedown", handleClickOutside)
  }, [editing, finishEditing])

  // ── Pointer-agnostic drag (mouse + touch) ───────────────────────
  const getPointerPos = (e: MouseEvent | TouchEvent) => {
    if ("touches" in e) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    return { x: e.clientX, y: e.clientY }
  }

  const handleTextPointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (editing) return // don't start drag while editing
      e.preventDefault()
      e.stopPropagation()
      setSelectedElement("text")
      const pos =
        "touches" in e
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: e.clientX, y: e.clientY }
      setDragging(true)
      setDragTarget("text")
      setDragStart({
        x: pos.x - project.composition.textPosition.x * scale,
        y: pos.y - project.composition.textPosition.y * scale,
      })
    },
    [project.composition.textPosition, scale, editing]
  )

  const handleProductPointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!productLayer) return
      setSelectedElement("product")
      if (editing) finishEditing()
      const pos =
        "touches" in e
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: e.clientX, y: e.clientY }
      setDragging(true)
      setDragTarget("product")
      setDragStart({
        x: pos.x - productLayer.position.x * scale,
        y: pos.y - productLayer.position.y * scale,
      })
    },
    [productLayer, scale, editing, finishEditing]
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
          payload: {
            x: Math.round(Math.min(newX, width - 100)),
            y: Math.round(Math.min(newY, height - 50)),
          },
        })
      } else if (dragTarget === "product") {
        dispatch({
          type: "UPDATE_PRODUCT_IMAGE",
          payload: { position: { x: Math.round(newX), y: Math.round(newY) } },
        })
      }
    }

    const handleUp = () => {
      setDragging(false)
      setDragTarget(null)
    }

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
    if (editing) finishEditing()
    dispatch({ type: "SET_STEP", payload: 7 })
    router.push("/create/export")
  }

  useKeyboardShortcuts({
    onNext: project.uploadedImage.url && project.copy.selected && !editing ? proceed : undefined,
    onBack: !editing ? () => router.push("/create/copy") : undefined,
    onUndo: !editing ? undo : undefined,
    onRedo: !editing ? redo : undefined,
  })

  // Common text style helper for contrast methods
  const contrastStyles = useMemo(() => {
    const cm = project.format.contrastMethod
    return {
      textShadow: cm === "text-shadow" ? "0 2px 8px rgba(0,0,0,0.6)" : undefined,
      WebkitTextStroke: cm === "outlined-text" ? "2px rgba(0,0,0,0.5)" : undefined,
    }
  }, [project.format.contrastMethod])

  // Selection ring style
  const selectionRing = "outline outline-2 outline-[var(--accent)] outline-offset-4"

  return (
    <div className="step-transition mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Step 6: Compose</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Drag to move. Double-click text to edit. Style with the panel on the right.
          </p>
        </div>
        {selectedElement && (
          <span className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-medium text-[var(--accent)]">
            {selectedElement === "text" ? "Text selected" : "Product selected"}
          </span>
        )}
      </div>

      {/* Safe zone warning */}
      {safeZoneWarning && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          {safeZoneWarning} — some platforms may crop this area
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        {/* ── Canvas Preview ──────────────────────────────────────── */}
        <div className="flex justify-center">
          <div
            ref={previewRef}
            className="relative overflow-hidden rounded-lg border border-zinc-700"
            style={{ width: width * scale, height: height * scale }}
            onClick={() => {
              if (editing) finishEditing()
              setSelectedElement(null)
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
              <div className="absolute inset-0" style={{ background: gradientCSS }} />
            )}

            {/* Product Image Layer */}
            {productLayer?.visible && productLayer.url && (
              <div
                onMouseDown={handleProductPointerDown}
                onTouchStart={handleProductPointerDown}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedElement("product")
                }}
                className={`absolute cursor-move touch-none ${selectedElement === "product" ? selectionRing : ""}`}
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
              className="pointer-events-none absolute border border-dashed border-red-500/40 bg-red-500/5"
              style={{
                top: project.format.safeZones.top * scale,
                left: project.format.safeZones.left * scale,
                width: (width - project.format.safeZones.left - project.format.safeZones.right) * scale,
                height: (height - project.format.safeZones.top - project.format.safeZones.bottom) * scale,
              }}
            />

            {/* Empty state */}
            {!project.copy.selected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="rounded-lg bg-zinc-900/80 px-4 py-2 text-sm text-zinc-400">
                  No copy selected — go back to Step 5
                </p>
              </div>
            )}

            {/* ── Text Overlay (draggable + inline-editable) ──── */}
            {project.copy.selected && (
              <div
                onMouseDown={handleTextPointerDown}
                onTouchStart={handleTextPointerDown}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedElement("text")
                }}
                className={`absolute touch-none ${editing ? "" : "cursor-move"} ${selectedElement === "text" ? selectionRing : ""}`}
                style={{
                  left: project.composition.textPosition.x * scale,
                  top: project.composition.textPosition.y * scale,
                  maxWidth: width * 0.8 * scale,
                }}
              >
                {/* Solid block contrast */}
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
                  {/* ── Headline (double-click to edit) ── */}
                  {editing === "headline" ? (
                    <div
                      ref={editRef}
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={finishEditing}
                      className="cursor-text outline-none ring-1 ring-[var(--accent)]"
                      style={{
                        fontSize: project.composition.headlineFontSize * scale,
                        fontFamily: project.composition.headlineFontFamily,
                        fontWeight: project.composition.headlineFontWeight,
                        color: project.composition.headlineColor,
                        textAlign: project.composition.headlineAlign,
                        lineHeight: 1.1,
                        ...contrastStyles,
                        minWidth: 40,
                      }}
                      dangerouslySetInnerHTML={{ __html: project.copy.selected.headline }}
                    />
                  ) : (
                    <p
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startEditing("headline")
                      }}
                      className="cursor-text"
                      title="Double-click to edit"
                      style={{
                        fontSize: project.composition.headlineFontSize * scale,
                        fontFamily: project.composition.headlineFontFamily,
                        fontWeight: project.composition.headlineFontWeight,
                        color: project.composition.headlineColor,
                        textAlign: project.composition.headlineAlign,
                        lineHeight: 1.1,
                        ...contrastStyles,
                      }}
                    >
                      {project.copy.selected.headline}
                    </p>
                  )}

                  {/* ── Subhead (double-click to edit) ── */}
                  {project.copy.selected.subhead != null && (
                    editing === "subhead" ? (
                      <div
                        ref={editRef}
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={finishEditing}
                        className="cursor-text outline-none ring-1 ring-[var(--accent)]"
                        style={{
                          fontSize: (project.composition.subheadFontSize || 28) * scale,
                          color: project.composition.subheadColor || "#cccccc",
                          fontFamily: project.composition.headlineFontFamily,
                          fontWeight: 400,
                          textAlign: project.composition.headlineAlign,
                          marginTop: 4 * scale,
                          ...contrastStyles,
                          minWidth: 40,
                        }}
                        dangerouslySetInnerHTML={{ __html: project.copy.selected.subhead || "" }}
                      />
                    ) : (
                      <p
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          startEditing("subhead")
                        }}
                        className="cursor-text"
                        title="Double-click to edit"
                        style={{
                          fontSize: (project.composition.subheadFontSize || 28) * scale,
                          color: project.composition.subheadColor || "#cccccc",
                          fontFamily: project.composition.headlineFontFamily,
                          fontWeight: 400,
                          textAlign: project.composition.headlineAlign,
                          marginTop: 4 * scale,
                          textShadow: contrastStyles.textShadow,
                        }}
                      >
                        {project.copy.selected.subhead}
                      </p>
                    )
                  )}

                  {/* ── CTA Button (double-click to edit) ── */}
                  {editing === "cta" ? (
                    <div
                      ref={editRef}
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={finishEditing}
                      className="cursor-text outline-none ring-1 ring-[var(--accent)]"
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
                        minWidth: 40,
                      }}
                      dangerouslySetInnerHTML={{ __html: project.copy.selected.cta }}
                    />
                  ) : (
                    <div
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startEditing("cta")
                      }}
                      className="cursor-text"
                      title="Double-click to edit"
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
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Controls Panel ──────────────────────────────────────── */}
        <div className="space-y-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
          {/* Inline text editing fields */}
          {project.copy.selected && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300">Text Content</h3>
              <div className="mt-2 space-y-2">
                <div>
                  <label className="text-xs text-zinc-500">Headline</label>
                  <input
                    type="text"
                    value={project.copy.selected.headline}
                    onChange={(e) =>
                      dispatch({
                        type: "SELECT_COPY",
                        payload: { ...project.copy.selected!, headline: e.target.value },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Subhead</label>
                  <input
                    type="text"
                    value={project.copy.selected.subhead || ""}
                    onChange={(e) =>
                      dispatch({
                        type: "SELECT_COPY",
                        payload: { ...project.copy.selected!, subhead: e.target.value || undefined },
                      })
                    }
                    placeholder="Optional subhead"
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">CTA</label>
                  <input
                    type="text"
                    value={project.copy.selected.cta}
                    onChange={(e) =>
                      dispatch({
                        type: "SELECT_COPY",
                        payload: { ...project.copy.selected!, cta: e.target.value },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-zinc-300">Headline Style</h3>
            <div className="mt-2 space-y-3">
              <div>
                <label className="text-xs text-zinc-500">Font Size</label>
                <input
                  type="range" min={24} max={120}
                  value={project.composition.headlineFontSize}
                  onChange={(e) => dispatch({ type: "UPDATE_COMPOSITION", payload: { headlineFontSize: Number(e.target.value) } })}
                  className="w-full"
                />
                <span className="text-xs text-zinc-500">{project.composition.headlineFontSize}px</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-500">Weight</label>
                  <select
                    value={project.composition.headlineFontWeight}
                    onChange={(e) => dispatch({ type: "UPDATE_COMPOSITION", payload: { headlineFontWeight: Number(e.target.value) } })}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                  >
                    {[400, 500, 600, 700, 800, 900].map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Color</label>
                  <input
                    type="color"
                    value={project.composition.headlineColor}
                    onChange={(e) => dispatch({ type: "UPDATE_COMPOSITION", payload: { headlineColor: e.target.value } })}
                    className="mt-0.5 h-8 w-full cursor-pointer rounded border border-zinc-700"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500">Font Family</label>
                <select
                  value={project.composition.headlineFontFamily}
                  onChange={(e) => dispatch({ type: "UPDATE_COMPOSITION", payload: { headlineFontFamily: e.target.value } })}
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
                <label className="text-xs text-zinc-500">Alignment</label>
                <div className="mt-1 flex gap-1">
                  {(["left", "center", "right"] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => dispatch({ type: "UPDATE_COMPOSITION", payload: { headlineAlign: align } })}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-500">Background</label>
                  <input type="color" value={project.composition.ctaStyle.backgroundColor}
                    onChange={(e) => dispatch({ type: "SET_CTA_STYLE", payload: { backgroundColor: e.target.value } })}
                    className="mt-0.5 h-8 w-full cursor-pointer rounded border border-zinc-700" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Text Color</label>
                  <input type="color" value={project.composition.ctaStyle.textColor}
                    onChange={(e) => dispatch({ type: "SET_CTA_STYLE", payload: { textColor: e.target.value } })}
                    className="mt-0.5 h-8 w-full cursor-pointer rounded border border-zinc-700" />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Font Size</label>
                <input type="range" min={14} max={48} value={project.composition.ctaStyle.fontSize}
                  onChange={(e) => dispatch({ type: "SET_CTA_STYLE", payload: { fontSize: Number(e.target.value) } })}
                  className="w-full" />
                <span className="text-xs text-zinc-500">{project.composition.ctaStyle.fontSize}px</span>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Border Radius</label>
                <input type="range" min={0} max={32} value={project.composition.ctaStyle.borderRadius}
                  onChange={(e) => dispatch({ type: "SET_CTA_STYLE", payload: { borderRadius: Number(e.target.value) } })}
                  className="w-full" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-300">Overlay</h3>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={!!project.composition.overlayGradient}
                  onChange={(e) => dispatch({ type: "SET_OVERLAY_GRADIENT", payload: e.target.checked
                    ? { direction: "to top", from: "rgba(0,0,0,0.8)", to: "transparent", coverage: 50 }
                    : undefined })}
                  className="rounded" />
                Gradient overlay
              </label>
              {project.composition.overlayGradient && (
                <select value={project.composition.overlayGradient.direction}
                  onChange={(e) => dispatch({ type: "SET_OVERLAY_GRADIENT", payload: { ...project.composition.overlayGradient!, direction: e.target.value } })}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100">
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
                  <input type="checkbox" checked={!!productLayer?.visible}
                    onChange={(e) => {
                      if (e.target.checked && !productLayer) {
                        dispatch({ type: "SET_PRODUCT_IMAGE", payload: {
                          url: productImageUrl, position: { x: width * 0.3, y: height * 0.3 },
                          scale: 1, rotation: 0, opacity: 1, visible: true,
                        }})
                      } else {
                        dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { visible: e.target.checked } })
                      }
                    }}
                    className="rounded" />
                  Show product image
                </label>

                {productLayer?.visible && (
                  <>
                    <div>
                      <label className="text-xs text-zinc-500">Scale</label>
                      <input type="range" min={10} max={200} value={Math.round((productLayer.scale || 1) * 100)}
                        onChange={(e) => dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { scale: Number(e.target.value) / 100 } })}
                        className="w-full" />
                      <span className="text-xs text-zinc-500">{Math.round((productLayer.scale || 1) * 100)}%</span>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">Opacity</label>
                      <input type="range" min={10} max={100} value={Math.round((productLayer.opacity || 1) * 100)}
                        onChange={(e) => dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { opacity: Number(e.target.value) / 100 } })}
                        className="w-full" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-zinc-500">Rotation</label>
                        {(productLayer.rotation || 0) !== 0 && (
                          <button onClick={() => dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { rotation: 0 } })}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300">Reset</button>
                        )}
                      </div>
                      <input type="range" min={-180} max={180} value={productLayer.rotation || 0}
                        onChange={(e) => dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { rotation: Number(e.target.value) } })}
                        className="w-full" />
                      <span className="text-xs text-zinc-500">{productLayer.rotation || 0}&deg;</span>
                    </div>
                    {project.brief.productCutoutUrl && project.brief.productHeroUrl ? (
                      <div className="flex gap-1">
                        <button onClick={() => dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { url: project.brief.productCutoutUrl! } })}
                          className={`flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${productLayer.url === project.brief.productCutoutUrl ? "border-white bg-zinc-800 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                          Cutout
                        </button>
                        <button onClick={() => dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { url: project.brief.productHeroUrl! } })}
                          className={`flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors ${productLayer.url === project.brief.productHeroUrl ? "border-white bg-zinc-800 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                          Original
                        </button>
                      </div>
                    ) : project.brief.productHeroUrl && !project.brief.productCutoutUrl ? (
                      <button disabled={removingBg}
                        onClick={async () => {
                          setRemovingBg(true)
                          try {
                            const res = await fetch("/api/remove-background", { method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ imageUrl: project.brief.productHeroUrl, productId: project.brief.productId }) })
                            const data = await res.json()
                            if (res.ok && data.cutoutUrl) {
                              dispatch({ type: "SET_BRIEF", payload: { productCutoutUrl: data.cutoutUrl } })
                              dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { url: data.cutoutUrl } })
                            }
                          } catch { /* user still has original */ } finally { setRemovingBg(false) }
                        }}
                        className="w-full rounded border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40">
                        {removingBg ? "Removing background..." : "Remove Background"}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-zinc-900 p-3 text-xs text-zinc-500">
            <p>Position: {project.composition.textPosition.x}, {project.composition.textPosition.y}</p>
            <p>Canvas: {width}x{height}</p>
            <p className="mt-1 text-zinc-600">Tip: Double-click text on canvas to edit inline</p>
          </div>
        </div>
      </div>

      {/* ── 2x2 Batch Preview ──────────────────────────────────── */}
      {project.batch.images.length === 2 && project.batch.copies.length === 2 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Your 2x2 Batch Preview</h2>
          <p className="mt-1 text-sm text-zinc-400">
            2 images × 2 headlines = 4 ads. Your edits above apply to all 4.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {project.batch.images.map((batchImg, imgIdx) =>
              project.batch.copies.map((batchCopy, copyIdx) => {
                const comboIdx = imgIdx * 2 + copyIdx
                const isEditing = imgIdx === 0 && copyIdx === 0
                const miniScale = Math.min(200 / width, 200 / height)
                return (
                  <div key={`${imgIdx}-${copyIdx}`} className={`relative overflow-hidden rounded-lg border-2 ${isEditing ? "border-[var(--accent)]" : "border-zinc-700"}`}
                    style={{ width: width * miniScale, height: height * miniScale }}>
                    {/* Background */}
                    {batchImg.url && (
                      <img src={batchImg.url} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                    )}
                    {/* Gradient */}
                    {gradientCSS && <div className="absolute inset-0" style={{ background: gradientCSS }} />}
                    {/* Product image */}
                    {productLayer?.visible && productLayer.url && (
                      <div className="absolute" style={{
                        left: productLayer.position.x * miniScale,
                        top: productLayer.position.y * miniScale,
                        width: `${productLayer.scale * 30}%`,
                        transform: `rotate(${productLayer.rotation || 0}deg)`,
                        opacity: productLayer.opacity,
                      }}>
                        <img src={productLayer.url} alt="" className="h-auto w-full object-contain" />
                      </div>
                    )}
                    {/* Text overlay */}
                    <div className="absolute" style={{
                      left: project.composition.textPosition.x * miniScale,
                      top: project.composition.textPosition.y * miniScale,
                      maxWidth: width * 0.8 * miniScale,
                    }}>
                      {project.format.contrastMethod === "solid-block" && (
                        <div className="pointer-events-none absolute rounded" style={{
                          background: "rgba(0,0,0,0.7)",
                          inset: `${-4 * miniScale}px ${-6 * miniScale}px`,
                        }} />
                      )}
                      <div className="relative">
                        <p style={{
                          fontSize: project.composition.headlineFontSize * miniScale,
                          fontFamily: project.composition.headlineFontFamily,
                          fontWeight: project.composition.headlineFontWeight,
                          color: project.composition.headlineColor,
                          textAlign: project.composition.headlineAlign,
                          lineHeight: 1.1,
                          ...contrastStyles,
                        }}>
                          {batchCopy.headline}
                        </p>
                        {batchCopy.subhead && (
                          <p style={{
                            fontSize: (project.composition.subheadFontSize || 28) * miniScale,
                            color: project.composition.subheadColor || "#cccccc",
                            fontFamily: project.composition.headlineFontFamily,
                            marginTop: 2 * miniScale,
                          }}>
                            {batchCopy.subhead}
                          </p>
                        )}
                        <div style={{
                          marginTop: 4 * miniScale,
                          display: "inline-block",
                          backgroundColor: project.composition.ctaStyle.backgroundColor,
                          color: project.composition.ctaStyle.textColor,
                          borderRadius: project.composition.ctaStyle.borderRadius * miniScale,
                          paddingLeft: project.composition.ctaStyle.padding.x * miniScale,
                          paddingRight: project.composition.ctaStyle.padding.x * miniScale,
                          paddingTop: project.composition.ctaStyle.padding.y * miniScale,
                          paddingBottom: project.composition.ctaStyle.padding.y * miniScale,
                          fontSize: project.composition.ctaStyle.fontSize * miniScale,
                          fontWeight: 700,
                        }}>
                          {batchCopy.cta}
                        </div>
                      </div>
                    </div>
                    {/* Label */}
                    <div className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${isEditing ? "bg-[var(--accent)] text-white" : "bg-zinc-800/80 text-zinc-400"}`}>
                      {isEditing ? "Editing" : `#${comboIdx + 1}`}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-10 flex justify-between">
        <button onClick={() => router.push("/create/copy")}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800">
          &larr; Back
        </button>
        <button onClick={proceed}
          disabled={!project.uploadedImage.url || !project.copy.selected}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40">
          Next: Export &rarr;
        </button>
      </div>
    </div>
  )
}
