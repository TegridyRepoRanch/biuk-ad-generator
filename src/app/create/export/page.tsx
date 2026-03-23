"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { getPreviewScale } from "@/lib/preview-scale"
import { useToast } from "@/lib/toast"
import { saveToHistory } from "@/lib/project-history"

interface AdCombo {
  imageUrl: string
  headline: string
  subhead?: string
  cta: string
  label: string
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40)
}

export default function ExportPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const { toast } = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendering, setRendering] = useState(false)
  const [comboUrls, setComboUrls] = useState<Array<{ url: string; label: string }>>([])
  const [gridUrl, setGridUrl] = useState<string | null>(null)
  const [quality, setQuality] = useState<1 | 2>(1)

  const { width, height } = project.format
  const previewScale = getPreviewScale(width, height)

  const hasBatch = project.batch.images.length === 2 && project.batch.copies.length === 2

  const productName = project.brief.productAnalysis?.productName
    ? slugify(project.brief.productAnalysis.productName)
    : "ad"

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

  // Proxy external URLs for CORS-safe canvas rendering
  const getProxiedUrl = (url: string) => {
    if (url.startsWith("data:") || url.startsWith("blob:")) return url
    // External URLs need proxying for canvas CORS
    return `/api/proxy-image?url=${encodeURIComponent(url)}`
  }

  // ── Core rendering function (renders one combo to a canvas) ──────
  const renderOneCombo = useCallback(async (
    canvas: HTMLCanvasElement,
    combo: AdCombo,
    scaleFactor: number
  ): Promise<string> => {
    const w = width * scaleFactor
    const h = height * scaleFactor
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return ""

    // Wait for fonts
    if (typeof document !== "undefined" && document.fonts) {
      await document.fonts.ready
      const fontFamily = project.composition.headlineFontFamily.split(",")[0].trim().replace(/'/g, "")
      try {
        await document.fonts.load(`${project.composition.headlineFontWeight} ${project.composition.headlineFontSize * scaleFactor}px "${fontFamily}"`)
      } catch {
        // Fallback
      }
    }

    // Draw background image
    if (combo.imageUrl) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      await new Promise<void>((resolve) => {
        img.onload = () => {
          const imgAspect = img.width / img.height
          const canvasAspect = w / h
          let sx = 0, sy = 0, sw = img.width, sh = img.height
          if (imgAspect > canvasAspect) {
            sw = img.height * canvasAspect
            sx = (img.width - sw) / 2
          } else {
            sh = img.width / canvasAspect
            sy = (img.height - sh) / 2
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = getProxiedUrl(combo.imageUrl)
      })
    }

    // Draw gradient overlay
    if (project.composition.overlayGradient) {
      const g = project.composition.overlayGradient
      let x0 = 0, y0 = h, x1 = 0, y1 = 0
      if (g.direction === "to bottom") { y0 = 0; y1 = h }
      else if (g.direction === "to right") { x0 = 0; y0 = 0; x1 = w; y1 = 0 }
      else if (g.direction === "to left") { x0 = w; y0 = 0; x1 = 0; y1 = 0 }
      const grad = ctx.createLinearGradient(x0, y0, x1, y1)
      grad.addColorStop(0, g.from)
      grad.addColorStop(1, g.to)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
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
          const drawWidth = w * 0.3 * pl.scale
          const drawHeight = (prodImg.height / prodImg.width) * drawWidth
          const cx = pl.position.x * scaleFactor + drawWidth / 2
          const cy = pl.position.y * scaleFactor + drawHeight / 2
          if (pl.rotation) {
            ctx.translate(cx, cy)
            ctx.rotate((pl.rotation * Math.PI) / 180)
            ctx.drawImage(prodImg, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
          } else {
            ctx.drawImage(prodImg, pl.position.x * scaleFactor, pl.position.y * scaleFactor, drawWidth, drawHeight)
          }
          ctx.restore()
          resolve()
        }
        prodImg.onerror = () => resolve()
        prodImg.src = getProxiedUrl(pl.url)
      })
    }

    // Draw text
    const sf = scaleFactor
    const tx = project.composition.textPosition.x * sf
    const startTy = project.composition.textPosition.y * sf
    const maxTextWidth = (project.composition.textSize?.width || width * 0.75) * sf
    let measureTy = startTy

    const headlineFontSize = project.composition.headlineFontSize * sf
    ctx.font = `${project.composition.headlineFontWeight} ${headlineFontSize}px ${project.composition.headlineFontFamily}`
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
    measureTy += lines.length * headlineFontSize * 1.15

    const subheadFontSize = (project.composition.subheadFontSize || 28) * sf
    if (combo.subhead) {
      measureTy += 8 * sf + subheadFontSize * 1.15
    }

    const ctaStyle = project.composition.ctaStyle
    const ctaFontSize = ctaStyle.fontSize * sf
    if (combo.cta) {
      measureTy += 16 * sf + ctaFontSize + ctaStyle.padding.y * 2 * sf
    }
    const textBlockHeight = measureTy - startTy

    let maxLineWidth = 0
    ctx.font = `${project.composition.headlineFontWeight} ${headlineFontSize}px ${project.composition.headlineFontFamily}`
    for (const l of lines) {
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(l).width)
    }
    if (combo.cta) {
      ctx.font = `700 ${ctaFontSize}px ${project.composition.headlineFontFamily}`
      const ctaTextWidth = ctx.measureText(combo.cta).width + ctaStyle.padding.x * 2 * sf
      maxLineWidth = Math.max(maxLineWidth, ctaTextWidth)
    }

    if (project.format.contrastMethod === "solid-block") {
      const padding = 24 * sf
      ctx.fillStyle = "rgba(0,0,0,0.7)"
      ctx.fillRect(tx - padding, startTy - padding, maxLineWidth + padding * 2, textBlockHeight + padding * 2)
    }

    let ty = startTy
    ctx.font = `${project.composition.headlineFontWeight} ${headlineFontSize}px ${project.composition.headlineFontFamily}`
    ctx.fillStyle = project.composition.headlineColor
    ctx.textAlign = project.composition.headlineAlign
    ctx.textBaseline = "top"

    if (project.format.contrastMethod === "text-shadow") {
      ctx.shadowColor = "rgba(0,0,0,0.6)"
      ctx.shadowBlur = 8 * sf
      ctx.shadowOffsetY = 2 * sf
    }

    const useOutline = project.format.contrastMethod === "outlined-text"
    if (useOutline) {
      ctx.strokeStyle = "rgba(0,0,0,0.5)"
      ctx.lineWidth = 4 * sf
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
      ty += headlineFontSize * 1.15
    }

    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    if (combo.subhead) {
      ty += 8 * sf
      ctx.font = `400 ${subheadFontSize}px ${project.composition.headlineFontFamily}`
      ctx.fillStyle = project.composition.subheadColor || "#cccccc"
      if (project.format.contrastMethod === "text-shadow") {
        ctx.shadowColor = "rgba(0,0,0,0.6)"
        ctx.shadowBlur = 8 * sf
        ctx.shadowOffsetY = 2 * sf
      }
      if (useOutline) {
        ctx.strokeStyle = "rgba(0,0,0,0.5)"
        ctx.lineWidth = 3 * sf
        ctx.strokeText(combo.subhead, alignX, ty)
      }
      ctx.fillText(combo.subhead, alignX, ty)
      ty += subheadFontSize * 1.15
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
    }

    // CTA button
    if (combo.cta) {
      ty += 16 * sf
      ctx.font = `700 ${ctaFontSize}px ${project.composition.headlineFontFamily}`
      const ctaPadX = ctaStyle.padding.x * sf
      const ctaPadY = ctaStyle.padding.y * sf
      const ctaWidth = ctx.measureText(combo.cta).width + ctaPadX * 2
      const ctaHeight = ctaFontSize + ctaPadY * 2
      let ctaX = alignX
      if (project.composition.headlineAlign === "center") ctaX -= ctaWidth / 2
      else if (project.composition.headlineAlign === "right") ctaX -= ctaWidth

      ctx.fillStyle = ctaStyle.backgroundColor
      const r = ctaStyle.borderRadius * sf
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
    }

    // Draw custom text elements
    for (const customText of project.composition.customTexts) {
      const customFontSize = customText.fontSize * sf
      ctx.font = `${customText.fontWeight} ${customFontSize}px ${customText.fontFamily}`
      ctx.fillStyle = customText.color
      ctx.textAlign = customText.align
      ctx.textBaseline = "top"

      if (project.format.contrastMethod === "text-shadow") {
        ctx.shadowColor = "rgba(0,0,0,0.6)"
        ctx.shadowBlur = 8 * sf
        ctx.shadowOffsetY = 2 * sf
      } else {
        ctx.shadowColor = "transparent"
      }

      const useOutlineCustom = project.format.contrastMethod === "outlined-text"
      if (useOutlineCustom) {
        ctx.strokeStyle = "rgba(0,0,0,0.5)"
        ctx.lineWidth = 3 * sf
      }

      const customTx = customText.position.x * sf
      const customTy = customText.position.y * sf

      if (useOutlineCustom) {
        ctx.strokeText(customText.text, customTx, customTy)
      }
      ctx.fillText(customText.text, customTx, customTy)
    }

    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // Draw callout elements
    for (const callout of (project.composition.callouts ?? [])) {
      const fontSize = callout.fontSize * sf
      const padX = callout.padding.x * sf
      const padY = callout.padding.y * sf
      const dotR = callout.dotRadius * sf
      const lineW = callout.lineWidth * sf
      const borderR = callout.borderRadius * sf

      ctx.font = `${callout.fontWeight} ${fontSize}px ${callout.fontFamily}`
      const lines = callout.text.split('\n')
      const lineHeight = fontSize * 1.3
      const textWidths = lines.map(l => ctx.measureText(l).width)
      const maxTextWidth = Math.max(...textWidths)

      const bubbleW = maxTextWidth + padX * 2
      const bubbleH = lines.length * lineHeight + padY * 2
      const bx = callout.position.x * sf
      const by = callout.position.y * sf
      const ax = callout.anchorPoint.x * sf
      const ay = callout.anchorPoint.y * sf

      // Find nearest edge point of bubble to anchor
      const bcx = bx + bubbleW / 2
      const bcy = by + bubbleH / 2
      const angle = Math.atan2(ay - bcy, ax - bcx)
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const halfW = bubbleW / 2
      const halfH = bubbleH / 2
      let edgeX: number
      let edgeY: number

      if (Math.abs(cos * halfH) > Math.abs(sin * halfW)) {
        edgeX = bcx + Math.sign(cos) * halfW
        edgeY = bcy + sin * (halfW / Math.abs(cos))
      } else {
        edgeX = bcx + cos * (halfH / Math.abs(sin))
        edgeY = bcy + Math.sign(sin) * halfH
      }

      // Draw leader line
      ctx.strokeStyle = callout.lineColor
      ctx.lineWidth = lineW
      ctx.beginPath()
      ctx.moveTo(edgeX, edgeY)
      ctx.lineTo(ax, ay)
      ctx.stroke()

      // Draw dot at anchor point
      ctx.fillStyle = callout.lineColor
      ctx.beginPath()
      ctx.arc(ax, ay, dotR, 0, Math.PI * 2)
      ctx.fill()

      // Draw bubble background
      ctx.fillStyle = callout.bgColor
      ctx.shadowColor = 'rgba(0,0,0,0.15)'
      ctx.shadowBlur = 6 * sf
      ctx.shadowOffsetY = 2 * sf
      ctx.beginPath()
      ctx.moveTo(bx + borderR, by)
      ctx.lineTo(bx + bubbleW - borderR, by)
      ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + borderR)
      ctx.lineTo(bx + bubbleW, by + bubbleH - borderR)
      ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - borderR, by + bubbleH)
      ctx.lineTo(bx + borderR, by + bubbleH)
      ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - borderR)
      ctx.lineTo(bx, by + borderR)
      ctx.quadraticCurveTo(bx, by, bx + borderR, by)
      ctx.closePath()
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // Draw text
      ctx.fillStyle = callout.textColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${callout.fontWeight} ${fontSize}px ${callout.fontFamily}`
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], bx + bubbleW / 2, by + padY + (i + 0.5) * lineHeight)
      }
    }

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
      const url = await renderOneCombo(canvas, combo, quality)
      if (url) results.push({ url, label: combo.label })
    }

    setComboUrls(results)

    // If we have exactly 4, stitch into a 2x2 grid
    if (results.length === 4) {
      const gw = width * quality
      const gh = height * quality
      const gridCanvas = document.createElement("canvas")
      gridCanvas.width = gw * 2
      gridCanvas.height = gh * 2
      const gCtx = gridCanvas.getContext("2d")
      if (gCtx) {
        const positions = [
          [0, 0], [gw, 0],
          [0, gh], [gw, gh],
        ]
        await Promise.all(
          results.map((r, i) => new Promise<void>((resolve) => {
            const img = new Image()
            img.onload = () => {
              gCtx.drawImage(img, positions[i][0], positions[i][1], gw, gh)
              resolve()
            }
            img.onerror = () => resolve()
            img.src = r.url
          }))
        )
        setGridUrl(gridCanvas.toDataURL("image/png", 1.0))
      }
    }

    // Store first combo as the "main" export
    if (results.length > 0) {
      dispatch({ type: "SET_EXPORT_URL", payload: results[0].url })
    }

    // Save to project history
    saveToHistory({
      id: project.id,
      name: project.name,
      productName: project.brief.productAnalysis?.productName || "Ad",
      platform: project.format.platform,
      thumbnailUrl: results[0]?.url || null,
      createdAt: project.createdAt,
      completedAt: new Date().toISOString(),
    })

    setRendering(false)
    toast("All ads rendered successfully", "success")
  }, [combos, renderOneCombo, width, height, quality, dispatch, project, toast])

  // Auto-render on mount
  const hasRendered = useRef(false)
  useEffect(() => {
    if (!hasRendered.current && canvasRef.current && combos.length > 0) {
      hasRendered.current = true
      // Defer to next microtask to avoid synchronous setState-in-effect
      Promise.resolve().then(() => renderAll())
    }
  }, [renderAll, combos.length])

  const today = new Date().toISOString().slice(0, 10)

  const downloadFile = (url: string, name: string) => {
    const a = document.createElement("a")
    a.href = url
    a.download = name
    a.click()
  }

  const downloadGrid = () => {
    if (!gridUrl) return
    const dims = `${width * quality}x${height * quality}`
    downloadFile(gridUrl, `${productName}_2x2-grid_${project.format.platform}_${dims}_${today}.png`)
    toast("Grid downloaded", "success")
  }

  const downloadIndividual = (idx: number) => {
    const combo = comboUrls[idx]
    if (!combo) return
    const dims = `${width * quality}x${height * quality}`
    const headlineSlug = combos[idx] ? slugify(combos[idx].headline).slice(0, 30) : ""
    downloadFile(combo.url, `${productName}_${headlineSlug}_${project.format.platform}_${dims}_${today}.png`)
    toast("Ad downloaded", "success")
  }

  const copyToClipboard = async (url: string) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      toast("Copied to clipboard", "success")
    } catch {
      toast("Copy failed — try downloading instead", "error")
    }
  }

  const miniScale = hasBatch ? Math.min(280 / width, 280 / height) : previewScale

  return (
    <div className="step-transition mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 7: Export</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {hasBatch
          ? `Rendering 4 ads (2 images × 2 headlines) at ${width * quality}×${height * quality}px each.`
          : `Render your ad to PNG at ${width * quality}×${height * quality}px.`}
      </p>

      {/* Quality selector */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-zinc-500">Quality:</span>
        <button
          onClick={() => { setQuality(1); hasRendered.current = false }}
          className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${quality === 1 ? "border-white bg-zinc-800 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}
        >
          Standard (1x)
        </button>
        <button
          onClick={() => { setQuality(2); hasRendered.current = false }}
          className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${quality === 2 ? "border-white bg-zinc-800 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}
        >
          High (2x)
        </button>
      </div>

      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Empty state */}
      {combos.length === 0 && !rendering && (
        <div className="mt-12 text-center">
          <p className="text-zinc-400">No ads to render. Go back to compose to set up your ad.</p>
          <button
            onClick={() => router.push("/create/compose")}
            className="mt-4 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
          >
            Back to Compose
          </button>
        </div>
      )}

      {/* ── 2x2 Grid Preview ──────────────────────────────────── */}
      {comboUrls.length > 0 && (
        <div className="mt-8">
          <div className={`grid gap-4 sm:gap-6 max-w-3xl mx-auto ${comboUrls.length === 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-sm"}`}>
            {comboUrls.map((combo, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div className="overflow-hidden rounded-lg border border-zinc-700" style={{
                  width: width * miniScale,
                  height: height * miniScale,
                }}>
                  <img src={combo.url} alt={combo.label} className="h-full w-full object-contain" loading="lazy" decoding="async" />
                </div>
                <div className="mt-2 flex w-full items-center justify-between gap-2" style={{ maxWidth: width * miniScale }}>
                  <span className="text-xs text-zinc-500">{combo.label}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(combo.url)}
                      className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => downloadIndividual(idx)}
                      className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 text-center text-sm text-zinc-400">
            {width * quality}×{height * quality}px each — {project.format.platform}
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
            ? `4 ads rendered at ${width * quality}×${height * quality}px — ready to upload to Ads Manager`
            : `Rendered at ${width * quality}×${height * quality}px — ready to upload to Ads Manager`}
        </p>
      )}

      {/* Quick actions */}
      {comboUrls.length > 0 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
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
