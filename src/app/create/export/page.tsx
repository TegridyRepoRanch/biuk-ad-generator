"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { CopyVariation } from "@/types/ad"
import { getPreviewScale } from "@/lib/preview-scale"

interface AdCombo {
  imageUrl: string
  headline: string
  subhead?: string
  cta: string
  label: string // e.g. "Image 1 + Headline A"
}

export default function ExportPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendering, setRendering] = useState(false)
  const [comboUrls, setComboUrls] = useState<Array<{ url: string; label: string }>>([])
  const [gridUrl, setGridUrl] = useState<string | null>(null)

  const { width, height } = project.format
  const previewScale = getPreviewScale(width, height)

  const hasBatch = project.batch.images.length === 2 && project.batch.copies.length === 2

  // Build the 4 combos (or just 1 for non-batch mode)
  const combos: AdCombo[] = useMemo(() => hasBatch
    ? project.batch.images.flatMap((img, imgIdx) =>
        project.batch.copies.map((copy, copyIdx) => ({
          imageUrl: img.url,
          headline: copy.headline,
          subhead: copy.subhead,
          cta: copy.cta,
          label: `Image ${imgIdx + 1} + Headline ${copyIdx === 0 ? "A" : "B"}`,
        }))
      )
    : project.uploadedImage.url && project.copy.selected
      ? [{
          imageUrl: project.uploadedImage.url,
          headline: project.copy.selected.headline,
          subhead: project.copy.selected.subhead,
          cta: project.copy.selected.cta,
          label: "Ad",
        }]
      : []
  , [hasBatch, project.batch.images, project.batch.copies, project.uploadedImage.url, project.copy.selected])

  // ── Core rendering function (renders one combo to a canvas) ──────
  const renderOneCombo = useCallback(async (
    canvas: HTMLCanvasElement,
    combo: AdCombo
  ): Promise<string> => {
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return ""

    // Wait for fonts
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready
    }

    // Draw background image
    if (combo.imageUrl) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      await new Promise<void>((resolve) => {
        img.onload = () => {
          const imgAspect = img.width / img.height
          const canvasAspect = width / height
          let sx = 0, sy = 0, sw = img.width, sh = img.height
          if (imgAspect > canvasAspect) {
            sw = img.height * canvasAspect
            sx = (img.width - sw) / 2
          } else {
            sh = img.width / canvasAspect
            sy = (img.height - sh) / 2
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = combo.imageUrl
      })
    }

    // Draw gradient overlay
    if (project.composition.overlayGradient) {
      const g = project.composition.overlayGradient
      let x0 = 0, y0 = height, x1 = 0, y1 = 0
      if (g.direction === "to bottom") { y0 = 0; y1 = height }
      else if (g.direction === "to right") { x0 = 0; y0 = 0; x1 = width; y1 = 0 }
      else if (g.direction === "to left") { x0 = width; y0 = 0; x1 = 0; y1 = 0 }
      const grad = ctx.createLinearGradient(x0, y0, x1, y1)
      grad.addColorStop(0, g.from)
      grad.addColorStop(1, g.to)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
    }

    // Draw product image layer
    const pl = project.composition.productImage
    if (pl?.visible && pl.url) {
      const prodImg = new Image()
      prodImg.crossOrigin = "anonymous"
      await new Promise<void>((resolve) => {
        prodImg.onload = () => {
          ctx.save()
          ctx.globalAlpha = pl.opacity
          const drawWidth = width * 0.3 * pl.scale
          const drawHeight = (prodImg.height / prodImg.width) * drawWidth
          const cx = pl.position.x + drawWidth / 2
          const cy = pl.position.y + drawHeight / 2
          if (pl.rotation) {
            ctx.translate(cx, cy)
            ctx.rotate((pl.rotation * Math.PI) / 180)
            ctx.drawImage(prodImg, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
          } else {
            ctx.drawImage(prodImg, pl.position.x, pl.position.y, drawWidth, drawHeight)
          }
          ctx.restore()
          resolve()
        }
        prodImg.onerror = () => resolve()
        prodImg.src = pl.url
      })
    }

    // Draw text (headline, subhead, CTA)
    const tx = project.composition.textPosition.x
    const startTy = project.composition.textPosition.y
    const maxTextWidth = width * 0.75
    let measureTy = startTy

    ctx.font = `${project.composition.headlineFontWeight} ${project.composition.headlineFontSize}px ${project.composition.headlineFontFamily}`
    const words = combo.headline.split(" ")
    let line = ""
    const lines: string[] = []
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxTextWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
    measureTy += lines.length * project.composition.headlineFontSize * 1.15

    if (combo.subhead) {
      measureTy += 8 + (project.composition.subheadFontSize || 28) * 1.15
    }

    const ctaStyle = project.composition.ctaStyle
    measureTy += 16 + ctaStyle.fontSize + ctaStyle.padding.y * 2
    const textBlockHeight = measureTy - startTy

    let maxLineWidth = 0
    for (const l of lines) {
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(l).width)
    }
    ctx.font = `700 ${ctaStyle.fontSize}px ${project.composition.headlineFontFamily}`
    const ctaTextWidth = ctx.measureText(combo.cta).width + ctaStyle.padding.x * 2
    maxLineWidth = Math.max(maxLineWidth, ctaTextWidth)

    if (project.format.contrastMethod === "solid-block") {
      const padding = 24
      ctx.fillStyle = "rgba(0,0,0,0.7)"
      ctx.fillRect(tx - padding, startTy - padding, maxLineWidth + padding * 2, textBlockHeight + padding * 2)
    }

    let ty = startTy
    ctx.font = `${project.composition.headlineFontWeight} ${project.composition.headlineFontSize}px ${project.composition.headlineFontFamily}`
    ctx.fillStyle = project.composition.headlineColor
    ctx.textAlign = project.composition.headlineAlign
    ctx.textBaseline = "top"

    if (project.format.contrastMethod === "text-shadow") {
      ctx.shadowColor = "rgba(0,0,0,0.6)"
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 2
    }

    const useOutline = project.format.contrastMethod === "outlined-text"
    if (useOutline) {
      ctx.strokeStyle = "rgba(0,0,0,0.5)"
      ctx.lineWidth = 4
      ctx.lineJoin = "round"
    }

    const alignX =
      project.composition.headlineAlign === "center"
        ? tx + maxTextWidth / 2
        : project.composition.headlineAlign === "right"
          ? tx + maxTextWidth
          : tx

    for (const l of lines) {
      if (useOutline) ctx.strokeText(l, alignX, ty)
      ctx.fillText(l, alignX, ty)
      ty += project.composition.headlineFontSize * 1.15
    }

    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    if (combo.subhead) {
      ty += 8
      ctx.font = `400 ${project.composition.subheadFontSize || 28}px ${project.composition.headlineFontFamily}`
      ctx.fillStyle = project.composition.subheadColor || "#cccccc"
      if (project.format.contrastMethod === "text-shadow") {
        ctx.shadowColor = "rgba(0,0,0,0.6)"
        ctx.shadowBlur = 8
        ctx.shadowOffsetY = 2
      }
      if (useOutline) {
        ctx.strokeStyle = "rgba(0,0,0,0.5)"
        ctx.lineWidth = 3
        ctx.strokeText(combo.subhead, alignX, ty)
      }
      ctx.fillText(combo.subhead, alignX, ty)
      ty += (project.composition.subheadFontSize || 28) * 1.15
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
    }

    // CTA button
    ty += 16
    ctx.font = `700 ${ctaStyle.fontSize}px ${project.composition.headlineFontFamily}`
    const ctaWidth = ctx.measureText(combo.cta).width + ctaStyle.padding.x * 2
    const ctaHeight = ctaStyle.fontSize + ctaStyle.padding.y * 2
    let ctaX = alignX
    if (project.composition.headlineAlign === "center") ctaX -= ctaWidth / 2
    else if (project.composition.headlineAlign === "right") ctaX -= ctaWidth

    ctx.fillStyle = ctaStyle.backgroundColor
    const r = ctaStyle.borderRadius
    ctx.beginPath()
    ctx.moveTo(ctaX + r, ty)
    ctx.lineTo(ctaX + ctaWidth - r, ty)
    ctx.quadraticCurveTo(ctaX + ctaWidth, ty, ctaX + ctaWidth, ty + r)
    ctx.lineTo(ctaX + ctaWidth, ty + ctaHeight - r)
    ctx.quadraticCurveTo(ctaX + ctaWidth, ty + ctaHeight, ctaX + ctaWidth - r, ty + ctaHeight)
    ctx.lineTo(ctaX + r, ty + ctaHeight)
    ctx.quadraticCurveTo(ctaX, ty + ctaHeight, ctaX, ty + ctaHeight - r)
    ctx.lineTo(ctaX, ty + r)
    ctx.quadraticCurveTo(ctaX, ty, ctaX + r, ty)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = ctaStyle.textColor
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(combo.cta, ctaX + ctaWidth / 2, ty + ctaHeight / 2)

    return canvas.toDataURL("image/png", 1.0)
  }, [project, width, height])

  // ── Render all combos ────────────────────────────────────────────
  const renderAll = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || combos.length === 0) return

    setRendering(true)
    setComboUrls([])
    setGridUrl(null)

    const results: Array<{ url: string; label: string }> = []

    for (const combo of combos) {
      const url = await renderOneCombo(canvas, combo)
      if (url) results.push({ url, label: combo.label })
    }

    setComboUrls(results)

    // If we have exactly 4, stitch into a 2x2 grid
    if (results.length === 4) {
      const gridCanvas = document.createElement("canvas")
      gridCanvas.width = width * 2
      gridCanvas.height = height * 2
      const gCtx = gridCanvas.getContext("2d")
      if (gCtx) {
        const positions = [
          [0, 0], [width, 0],
          [0, height], [width, height],
        ]
        await Promise.all(
          results.map((r, i) => new Promise<void>((resolve) => {
            const img = new Image()
            img.onload = () => {
              gCtx.drawImage(img, positions[i][0], positions[i][1], width, height)
              resolve()
            }
            img.onerror = () => resolve()
            img.src = r.url
          }))
        )
        setGridUrl(gridCanvas.toDataURL("image/png", 1.0))
      }
    }

    // Store first combo as the "main" export for backward compat
    if (results.length > 0) {
      dispatch({ type: "SET_EXPORT_URL", payload: results[0].url })
    }

    setRendering(false)
  }, [combos, renderOneCombo, width, height, dispatch])

  // Auto-render on mount
  const hasRendered = useRef(false)
  useEffect(() => {
    if (!hasRendered.current && canvasRef.current && combos.length > 0) {
      hasRendered.current = true
      renderAll()
    }
  }, [renderAll, combos.length])

  const downloadFile = (url: string, name: string) => {
    const a = document.createElement("a")
    a.href = url
    a.download = name
    a.click()
  }

  const downloadGrid = () => {
    if (!gridUrl) return
    downloadFile(gridUrl, `${project.name || "ad"}-${project.format.platform}-2x2-grid.png`)
  }

  const downloadIndividual = (idx: number) => {
    const combo = comboUrls[idx]
    if (!combo) return
    downloadFile(combo.url, `${project.name || "ad"}-${project.format.platform}-${idx + 1}-${width}x${height}.png`)
  }

  const miniScale = hasBatch ? Math.min(280 / width, 280 / height) : previewScale

  return (
    <div className="step-transition mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 7: Export</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {hasBatch
          ? `Rendering 4 ads (2 images × 2 headlines) at ${width}×${height}px each.`
          : `Render your ad to PNG at ${width}×${height}px.`}
      </p>

      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── 2x2 Grid Preview ──────────────────────────────────── */}
      {comboUrls.length > 0 && (
        <div className="mt-8">
          <div className={`grid gap-3 ${comboUrls.length === 4 ? "grid-cols-2" : "grid-cols-1 max-w-sm mx-auto"}`}>
            {comboUrls.map((combo, idx) => (
              <div key={idx} className="group relative">
                <div className="overflow-hidden rounded-lg border border-zinc-700" style={{
                  width: width * miniScale,
                  height: height * miniScale,
                }}>
                  <img src={combo.url} alt={combo.label} className="h-full w-full object-contain" />
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">{combo.label}</span>
                  <button
                    onClick={() => downloadIndividual(idx)}
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 text-center text-sm text-zinc-400">
            {width}×{height}px each — {project.format.platform}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={renderAll}
          disabled={rendering || combos.length === 0}
          className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {rendering ? "Rendering..." : comboUrls.length > 0 ? "Re-render All" : "Render PNGs"}
        </button>
        {gridUrl && (
          <button
            onClick={downloadGrid}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Download 2x2 Grid
          </button>
        )}
        {comboUrls.length === 1 && (
          <button
            onClick={() => downloadIndividual(0)}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Download PNG
          </button>
        )}
      </div>

      {comboUrls.length > 0 && (
        <p className="mt-3 text-center text-xs text-emerald-400">
          {comboUrls.length === 4
            ? `4 ads rendered at ${width}×${height}px — ready to upload to Ads Manager`
            : `Rendered at ${width}×${height}px — ready to upload to Ads Manager`}
        </p>
      )}

      {/* Quick actions */}
      {comboUrls.length > 0 && (
        <div className="mt-8 flex justify-center gap-2">
          <button
            onClick={() => { dispatch({ type: "SET_STEP", payload: 6 }); router.push("/create/compose") }}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            Adjust Composition
          </button>
          <button
            onClick={() => { dispatch({ type: "SET_STEP", payload: 4 }); router.push("/create/upload") }}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            Generate New Images
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-10 flex justify-between">
        <button
          onClick={() => router.push("/create/compose")}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          &larr; Back to Compose
        </button>
        <button
          onClick={() => { if (!confirm("Start a new ad? This will erase all current progress.")) return; dispatch({ type: "RESET" }); router.push("/") }}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          Start New Ad
        </button>
      </div>
    </div>
  )
}
