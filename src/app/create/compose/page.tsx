"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { v4 as uuid } from "uuid"
import { useProject, useDispatch, useUndo } from "@/lib/store"
import { getPreviewScale } from "@/lib/preview-scale"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { getSnapGuides, GuideLine } from "@/lib/snap-guides"
import TextStylePanel from "./TextStylePanel"
import ProductImageControls from "./ProductImageControls"
import BatchPreviewGrid from "./BatchPreviewGrid"
import TransformBox from "@/components/TransformBox"

type EditingField = "headline" | "subhead" | "cta" | null
type EditingCustomText = { id: string } | null

export default function ComposePage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const { canUndo, canRedo, undo, redo } = useUndo()
  const previewRef = useRef<HTMLDivElement>(null)

  const { width, height } = project.format
  const autoScale = getPreviewScale(width, height)
  const [zoomLevel, setZoomLevel] = useState<number | null>(null) // null = auto-fit
  const scale = zoomLevel ?? autoScale

  const [editing, setEditing] = useState<EditingField>(null)
  const [editingCustomText, setEditingCustomText] = useState<EditingCustomText>(null)
  const [selectedElement, setSelectedElement] = useState<"text" | "product" | null>("text")
  const editRef = useRef<HTMLDivElement>(null)
  const [guides, setGuides] = useState<GuideLine[]>([])

  // Text block size (defaults from store or fallback)
  const textSize = useMemo(
    () => project.composition.textSize || { width: width * 0.8, height: 200 },
    [project.composition.textSize, width]
  )

  // Product image from scraped data
  const productImageUrl = project.brief.productCutoutUrl || project.brief.productHeroUrl
  const productLayer = project.composition.productImage

  // CTA visibility
  const showCta = !!(project.copy.selected?.cta)
  const showSubhead = project.copy.selected?.subhead != null && project.copy.selected.subhead !== ""

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
    setEditing(field)
    setEditingCustomText(null)
    setSelectedElement("text")
    setTimeout(() => editRef.current?.focus(), 0)
  }

  const startEditingCustomText = (id: string) => {
    setEditingCustomText({ id })
    setEditing(null)
    setSelectedElement("text")
    setTimeout(() => editRef.current?.focus(), 0)
  }

  const finishEditing = useCallback(() => {
    if (editingCustomText) {
      if (!editRef.current) {
        setEditingCustomText(null)
        return
      }
      const newText = editRef.current.innerText
      dispatch({
        type: "UPDATE_CUSTOM_TEXT",
        payload: { id: editingCustomText.id, updates: { text: newText } },
      })
      setEditingCustomText(null)
      return
    }

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
  }, [editing, editingCustomText, project.copy.selected, dispatch])

  // Finish editing on Escape or Enter
  useEffect(() => {
    if (!editing && !editingCustomText) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault()
        finishEditing()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [editing, editingCustomText, finishEditing])

  // Click outside to deselect / finish editing
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (previewRef.current && !previewRef.current.contains(e.target as Node)) {
        if (editing || editingCustomText) finishEditing()
        setSelectedElement(null)
      }
    }
    window.addEventListener("mousedown", handleClickOutside)
    return () => window.removeEventListener("mousedown", handleClickOutside)
  }, [editing, editingCustomText, finishEditing])

  // ── TransformBox callbacks with snap guides ───────────────────
  const handleTextMove = useCallback((pos: { x: number; y: number }) => {
    const snap = getSnapGuides(
      { ...pos, width: textSize.width, height: textSize.height },
      { width, height },
      project.format.safeZones
    )
    setGuides(snap.guides)
    dispatch({
      type: "SET_TEXT_POSITION",
      payload: { x: snap.snappedX ?? pos.x, y: snap.snappedY ?? pos.y },
    })
  }, [dispatch, textSize, width, height, project.format.safeZones])

  const handleTextMoveEnd = useCallback(() => {
    setGuides([])
  }, [])

  const handleTextResize = useCallback((rect: { x: number; y: number; width: number; height: number }) => {
    dispatch({ type: "SET_TEXT_POSITION", payload: { x: rect.x, y: rect.y } })
    dispatch({ type: "UPDATE_COMPOSITION", payload: { textSize: { width: rect.width, height: rect.height } } })
  }, [dispatch])

  const handleProductMove = useCallback((pos: { x: number; y: number }) => {
    dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { position: pos } })
  }, [dispatch])

  const handleProductResize = useCallback((rect: { x: number; y: number; width: number; height: number }) => {
    dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { position: { x: rect.x, y: rect.y } } })
    const baseWidth = width * 0.3
    if (baseWidth > 0) {
      dispatch({ type: "UPDATE_PRODUCT_IMAGE", payload: { scale: rect.width / baseWidth } })
    }
  }, [dispatch, width])

  const gradientCSS = project.composition.overlayGradient
    ? `linear-gradient(${project.composition.overlayGradient.direction}, ${project.composition.overlayGradient.from}, ${project.composition.overlayGradient.to})`
    : undefined

  const proceed = () => {
    if (editing) finishEditing()
    dispatch({ type: "SET_STEP", payload: 7 })
    router.push("/create/export")
  }

  // ── Delete subhead / CTA ──────────────────────────────────────
  const deleteSubhead = useCallback(() => {
    if (!project.copy.selected) return
    dispatch({ type: "SELECT_COPY", payload: { ...project.copy.selected, subhead: undefined } })
  }, [project.copy.selected, dispatch])

  const deleteCta = useCallback(() => {
    if (!project.copy.selected) return
    dispatch({ type: "SELECT_COPY", payload: { ...project.copy.selected, cta: "" } })
  }, [project.copy.selected, dispatch])

  const addSubhead = useCallback(() => {
    if (!project.copy.selected) return
    dispatch({ type: "SELECT_COPY", payload: { ...project.copy.selected, subhead: "Add your subhead" } })
  }, [project.copy.selected, dispatch])

  const addCta = useCallback(() => {
    if (!project.copy.selected) return
    dispatch({ type: "SELECT_COPY", payload: { ...project.copy.selected, cta: "Shop Now" } })
  }, [project.copy.selected, dispatch])

  const addCustomText = useCallback(() => {
    const newText: typeof project.composition.customTexts[0] = {
      id: uuid(),
      text: "New text",
      position: { x: 100, y: 300 },
      fontSize: 32,
      fontFamily: project.composition.headlineFontFamily,
      fontWeight: 400,
      color: project.composition.headlineColor,
      align: "left",
    }
    dispatch({ type: "ADD_CUSTOM_TEXT", payload: newText })
  }, [project.composition.headlineFontFamily, project.composition.headlineColor, dispatch])

  const addCallout = useCallback(() => {
    dispatch({
      type: "ADD_CALLOUT",
      payload: {
        id: uuid(),
        text: "Feature",
        position: { x: 50, y: 200 },
        anchorPoint: { x: 300, y: 300 },
        fontSize: 24,
        fontFamily: "'Inter', sans-serif",
        fontWeight: 700,
        textColor: "#1a1a1a",
        bgColor: "#FFFDE7",
        lineColor: "#D4C96B",
        dotRadius: 5,
        lineWidth: 1.5,
        borderRadius: 8,
        padding: { x: 16, y: 10 },
      },
    })
  }, [dispatch])

  // Callout drag state
  const draggingCallout = useRef<{ id: string; type: "bubble" | "anchor"; startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handleCalloutMouseDown = useCallback((e: React.MouseEvent, id: string, type: "bubble" | "anchor") => {
    e.stopPropagation()
    e.preventDefault()
    const callout = (project.composition.callouts ?? []).find(c => c.id === id)
    if (!callout) return
    draggingCallout.current = {
      id,
      type,
      startX: e.clientX,
      startY: e.clientY,
      origX: type === "bubble" ? callout.position.x : callout.anchorPoint.x,
      origY: type === "bubble" ? callout.position.y : callout.anchorPoint.y,
    }
    const onMove = (ev: MouseEvent) => {
      if (!draggingCallout.current) return
      const dx = (ev.clientX - draggingCallout.current.startX) / scale
      const dy = (ev.clientY - draggingCallout.current.startY) / scale
      const nx = draggingCallout.current.origX + dx
      const ny = draggingCallout.current.origY + dy
      if (draggingCallout.current.type === "bubble") {
        dispatch({ type: "MOVE_CALLOUT", payload: { id: draggingCallout.current.id, position: { x: nx, y: ny } } })
      } else {
        dispatch({ type: "MOVE_CALLOUT_ANCHOR", payload: { id: draggingCallout.current.id, anchorPoint: { x: nx, y: ny } } })
      }
    }
    const onUp = () => {
      draggingCallout.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [project.composition.callouts, scale, dispatch])

  useKeyboardShortcuts({
    onNext: project.uploadedImage.url && project.copy.selected && !editing && !editingCustomText ? proceed : undefined,
    onBack: !editing && !editingCustomText ? () => router.push("/create/copy") : undefined,
    onUndo: !editing && !editingCustomText ? undo : undefined,
    onRedo: !editing && !editingCustomText ? redo : undefined,
  })

  // Common text style helper for contrast methods
  const contrastStyles = useMemo(() => {
    const cm = project.format.contrastMethod
    return {
      textShadow: cm === "text-shadow" ? "0 2px 8px rgba(0,0,0,0.6)" : undefined,
      WebkitTextStroke: cm === "outlined-text" ? "2px rgba(0,0,0,0.5)" : undefined,
    }
  }, [project.format.contrastMethod])

  // ── Zoom controls ─────────────────────────────────────────────
  const zoomIn = () => setZoomLevel(Math.min((zoomLevel ?? autoScale) + 0.1, 2))
  const zoomOut = () => setZoomLevel(Math.max((zoomLevel ?? autoScale) - 0.1, 0.2))
  const zoomFit = () => setZoomLevel(null)

  return (
    <div className="step-transition mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Step 6: Compose</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Drag to move. Click text to edit. Style with the panel on the right.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Undo/Redo buttons */}
          <div className="flex gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.69 3L21 13" />
              </svg>
            </button>
          </div>
          {selectedElement && (
            <span className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-medium text-[var(--accent)]">
              {selectedElement === "text" ? "Text selected" : "Product selected"}
            </span>
          )}
        </div>
      </div>

      {/* Safe zone warning */}
      {safeZoneWarning && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          {safeZoneWarning} — some platforms may crop this area
        </div>
      )}

      {/* Zoom controls */}
      <div className="mt-4 flex items-center gap-2">
        <button onClick={zoomOut} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800">−</button>
        <span className="text-xs text-zinc-500">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800">+</button>
        {zoomLevel !== null && (
          <button onClick={zoomFit} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800">Fit</button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Canvas Preview ──────────────────────────────────────── */}
        <div className="flex justify-center overflow-auto">
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
                decoding="async"
              />
            )}

            {/* Gradient Overlay */}
            {gradientCSS && (
              <div className="absolute inset-0" style={{ background: gradientCSS }} />
            )}

            {/* Product Image Layer */}
            {productLayer?.visible && productLayer.url && (() => {
              const prodW = width * 0.3 * productLayer.scale
              const prodH = prodW
              return (
                <TransformBox
                  selected={selectedElement === "product"}
                  position={productLayer.position}
                  size={{ width: prodW, height: prodH }}
                  scale={scale}
                  onMove={handleProductMove}
                  onResize={handleProductResize}
                  onSelect={() => { setSelectedElement("product"); if (editing) finishEditing() }}
                  lockAspectRatio
                  canvasSize={{ width, height }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      transform: `rotate(${productLayer.rotation || 0}deg)`,
                      transformOrigin: "center center",
                      opacity: productLayer.opacity,
                    }}
                  >
                    <img
                      src={productLayer.url}
                      alt="Product"
                      draggable={false}
                      className="h-full w-full object-contain"
                      decoding="async"
                    />
                  </div>
                </TransformBox>
              )
            })()}

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

            {/* Snap Guides */}
            {guides.map((g, i) => (
              <div
                key={i}
                className="pointer-events-none absolute"
                style={g.axis === "x"
                  ? { left: g.position * scale, top: 0, width: 1, height: height * scale, background: "var(--accent)", opacity: 0.7 }
                  : { top: g.position * scale, left: 0, height: 1, width: width * scale, background: "var(--accent)", opacity: 0.7 }
                }
              />
            ))}

            {/* Callout Elements */}
            {(project.composition.callouts ?? []).map((callout) => {
              // Estimate bubble size
              const fs = callout.fontSize * scale
              const padX = callout.padding.x * scale
              const padY = callout.padding.y * scale
              const lines = callout.text.split('\n')
              const lineH = fs * 1.3
              const approxCharW = fs * 0.6
              const maxLineLen = Math.max(...lines.map(l => l.length))
              const bubbleW = maxLineLen * approxCharW + padX * 2
              const bubbleH = lines.length * lineH + padY * 2
              const bx = callout.position.x * scale
              const by = callout.position.y * scale
              const ax = callout.anchorPoint.x * scale
              const ay = callout.anchorPoint.y * scale
              const bcx = bx + bubbleW / 2
              const bcy = by + bubbleH / 2
              const angle = Math.atan2(ay - bcy, ax - bcx)
              const cos = Math.cos(angle)
              const sin = Math.sin(angle)
              const halfW = bubbleW / 2
              const halfH = bubbleH / 2
              let edgeX: number, edgeY: number
              if (Math.abs(cos * halfH) > Math.abs(sin * halfW)) {
                edgeX = bcx + Math.sign(cos) * halfW
                edgeY = bcy + sin * (halfW / Math.abs(cos))
              } else {
                edgeX = bcx + cos * (halfH / Math.abs(sin))
                edgeY = bcy + Math.sign(sin) * halfH
              }
              const lineLen = Math.sqrt((ax - edgeX) ** 2 + (ay - edgeY) ** 2)
              const angleDeg = Math.atan2(ay - edgeY, ax - edgeX) * 180 / Math.PI
              return (
                <div key={callout.id} className="pointer-events-none absolute inset-0">
                  {/* Leader line via rotated div */}
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      left: edgeX,
                      top: edgeY,
                      width: lineLen,
                      height: callout.lineWidth,
                      background: callout.lineColor,
                      transformOrigin: "0 50%",
                      transform: `rotate(${angleDeg}deg)`,
                    }}
                  />
                  {/* Anchor dot */}
                  <div
                    className="pointer-events-auto absolute cursor-move"
                    style={{
                      left: ax - callout.dotRadius * scale,
                      top: ay - callout.dotRadius * scale,
                      width: callout.dotRadius * scale * 2,
                      height: callout.dotRadius * scale * 2,
                      borderRadius: "50%",
                      background: callout.lineColor,
                    }}
                    onMouseDown={(e) => handleCalloutMouseDown(e, callout.id, "anchor")}
                  />
                  {/* Bubble */}
                  <div
                    className="pointer-events-auto absolute cursor-move select-none"
                    style={{
                      left: bx,
                      top: by,
                      width: bubbleW,
                      height: bubbleH,
                      background: callout.bgColor,
                      borderRadius: callout.borderRadius * scale,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: fs,
                      fontFamily: callout.fontFamily,
                      fontWeight: callout.fontWeight,
                      color: callout.textColor,
                      whiteSpace: "pre",
                      padding: `${padY}px ${padX}px`,
                      boxSizing: "border-box",
                    }}
                    onMouseDown={(e) => handleCalloutMouseDown(e, callout.id, "bubble")}
                  >
                    {callout.text}
                  </div>
                </div>
              )
            })}

            {/* Empty state */}
            {!project.copy.selected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="rounded-lg bg-zinc-900/80 px-4 py-2 text-sm text-zinc-400">
                  No copy selected — go back to Step 5
                </p>
              </div>
            )}

            {/* ── Text Overlay (TransformBox + inline-editable) ──── */}
            {project.copy.selected && (
              <TransformBox
                selected={selectedElement === "text"}
                position={project.composition.textPosition}
                size={textSize}
                scale={scale}
                onMove={handleTextMove}
                onMoveEnd={handleTextMoveEnd}
                onResize={handleTextResize}
                onSelect={() => setSelectedElement("text")}
                canvasSize={{ width, height }}
                minSize={{ width: 80, height: 40 }}
              >
              <div style={{ width: textSize.width * scale }}>
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
                  {/* ── Headline (click to edit) ── */}
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
                      onClick={(e) => {
                        e.stopPropagation()
                        startEditing("headline")
                      }}
                      className="cursor-text"
                      title="Click to edit"
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

                  {/* ── Subhead (click to edit, deletable) ── */}
                  {showSubhead && (
                    <div className="group relative">
                      {editing === "subhead" ? (
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
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditing("subhead")
                          }}
                          className="cursor-text"
                          title="Click to edit"
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
                      )}
                      {/* Delete subhead button (shows on hover) */}
                      {selectedElement === "text" && !editing && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSubhead() }}
                          className="absolute -right-2 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                          title="Remove subhead"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── CTA Button (click to edit, deletable) ── */}
                  {showCta && (
                    <div className="group relative inline-block">
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
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditing("cta")
                          }}
                          className="cursor-text"
                          title="Click to edit"
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
                      {/* Delete CTA button */}
                      {selectedElement === "text" && !editing && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteCta() }}
                          className="absolute -right-2 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                          title="Remove CTA"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Custom Text Elements ── */}
                  {project.composition.customTexts.map((customText) => (
                    <div key={customText.id} className="group relative mt-2">
                      {editingCustomText?.id === customText.id ? (
                        <div
                          ref={editRef}
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={finishEditing}
                          className="cursor-text outline-none ring-1 ring-[var(--accent)]"
                          style={{
                            fontSize: customText.fontSize * scale,
                            fontFamily: customText.fontFamily,
                            fontWeight: customText.fontWeight,
                            color: customText.color,
                            textAlign: customText.align,
                            ...contrastStyles,
                            minWidth: 40,
                          }}
                          dangerouslySetInnerHTML={{ __html: customText.text }}
                        />
                      ) : (
                        <p
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditingCustomText(customText.id)
                          }}
                          className="cursor-text"
                          title="Click to edit"
                          style={{
                            fontSize: customText.fontSize * scale,
                            fontFamily: customText.fontFamily,
                            fontWeight: customText.fontWeight,
                            color: customText.color,
                            textAlign: customText.align,
                            ...contrastStyles,
                          }}
                        >
                          {customText.text}
                        </p>
                      )}
                      {/* Delete custom text button */}
                      {selectedElement === "text" && !editing && !editingCustomText && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            dispatch({ type: "DELETE_CUSTOM_TEXT", payload: customText.id })
                          }}
                          className="absolute -right-2 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                          title="Remove text"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              </TransformBox>
            )}
          </div>
        </div>

        {/* ── Controls Panel ──────────────────────────────────────── */}
        <div className="space-y-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
          {/* Add back deleted elements / Add custom text */}
          {project.copy.selected && (!showSubhead || !showCta) && (
            <div className="flex flex-wrap gap-2">
              {!showSubhead && (
                <button
                  onClick={addSubhead}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  + Add subhead
                </button>
              )}
              {!showCta && (
                <button
                  onClick={addCta}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  + Add CTA
                </button>
              )}
            </div>
          )}

          {project.copy.selected && (
            <button
              onClick={addCustomText}
              className="w-full rounded border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              + Add text
            </button>
          )}

          {/* Callouts Section */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-300">Callout Bubbles</span>
              <button
                onClick={addCallout}
                className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                + Add
              </button>
            </div>
            {(project.composition.callouts ?? []).length === 0 && (
              <p className="text-xs text-zinc-600">No callouts yet</p>
            )}
            {(project.composition.callouts ?? []).map((callout) => (
              <div key={callout.id} className="mt-2 rounded border border-zinc-700 bg-zinc-800 p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={callout.text}
                    onChange={(e) => dispatch({ type: "UPDATE_CALLOUT", payload: { id: callout.id, updates: { text: e.target.value } } })}
                    className="flex-1 rounded border border-zinc-600 bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200 outline-none focus:border-[var(--accent)]"
                    placeholder="Callout text"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={() => dispatch({ type: "DELETE_CALLOUT", payload: callout.id })}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/40 text-xs"
                    title="Delete callout"
                  >
                    ×
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-zinc-500">Bubble</label>
                  <input
                    type="color"
                    value={callout.bgColor}
                    onChange={(e) => dispatch({ type: "UPDATE_CALLOUT", payload: { id: callout.id, updates: { bgColor: e.target.value } } })}
                    className="h-5 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                    title="Bubble color"
                  />
                  <label className="text-xs text-zinc-500">Text</label>
                  <input
                    type="color"
                    value={callout.textColor}
                    onChange={(e) => dispatch({ type: "UPDATE_CALLOUT", payload: { id: callout.id, updates: { textColor: e.target.value } } })}
                    className="h-5 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                    title="Text color"
                  />
                  <label className="text-xs text-zinc-500">Line</label>
                  <input
                    type="color"
                    value={callout.lineColor}
                    onChange={(e) => dispatch({ type: "UPDATE_CALLOUT", payload: { id: callout.id, updates: { lineColor: e.target.value } } })}
                    className="h-5 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                    title="Line color"
                  />
                </div>
                <div className="text-xs text-zinc-600">Drag bubble or dot on canvas to reposition</div>
              </div>
            ))}
          </div>

          <TextStylePanel />
          <ProductImageControls />

          <div className="rounded-lg bg-zinc-900 p-3 text-xs text-zinc-500">
            <p>Position: {project.composition.textPosition.x}, {project.composition.textPosition.y}</p>
            <p>Canvas: {width}x{height}</p>
            <p className="mt-1 text-zinc-600">Tip: Click text on canvas to edit inline</p>
          </div>
        </div>
      </div>

      <BatchPreviewGrid />

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
