"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { getPreviewScale } from "@/lib/preview-scale"

export default function ExportPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendering, setRendering] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(
    project.export.pngUrl
  )

  const { width, height } = project.format
  const previewScale = getPreviewScale(width, height)

  const renderToCanvas = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    setRendering(true)

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      setRendering(false)
      return
    }

    // Wait for custom Google Fonts to finish loading before drawing text
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready
    }

    // Draw background image
    if (project.uploadedImage.url) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      await new Promise<void>((resolve) => {
        img.onload = () => {
          // Cover the canvas
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
        img.src = project.uploadedImage.url!
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

    // Draw product image layer (with rotation)
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

    // Draw headline, subhead, and CTA
    if (project.copy.selected) {
      const tx = project.composition.textPosition.x
      const startTy = project.composition.textPosition.y

      // --- Measure total text block height first (for solid-block contrast) ---
      const maxTextWidth = width * 0.75
      let measureTy = startTy

      // Measure headline lines
      ctx.font = `${project.composition.headlineFontWeight} ${project.composition.headlineFontSize}px ${project.composition.headlineFontFamily}`
      const words = project.copy.selected.headline.split(" ")
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

      // Measure subhead
      if (project.copy.selected.subhead) {
        measureTy += 8 + (project.composition.subheadFontSize || 28) * 1.15
      }

      // Measure CTA
      const ctaStyle = project.composition.ctaStyle
      measureTy += 16 + ctaStyle.fontSize + ctaStyle.padding.y * 2

      const textBlockHeight = measureTy - startTy

      // Measure widest line for block width
      let maxLineWidth = 0
      for (const l of lines) {
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(l).width)
      }
      ctx.font = `700 ${ctaStyle.fontSize}px ${project.composition.headlineFontFamily}`
      const ctaTextWidth = ctx.measureText(project.copy.selected.cta).width + ctaStyle.padding.x * 2
      maxLineWidth = Math.max(maxLineWidth, ctaTextWidth)

      // --- Draw solid block contrast behind text (now using real dimensions) ---
      if (project.format.contrastMethod === "solid-block") {
        const padding = 24
        ctx.fillStyle = "rgba(0,0,0,0.7)"
        ctx.fillRect(
          tx - padding,
          startTy - padding,
          maxLineWidth + padding * 2,
          textBlockHeight + padding * 2
        )
      }

      // --- Now draw the actual text ---
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

      // Set up outlined-text stroke (CSS WebkitTextStroke has no Canvas equivalent)
      const useOutline = project.format.contrastMethod === "outlined-text"
      if (useOutline) {
        ctx.strokeStyle = "rgba(0,0,0,0.5)"
        ctx.lineWidth = 4
        ctx.lineJoin = "round"
      }

      // Canvas textAlign anchors text at the x coordinate:
      // "left" = x is left edge, "center" = x is center point, "right" = x is right edge
      // The text block starts at tx and has maxTextWidth available
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

      // Reset shadow
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // Draw subhead
      if (project.copy.selected.subhead) {
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
          ctx.strokeText(project.copy.selected.subhead, alignX, ty)
        }
        ctx.fillText(project.copy.selected.subhead, alignX, ty)
        ty += (project.composition.subheadFontSize || 28) * 1.15
        ctx.shadowColor = "transparent"
        ctx.shadowBlur = 0
        ctx.shadowOffsetY = 0
      }

      // Draw CTA button
      ty += 16
      const cta = project.copy.selected.cta
      ctx.font = `700 ${ctaStyle.fontSize}px ${project.composition.headlineFontFamily}`
      const ctaWidth = ctx.measureText(cta).width + ctaStyle.padding.x * 2
      const ctaHeight = ctaStyle.fontSize + ctaStyle.padding.y * 2

      let ctaX = alignX
      if (project.composition.headlineAlign === "center") {
        ctaX -= ctaWidth / 2
      } else if (project.composition.headlineAlign === "right") {
        ctaX -= ctaWidth
      }

      // CTA background
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

      // CTA text
      ctx.fillStyle = ctaStyle.textColor
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(cta, ctaX + ctaWidth / 2, ty + ctaHeight / 2)
    }

    // Generate download URL
    const dataUrl = canvas.toDataURL("image/png", 1.0)
    setDownloadUrl(dataUrl)
    dispatch({ type: "SET_EXPORT_URL", payload: dataUrl })
    setRendering(false)
  }, [project, width, height, dispatch])

  // Auto-render on mount
  const hasRendered = useRef(false)
  useEffect(() => {
    if (!hasRendered.current && canvasRef.current && project.uploadedImage.url) {
      hasRendered.current = true
      renderToCanvas()
    }
  }, [renderToCanvas, project.uploadedImage.url])

  const download = () => {
    if (!downloadUrl) return
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = `${project.name || "ad"}-${project.format.platform}-${width}x${height}.png`
    a.click()
  }

  const gradientCSS = project.composition.overlayGradient
    ? `linear-gradient(${project.composition.overlayGradient.direction}, ${project.composition.overlayGradient.from}, ${project.composition.overlayGradient.to})`
    : undefined

  return (
    <div className="step-transition mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Step 7: Export</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Render your ad to PNG at exact platform dimensions ({width}x{height}).
      </p>

      {/* HTML Preview */}
      <div className="mt-8 flex flex-col items-center gap-6">
        <div
          className="relative overflow-hidden rounded-lg border border-zinc-700"
          style={{
            width: width * previewScale,
            height: height * previewScale,
          }}
        >
          {project.uploadedImage.url && (
            <img
              src={project.uploadedImage.url}
              alt="Ad background"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {gradientCSS && (
            <div className="absolute inset-0" style={{ background: gradientCSS }} />
          )}
          {/* Product image layer */}
          {project.composition.productImage?.visible && project.composition.productImage.url && (
            <div
              className="absolute"
              style={{
                left: project.composition.productImage.position.x * previewScale,
                top: project.composition.productImage.position.y * previewScale,
                width: `${project.composition.productImage.scale * 30}%`,
                transform: `rotate(${project.composition.productImage.rotation || 0}deg)`,
                transformOrigin: "center center",
                opacity: project.composition.productImage.opacity,
              }}
            >
              <img
                src={project.composition.productImage.url}
                alt="Product"
                className="h-auto w-full object-contain"
              />
            </div>
          )}
          {project.copy.selected && (
            <div
              className="absolute"
              style={{
                left: project.composition.textPosition.x * previewScale,
                top: project.composition.textPosition.y * previewScale,
                maxWidth: width * 0.8 * previewScale,
                ...(project.format.contrastMethod === "solid-block"
                  ? { background: "rgba(0,0,0,0.7)", borderRadius: 8 * previewScale, padding: 16 * previewScale }
                  : {}),
              }}
            >
              <p
                style={{
                  fontSize: project.composition.headlineFontSize * previewScale,
                  fontFamily: project.composition.headlineFontFamily,
                  fontWeight: project.composition.headlineFontWeight,
                  color: project.composition.headlineColor,
                  textAlign: project.composition.headlineAlign,
                  lineHeight: 1.1,
                  textShadow:
                    project.format.contrastMethod === "text-shadow"
                      ? "0 2px 8px rgba(0,0,0,0.6)"
                      : undefined,
                  WebkitTextStroke:
                    project.format.contrastMethod === "outlined-text"
                      ? "2px rgba(0,0,0,0.5)"
                      : undefined,
                }}
              >
                {project.copy.selected.headline}
              </p>
              {project.copy.selected.subhead && (
                <p
                  style={{
                    fontSize: (project.composition.subheadFontSize || 28) * previewScale,
                    color: project.composition.subheadColor || "#cccccc",
                    fontFamily: project.composition.headlineFontFamily,
                    textAlign: project.composition.headlineAlign,
                    marginTop: 4 * previewScale,
                  }}
                >
                  {project.copy.selected.subhead}
                </p>
              )}
              <div
                style={{
                  marginTop: 12 * previewScale,
                  display: "inline-block",
                  backgroundColor: project.composition.ctaStyle.backgroundColor,
                  color: project.composition.ctaStyle.textColor,
                  borderRadius: project.composition.ctaStyle.borderRadius * previewScale,
                  paddingLeft: project.composition.ctaStyle.padding.x * previewScale,
                  paddingRight: project.composition.ctaStyle.padding.x * previewScale,
                  paddingTop: project.composition.ctaStyle.padding.y * previewScale,
                  paddingBottom: project.composition.ctaStyle.padding.y * previewScale,
                  fontSize: project.composition.ctaStyle.fontSize * previewScale,
                  fontWeight: 700,
                }}
              >
                {project.copy.selected.cta}
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-sm text-zinc-400">
          {width}x{height} — {project.format.platform}
        </div>

        {/* Hidden canvas for rendering */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={renderToCanvas}
            disabled={rendering}
            className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {rendering ? "Rendering..." : "Render PNG"}
          </button>
          {downloadUrl && (
            <button
              onClick={download}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Download PNG
            </button>
          )}
        </div>

        {downloadUrl && (
          <p className="text-xs text-emerald-400">
            Rendered at {width}x{height}px — ready to upload to Ads Manager
          </p>
        )}
      </div>

      {/* ── 2x2 Ad Batch Builder ────────────────────────────────────── */}
      {downloadUrl && project.copy.variations.length > 1 && (
        <div className="mt-10 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold">Build Your 2x2 Batch</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Every ad batch needs 2 headlines x 2 images = 4 ads. Swap the
            headline below to create your next variation, then re-render.
          </p>

          {/* Headline variations */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium uppercase text-zinc-500">
              Swap Headline
            </p>
            {project.copy.variations.map((v) => {
              const isActive = project.copy.selected?.headline === v.headline
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    if (!isActive) {
                      dispatch({
                        type: "SELECT_COPY",
                        payload: {
                          headline: v.headline,
                          subhead: v.subhead,
                          cta: v.cta,
                        },
                      })
                      // Clear previous render so they know to re-render
                      setDownloadUrl(null)
                      hasRendered.current = false
                    }
                  }}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-sm font-semibold">{v.headline}</span>
                  <span className="ml-2 text-xs text-zinc-500">{v.cta}</span>
                  {isActive && (
                    <span className="ml-2 text-xs text-[var(--accent)]">current</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Quick actions for the 2x2 */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                dispatch({ type: "SET_STEP", payload: 4 })
                router.push("/create/upload")
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Generate New Image
            </button>
            <button
              onClick={() => {
                dispatch({ type: "SET_STEP", payload: 6 })
                router.push("/create/compose")
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Adjust Composition
            </button>
          </div>
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
          onClick={() => router.push("/")}
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          Start New Ad
        </button>
      </div>
    </div>
  )
}
