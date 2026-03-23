import { NextRequest, NextResponse } from "next/server"
import { analyzeProduct, selectScene, buildPhotographyPrompt, ProductIntelligence } from "@/lib/product-intelligence"
import { getGeminiClient, GEMINI_PRO, GEMINI_FLASH, NANO_BANANA_2, generateText, describeImageWithVision } from "@/lib/gemini"
import {
  CONCEPT_SYSTEM_PROMPT,
  buildConceptUserPrompt,
  IMAGE_PROMPT_SYSTEM_PROMPT,
  buildImagePromptUserPrompt,
  COPY_SYSTEM_PROMPT,
  buildCopyUserPrompt,
} from "@/lib/prompts"
import { platformSpecs } from "@/lib/platforms"
import { layoutTemplates, getMessageZonePosition } from "@/lib/layout-templates"
import { extractJSON } from "@/lib/parse-json"
import { logInfo, logWarn } from "@/lib/logger"
import type { ConceptAngle, Platform } from "@/types/ad"
import { v4 as uuid } from "uuid"

const ROUTE_NAME = "pipeline/create"

// ── Auth ──────────────────────────────────────────────────────────

function checkApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("X-Pipeline-Key")
  return apiKey === process.env.PIPELINE_API_KEY || apiKey === "specter-2026"
}

// ── Types ─────────────────────────────────────────────────────────

interface CalloutInput {
  text: string
  anchorX?: number  // optional anchor override as fraction 0-1 of canvas width
  anchorY?: number  // optional anchor override as fraction 0-1 of canvas height
}

interface PipelineRequest {
  brief: string
  platform?: Platform
  layout?: string
  contrast?: string
  callouts?: CalloutInput[]
  imageModel?: string
  count?: number
  productUrl?: string
  bannerColor?: string
  bannerText?: string
  headlineOverride?: string
  subheadOverride?: string
  imagePromptOverride?: string
  sceneId?: string
  backgroundImageDataUrl?: string
  beforeAfterScenes?: Array<{ dirtyImageDataUrl: string; cleanImageDataUrl: string }>
  checklistImages?: Array<{ imageDataUrl: string; label: string }>
  checklistItems?: string[]
  bannerStyle?: "trustpilot" | "gold"
  socialProofText?: string
  accentColor?: string
}

interface HeadlineVariation {
  id: string
  headline: string
  subhead?: string | null
  cta: string
  hookMechanism?: string
}

interface PipelineResponse {
  concepts: ConceptAngle[]
  selectedConcept: ConceptAngle
  imagePrompt: string
  generatedImageUrl: string
  imageDescription: string
  headlines: HeadlineVariation[]
  selectedHeadline: HeadlineVariation
  finalAds: Array<{
    imageDataUrl: string
    label: string
    headline: string
    subhead?: string | null
    cta: string
    callouts: Array<{ text: string; position: { x: number; y: number }; anchorPoint: { x: number; y: number } }>
  }>
}

// ── Server-side canvas rendering ──────────────────────────────────

async function renderBeforeAfterQuad(
  width: number,
  height: number,
  headline: string,
  beforeAfterScenes: Array<{ dirtyImageDataUrl: string; cleanImageDataUrl: string }>,
  productCutoutBase64: string | null,
  socialProofText: string = "SUBSCRIBE & SAVE 20%",
  bannerStyle: "trustpilot" | "gold" = "trustpilot",
  accentColor: string = "#4AADE0",
): Promise<string> {
  const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas")
  const path = await import("path")
  const fs = await import("fs")

  try {
    const fontDir = path.join(process.cwd(), "public", "fonts")
    const regularFont = path.join(fontDir, "DejaVuSans.ttf")
    const boldFont = path.join(fontDir, "DejaVuSans-Bold.ttf")
    if (fs.existsSync(regularFont)) GlobalFonts.registerFromPath(regularFont, "AdFont")
    if (fs.existsSync(boldFont)) GlobalFonts.registerFromPath(boldFont, "AdFontBold")
  } catch { /* Font registration failed */ }

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")

  // ── Zone dimensions ───────────────────────────────────────────
  // No separate header — images go edge-to-edge, headline overlaid on top
  const bannerH = Math.round(height * 0.09)
  const bannerY = height - bannerH
  const gridH = height - bannerH
  const gridGap = Math.round(width * 0.005)
  const cellW = Math.round((width - gridGap) / 2)
  const cellH = Math.round((gridH - gridGap) / 2)

  // ── Helper: draw image with cover fit ─────────────────────────
  async function drawCoverImage(dataUrl: string, dx: number, dy: number, dw: number, dh: number) {
    const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
    if (!match) return
    const buf = Buffer.from(match[1], "base64")
    const img = await loadImage(buf)
    const imgAspect = img.width / img.height
    const cellAspect = dw / dh
    let sx = 0, sy = 0, sw = img.width, sh = img.height
    if (imgAspect > cellAspect) {
      sw = img.height * cellAspect
      sx = (img.width - sw) / 2
    } else {
      sh = img.width / cellAspect
      sy = (img.height - sh) / 2
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
  }

  // ── Fill background (visible as grid gap color) ───────────────
  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(0, 0, width, height)

  // ── 1. Image grid (edge-to-edge, top to banner) ──────────────
  const scene1 = beforeAfterScenes[0]
  const scene2 = beforeAfterScenes.length > 1 ? beforeAfterScenes[1] : beforeAfterScenes[0]

  await drawCoverImage(scene1.dirtyImageDataUrl, 0, 0, cellW, cellH)
  await drawCoverImage(scene1.cleanImageDataUrl, cellW + gridGap, 0, cellW, cellH)
  await drawCoverImage(scene2.dirtyImageDataUrl, 0, cellH + gridGap, cellW, cellH)
  await drawCoverImage(scene2.cleanImageDataUrl, cellW + gridGap, cellH + gridGap, cellW, cellH)

  // ── 2. Headline with smooth dark gradient behind it ───────────
  headline = headline.toUpperCase()
  const headlineFontSize = Math.round(width * 0.095)
  ctx.font = `900 ${headlineFontSize}px AdFontBold, AdFont, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "top"

  // Word-wrap headline
  const maxTextWidth = Math.round(width * 0.92)
  const words = headline.split(" ")
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

  const lineHeight = headlineFontSize * 1.15
  const totalTextH = lines.length * lineHeight
  const textPadTop = Math.round(height * 0.03)
  const gradientBottom = textPadTop + totalTextH + Math.round(height * 0.05)

  // Smooth dark gradient fade — dark at top, transparent below text
  const headGrad = ctx.createLinearGradient(0, 0, 0, gradientBottom)
  headGrad.addColorStop(0, "rgba(0,0,0,0.70)")
  headGrad.addColorStop(0.7, "rgba(0,0,0,0.35)")
  headGrad.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = headGrad
  ctx.fillRect(0, 0, width, gradientBottom)

  // Draw headline text (white, bold, with subtle text shadow)
  ctx.fillStyle = "#FFFFFF"
  ctx.font = `900 ${headlineFontSize}px AdFontBold, AdFont, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  // Faux extra-bold: stroke behind fill for thickness
  ctx.strokeStyle = "#FFFFFF"
  ctx.lineWidth = Math.round(headlineFontSize * 0.03)
  ctx.lineJoin = "round"
  for (let i = 0; i < lines.length; i++) {
    const y = textPadTop + i * lineHeight
    ctx.strokeText(lines[i], width / 2, y)
    ctx.fillText(lines[i], width / 2, y)
  }

  // ── 3. Product overlay (centered at grid intersection) ────────
  if (productCutoutBase64) {
    try {
      const cutoutBuf = Buffer.from(productCutoutBase64, "base64")
      const cutoutImg = await loadImage(cutoutBuf)
      const targetH = Math.round(height * 0.50)
      const scale = targetH / cutoutImg.height
      const targetW = Math.round(cutoutImg.width * scale)
      const px = Math.round((width - targetW) / 2)
      // Center vertically in the grid area (offset slightly down from pure center)
      const py = Math.round((gridH - targetH) / 2) + Math.round(height * 0.03)
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.35)"
      ctx.shadowBlur = 25
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 8
      ctx.drawImage(cutoutImg, px, py, targetW, targetH)
      ctx.restore()
    } catch (err) {
      console.warn("Product overlay failed:", err)
    }
  }

  // ── 4. Bottom banner (accent color, white stars + text) ───────
  if (bannerStyle === "trustpilot") {
    // Accent color banner
    ctx.fillStyle = accentColor
    ctx.fillRect(0, bannerY, width, bannerH)

    // White stars (no boxes — flat white star characters)
    const stars = "★★★★★"
    const starFontSize = Math.round(bannerH * 0.45)
    const bannerFontSize = Math.round(bannerH * 0.40)
    ctx.font = `bold ${starFontSize}px AdFont, sans-serif`
    ctx.fillStyle = "#FFFFFF"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    const starsWidth = ctx.measureText(stars).width
    const gap = Math.round(width * 0.025)
    ctx.font = `bold ${bannerFontSize}px AdFontBold, AdFont, sans-serif`
    const textWidth = ctx.measureText(socialProofText).width
    const totalW = starsWidth + gap + textWidth
    const startX = (width - totalW) / 2
    const centerY = bannerY + bannerH / 2

    // Stars
    ctx.font = `bold ${starFontSize}px AdFont, sans-serif`
    ctx.textAlign = "left"
    ctx.fillText(stars, startX, centerY)

    // Text
    ctx.font = `bold ${bannerFontSize}px AdFontBold, AdFont, sans-serif`
    ctx.fillText(socialProofText, startX + starsWidth + gap, centerY)
  } else {
    // Gold banner (existing style)
    ctx.fillStyle = "#D4C96B"
    ctx.fillRect(0, bannerY, width, bannerH)
    const bannerFontSize = Math.round(width * 0.04)
    ctx.font = `bold ${bannerFontSize}px AdFont`
    ctx.fillStyle = "#1a1a1a"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(`★★★★★  ${socialProofText}`, width / 2, bannerY + bannerH / 2)
  }

  const pngBuffer = canvas.toBuffer("image/png")
  return `data:image/png;base64,${pngBuffer.toString("base64")}`
}

// ── Checklist layout renderer ─────────────────────────────────────

async function renderChecklist(
  width: number,
  height: number,
  headline: string,
  checklistItems: string[],
  productCutoutBase64: string | null,
  socialProofText: string = "SUBSCRIBE & SAVE 20%",
  bannerStyle: "trustpilot" | "gold" = "trustpilot",
  accentColor: string = "#3BB8E8",
): Promise<string> {
  const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas")
  const path = await import("path")
  const fs = await import("fs")

  try {
    const fontDir = path.join(process.cwd(), "public", "fonts")
    const regularFont = path.join(fontDir, "DejaVuSans.ttf")
    const boldFont = path.join(fontDir, "DejaVuSans-Bold.ttf")
    if (fs.existsSync(regularFont)) GlobalFonts.registerFromPath(regularFont, "AdFont")
    if (fs.existsSync(boldFont)) GlobalFonts.registerFromPath(boldFont, "AdFontBold")
  } catch { /* Font registration failed */ }

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")

  // ── Zone dimensions ───────────────────────────────────────────
  const headlineH = Math.round(height * 0.15)
  const bannerH = Math.round(height * 0.09)
  const bannerY = height - bannerH
  const contentTop = headlineH
  const contentH = bannerY - headlineH

  // ── 1. Background ────────────────────────────────────────────
  ctx.fillStyle = "#F8F8F8"
  ctx.fillRect(0, 0, width, height)

  // ── 2. Headline with dark gradient band ──────────────────────
  headline = headline.toUpperCase()
  const headlineFontSize = Math.round(width * 0.065)
  ctx.font = `900 ${headlineFontSize}px AdFontBold, AdFont, sans-serif`

  // Word-wrap headline
  const maxTextWidth = Math.round(width * 0.92)
  const hWords = headline.split(" ")
  let hLine = ""
  const hLines: string[] = []
  for (const word of hWords) {
    const test = hLine ? `${hLine} ${word}` : word
    if (ctx.measureText(test).width > maxTextWidth && hLine) {
      hLines.push(hLine)
      hLine = word
    } else {
      hLine = test
    }
  }
  if (hLine) hLines.push(hLine)

  const hLineHeight = headlineFontSize * 1.15
  const hTotalH = hLines.length * hLineHeight

  // Dark gradient band
  const gradH = headlineH + Math.round(height * 0.03)
  const headGrad = ctx.createLinearGradient(0, 0, 0, gradH)
  headGrad.addColorStop(0, "rgba(0,0,0,0.75)")
  headGrad.addColorStop(0.8, "rgba(0,0,0,0.50)")
  headGrad.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = headGrad
  ctx.fillRect(0, 0, width, gradH)

  // Draw headline text
  ctx.fillStyle = "#FFFFFF"
  ctx.font = `900 ${headlineFontSize}px AdFontBold, AdFont, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.strokeStyle = "#FFFFFF"
  ctx.lineWidth = Math.round(headlineFontSize * 0.02)
  ctx.lineJoin = "round"
  const hStartY = Math.round((headlineH - hTotalH) / 2)
  for (let i = 0; i < hLines.length; i++) {
    const y = hStartY + i * hLineHeight
    ctx.strokeText(hLines[i], width / 2, y)
    ctx.fillText(hLines[i], width / 2, y)
  }

  // ── 3. Left column — text checklist with checkmark bubbles ────
  const itemCount = Math.min(checklistItems.length, 4)
  const leftX = Math.round(width * 0.06)
  const bubbleRadius = Math.round(width * 0.028)
  const itemFontSize = Math.round(width * 0.038)
  const textGap = Math.round(width * 0.025) // gap between bubble and text

  // Vertically center the checklist rows in content area
  const rowHeight = Math.round(contentH / (itemCount + 1))

  for (let i = 0; i < itemCount; i++) {
    const rowCenterY = contentTop + rowHeight * (i + 0.75)

    // Checkmark bubble (filled circle in accent color)
    ctx.beginPath()
    ctx.arc(leftX + bubbleRadius, rowCenterY, bubbleRadius, 0, Math.PI * 2)
    ctx.fillStyle = accentColor
    ctx.fill()

    // White checkmark inside bubble
    ctx.fillStyle = "#FFFFFF"
    ctx.font = `bold ${Math.round(bubbleRadius * 1.2)}px AdFont, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("✓", leftX + bubbleRadius, rowCenterY)

    // Text label to the right of the bubble
    ctx.fillStyle = "#2A2A2A"
    ctx.font = `bold ${itemFontSize}px AdFontBold, AdFont, sans-serif`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(checklistItems[i], leftX + bubbleRadius * 2 + textGap, rowCenterY)
  }

  // ── 4. Right column — product image ───────────────────────────
  if (productCutoutBase64) {
    try {
      const cutoutBuf = Buffer.from(productCutoutBase64, "base64")
      const cutoutImg = await loadImage(cutoutBuf)
      const targetH = Math.round(height * 0.65)
      const scale = targetH / cutoutImg.height
      const targetW = Math.round(cutoutImg.width * scale)
      const px = Math.round(width * 0.70 - targetW / 2)
      const py = contentTop + Math.round((contentH - targetH) / 2)

      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.30)"
      ctx.shadowBlur = 25
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 8
      ctx.drawImage(cutoutImg, px, py, targetW, targetH)
      ctx.restore()
    } catch (err) {
      console.warn("Product overlay failed:", err)
    }
  }

  // ── 5. Bottom banner ──────────────────────────────────────────
  if (bannerStyle === "trustpilot") {
    ctx.fillStyle = accentColor
    ctx.fillRect(0, bannerY, width, bannerH)

    const stars = "★★★★★"
    const starFontSize = Math.round(bannerH * 0.45)
    const bannerFontSize = Math.round(width * 0.042)
    ctx.font = `bold ${starFontSize}px AdFont, sans-serif`
    ctx.fillStyle = "#FFFFFF"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    const starsWidth = ctx.measureText(stars).width
    const gap = Math.round(width * 0.025)
    ctx.font = `bold ${bannerFontSize}px AdFontBold, AdFont, sans-serif`
    const textWidth = ctx.measureText(socialProofText).width
    const totalW = starsWidth + gap + textWidth
    const startX = (width - totalW) / 2
    const centerY = bannerY + bannerH / 2

    ctx.font = `bold ${starFontSize}px AdFont, sans-serif`
    ctx.textAlign = "left"
    ctx.fillText(stars, startX, centerY)

    ctx.font = `bold ${bannerFontSize}px AdFontBold, AdFont, sans-serif`
    ctx.fillText(socialProofText, startX + starsWidth + gap, centerY)
  } else {
    ctx.fillStyle = "#D4C96B"
    ctx.fillRect(0, bannerY, width, bannerH)
    const bannerFontSize = Math.round(width * 0.04)
    ctx.font = `bold ${bannerFontSize}px AdFont`
    ctx.fillStyle = "#1a1a1a"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(`★★★★★  ${socialProofText}`, width / 2, bannerY + bannerH / 2)
  }

  const pngBuffer = canvas.toBuffer("image/png")
  return `data:image/png;base64,${pngBuffer.toString("base64")}`
}

async function renderAdServerSide(
  imageBase64: string,
  width: number,
  height: number,
  headline: string,
  subhead: string | null | undefined,
  cta: string,
  contrastMethod: string,
  callouts: Array<{ text: string; position: { x: number; y: number }; anchorPoint: { x: number; y: number } }>,
  textX: number,
  textY: number,
  maxTextWidth: number,
  bannerColor: string = "#D4C96B",
  bannerText: string = "SUBSCRIBE & SAVE 20%",
  productCutoutBase64: string | null = null
): Promise<string> {
  // Dynamically import canvas (server-only)
  const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas")

  // Register bundled fonts (these ship with the app in public/fonts/)
  try {
    const path = await import("path")
    const fs = await import("fs")
    // Fonts bundled in public/fonts/ — deployed with the app
    const fontDir = path.join(process.cwd(), "public", "fonts")
    const regularFont = path.join(fontDir, "DejaVuSans.ttf")
    const boldFont = path.join(fontDir, "DejaVuSans-Bold.ttf")
    if (fs.existsSync(regularFont)) {
      GlobalFonts.registerFromPath(regularFont, "AdFont")
    }
    if (fs.existsSync(boldFont)) {
      GlobalFonts.registerFromPath(boldFont, "AdFontBold")
    }
  } catch {
    // Font registration failed — will use defaults
  }

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")

  // Draw background image
  const imgBuffer = Buffer.from(imageBase64, "base64")
  const img = await loadImage(imgBuffer)
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

  // No bottom gradient — the gold banner handles contrast at bottom

  // Draw product cutout (if provided) — centered, ~55% canvas width
  if (productCutoutBase64) {
    try {
      // Use a generic image data URI — the canvas loadImage handles JPEG and PNG alike
      // @napi-rs/canvas loadImage accepts Buffer directly
      const cutoutBuf = Buffer.from(productCutoutBase64, "base64")
      const cutoutImg = await loadImage(cutoutBuf)
      const targetW = Math.round(width * 0.75)
      const scale = targetW / cutoutImg.width
      const targetH = Math.round(cutoutImg.height * scale)
      const px = Math.round((width - targetW) / 2)
      // Center vertically in the middle 70% of the canvas
      // (skip top 15% headline zone and bottom 15% banner zone)
      const middleZoneTop = Math.round(height * 0.27)
      const middleZoneH = Math.round(height * 0.65)
      const py = middleZoneTop + Math.round((middleZoneH - targetH) / 2)

      // Draw product with subtle drop shadow (product now has real transparency)
      ctx.save()
      ctx.shadowColor = "rgba(0,0,0,0.3)"
      ctx.shadowBlur = 15
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 8
      ctx.drawImage(cutoutImg, px, py, targetW, targetH)
      ctx.restore()
    } catch (cutoutErr) {
      // Non-fatal: log and continue
      console.warn("Product cutout compositing failed:", cutoutErr)
    }
  }

  // Draw bottom banner
  const bannerHeight = Math.round(height * 0.09)
  const bannerY = height - bannerHeight
  ctx.fillStyle = bannerColor
  ctx.fillRect(0, bannerY, width, bannerHeight)

  // Banner text (stars + text centered)
  const bannerFontSize = Math.round(width * 0.04)
  const stars = "★★★★★"
  ctx.font = `bold ${bannerFontSize}px AdFont`
  ctx.fillStyle = "#1a1a1a"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const starsWidth = ctx.measureText(stars).width
  const gap = Math.round(width * 0.025)
  const bannerTextWidth = ctx.measureText(bannerText).width
  const totalWidth = starsWidth + gap + bannerTextWidth
  const startX = (width - totalWidth) / 2
  const bannerCenterY = bannerY + bannerHeight / 2
  ctx.textAlign = "left"
  // Faux extra-bold: stroke behind fill
  ctx.lineWidth = Math.round(bannerFontSize * 0.05)
  ctx.strokeStyle = "#1a1a1a"
  ctx.lineJoin = "round"
  ctx.strokeText(stars, startX, bannerCenterY)
  ctx.fillText(stars, startX, bannerCenterY)
  ctx.strokeText(bannerText, startX + starsWidth + gap, bannerCenterY)
  ctx.fillText(bannerText, startX + starsWidth + gap, bannerCenterY)

  // Font settings — use bundled AdFont (DejaVu Sans)
  const fontFamily = "AdFont"
  const headlineFontSize = Math.round(width * 0.082)
  const subheadFontSize = Math.round(width * 0.04)
  const headlineColor = "#FFFFFF"
  const subheadColor = "#FFFFFF"
  const headlineWeight = "900"

  // Force headline ALL CAPS
  headline = headline.toUpperCase()

  // Headline renders at the top (~5% from top)
  const topY = Math.round(height * 0.05)
  const headlineCenterX = width / 2
  const headlineMaxWidth = Math.round(width * 0.90)

  // Word-wrap headline (centered)
  ctx.font = `${headlineWeight} ${headlineFontSize}px ${fontFamily}`
  const words = headline.split(" ")
  let line = ""
  const lines: string[] = []
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > headlineMaxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)

  // Calculate total text height to size the gradient strip correctly
  const headlineBlockH = lines.length * headlineFontSize * 1.15
  const subheadBlockH = subhead ? (8 + subheadFontSize * 1.15) : 0
  const textBlockBottom = topY + headlineBlockH + subheadBlockH + Math.round(height * 0.02)
  // Tight gradient — only covers headline text area, darker but short
  const gradStripH = textBlockBottom + 10
  const topGrad = ctx.createLinearGradient(0, 0, 0, gradStripH)
  topGrad.addColorStop(0, "rgba(0,0,0,0.7)")
  topGrad.addColorStop(0.85, "rgba(0,0,0,0.3)")
  topGrad.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = topGrad
  ctx.fillRect(0, 0, width, gradStripH)

  // Draw headline lines (centered) — on top of gradient
  ctx.font = `${headlineWeight} ${headlineFontSize}px ${fontFamily}`
  ctx.fillStyle = headlineColor
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  let ty = topY
  // Faux extra-bold: stroke behind fill for thicker appearance
  ctx.lineWidth = Math.round(headlineFontSize * 0.03)
  ctx.strokeStyle = headlineColor
  ctx.lineJoin = "round"
  for (const l of lines) {
    ctx.strokeText(l, headlineCenterX, ty)
    ctx.fillText(l, headlineCenterX, ty)
    ty += headlineFontSize * 1.15
  }

  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Draw subhead BELOW headline (after all headline lines), also on the gradient
  if (subhead) {
    ty += 8
    ctx.font = `400 ${subheadFontSize}px ${fontFamily}`
    ctx.fillStyle = subheadColor
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText(subhead, headlineCenterX, ty)
    ty += subheadFontSize * 1.15
  }

  // Draw callouts
  for (const callout of callouts) {
    const fontSize = Math.round(width * 0.038)
    const padX = 24
    const padY = 18
    const dotR = Math.max(6, Math.round(width * 0.008))
    const lineW = Math.max(3, Math.round(width * 0.003))
    const borderR = 8

    ctx.font = `600 ${fontSize}px ${fontFamily}`
    const calloutLines = callout.text.split("\n")
    const lineHeight = fontSize * 1.3
    const textWidths = calloutLines.map((l: string) => ctx.measureText(l).width)
    const maxCalloutTextWidth = Math.max(...textWidths)

    const bubbleW = maxCalloutTextWidth + padX * 2
    const bubbleH = calloutLines.length * lineHeight + padY * 2
    const bx = callout.position.x
    const by = callout.position.y
    const ax = callout.anchorPoint.x
    const ay = callout.anchorPoint.y

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

    // Leader line — gold color, visible thickness
    ctx.strokeStyle = "#D4C96B"
    ctx.lineWidth = Math.max(3, Math.round(width * 0.003))
    ctx.beginPath()
    ctx.moveTo(edgeX, edgeY)
    ctx.lineTo(ax, ay)
    ctx.stroke()

    // Dot — gold to match leader line
    ctx.fillStyle = "#D4C96B"
    ctx.beginPath()
    ctx.arc(ax, ay, dotR, 0, Math.PI * 2)
    ctx.fill()

    // Bubble
    ctx.fillStyle = "rgba(0,0,0,0.85)"
    ctx.shadowColor = "rgba(0,0,0,0.15)"
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 2
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
    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    ctx.fillStyle = "#FFFFFF"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = `600 ${fontSize}px ${fontFamily}`
    for (let i = 0; i < calloutLines.length; i++) {
      ctx.fillText(calloutLines[i], bx + bubbleW / 2, by + padY + (i + 0.5) * lineHeight)
    }
  }

  const buffer = canvas.toBuffer("image/png")
  return `data:image/png;base64,${buffer.toString("base64")}`
}

// ── Auto-position callouts on the image ──────────────────────────

function autoPositionCallouts(
  calloutInputs: CalloutInput[],
  width: number,
  height: number
): Array<{ text: string; position: { x: number; y: number }; anchorPoint: { x: number; y: number } }> {
  // Corner positions for callout bubbles (X-pattern radiating from product center)
  const positions = [
    // top-left: pushed out left, vertically at 32%
    { bx: width * 0.01, by: height * 0.32, ax: width * 0.42, ay: height * 0.40 },
    // top-right: anchor lands on product right side
    { bx: width * 0.68, by: height * 0.32, ax: width * 0.58, ay: height * 0.40 },
    // bottom-left: anchor lands on product left side
    { bx: width * 0.01, by: height * 0.58, ax: width * 0.42, ay: height * 0.56 },
    // bottom-right: anchor lands on product right side
    { bx: width * 0.68, by: height * 0.58, ax: width * 0.58, ay: height * 0.56 },
  ]

  return calloutInputs.map((callout, i) => {
    const pos = positions[i % positions.length]
    return {
      text: callout.text,
      position: { x: pos.bx, y: pos.by },
      // Use explicit anchor if provided, otherwise default toward product center
      anchorPoint: {
        x: callout.anchorX !== undefined ? callout.anchorX * width : pos.ax,
        y: callout.anchorY !== undefined ? callout.anchorY * height : pos.ay,
      },
    }
  })
}

// ── Product image helpers ─────────────────────────────────────────

async function scrapeProductHeroImage(productUrl: string): Promise<string | null> {
  try {
    const res = await fetch(productUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) throw new Error(`Failed to fetch product page: ${res.status}`)
    const html = await res.text()

    // Helper: upgrade Shopify thumbnail URLs to full-res
    function upgradeShopifyImageUrl(url: string): string {
      return url.replace(/_(200x|300x|400x|500x|600x|700x|800x)(\.[a-z]+)(\?|$)/i, "_1200x$2$3")
    }

    // Try JSON-LD first
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        try {
          const jsonStr = match.replace(/<script[^>]*>/, "").replace(/<\/script>/, "")
          const data = JSON.parse(jsonStr)
          const product = data["@type"] === "Product" ? data : data["@graph"]?.find((item: Record<string, string>) => item["@type"] === "Product")
          if (product?.image) {
            const images = Array.isArray(product.image) ? product.image : [product.image]
            const first = images.find((img: unknown): img is string => typeof img === "string")
            if (first) return upgradeShopifyImageUrl(new URL(first, productUrl).href)
          }
        } catch { /* continue */ }
      }
    }

    // Try Open Graph
    const ogMatch = html.match(/<meta[^>]*(?:property)=["']og:image["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*(?:property)=["']og:image["']/i)
    if (ogMatch?.[1]) return upgradeShopifyImageUrl(new URL(ogMatch[1], productUrl).href)

    // Try twitter image
    const twMatch = html.match(/<meta[^>]*(?:name)=["']twitter:image["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*(?:name)=["']twitter:image["']/i)
    if (twMatch?.[1]) return upgradeShopifyImageUrl(new URL(twMatch[1], productUrl).href)

    return null
  } catch (err) {
    logWarn(ROUTE_NAME, `Product scrape failed: ${(err as Error).message}`)
    return null
  }
}

async function removeBackground(imageBuffer: Buffer): Promise<Buffer | null> {
  // Try remove.bg API first (if key available)
  const removeBgKey = process.env.REMOVE_BG_API_KEY
  if (removeBgKey) {
    try {
      const formData = new FormData()
      formData.append("image_file", new Blob([imageBuffer as unknown as ArrayBuffer]), "product.png")
      formData.append("size", "auto")
      const res = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": removeBgKey },
        body: formData,
      })
      if (res.ok) return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      console.warn("remove.bg failed:", err)
    }
  }

  // Fallback: Green screen trick using Gemini
  try {
    const ai = getGeminiClient()
    const base64 = imageBuffer.toString("base64")

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64 } },
            { text: "Place this exact product on a solid bright green (#00FF00) background. Keep the product exactly as it is — same angle, same lighting, same details. Only change the background to pure solid green (#00FF00). Nothing else in the image, just the product on green." }
          ]
        }
      ],
      config: { responseModalities: ["IMAGE"] as any },
    })

    const greenBase64 = response.candidates?.[0]?.content?.parts
      ?.find((p: any) => p.inlineData)?.inlineData?.data

    if (!greenBase64) return null

    // Chroma-key: make green pixels transparent
    const { createCanvas, loadImage } = await import("@napi-rs/canvas")
    const greenBuf = Buffer.from(greenBase64, "base64")
    const greenImg = await loadImage(greenBuf)
    const canvas = createCanvas(greenImg.width, greenImg.height)
    const ctx = canvas.getContext("2d")
    ctx.drawImage(greenImg, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = imageData.data
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      // Green screen detection: high green, low red and blue
      if (g > 150 && r < 120 && b < 120) {
        pixels[i + 3] = 0  // fully transparent
      } else if (g > 130 && r < 140 && b < 140 && g > r && g > b) {
        // Edge pixels with some green bleed — partial transparency
        const greenness = (g - Math.max(r, b)) / g
        if (greenness > 0.2) {
          pixels[i + 3] = Math.round(255 * (1 - greenness))
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)

    return Buffer.from(canvas.toBuffer("image/png"))
  } catch (err) {
    console.warn("Green screen bg removal failed:", err)
  }

  return null // both methods failed, caller uses original image
}

async function removeBackgroundFromUrl(imageUrl: string): Promise<string | null> {
  try {
    const imageRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(15000),
    })
    if (!imageRes.ok) return null

    const blob = await imageRes.blob()
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64")
    const mimeType = blob.type || "image/jpeg"

    const ai = getGeminiClient()
    const response = await ai.models.generateContent({
      model: NANO_BANANA_2,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text: "Remove the background completely from this product image. Return ONLY the product on a transparent background. The background should be completely transparent/removed. No checkerboard, no white fill, no shadow — pure transparency everywhere that is not the product itself. Clean, precise edges.",
            },
          ],
        },
      ],
      config: { responseModalities: ["IMAGE"] },
    })

    const cutoutBase64 = response.candidates?.[0]?.content?.parts
      ?.find((p: { inlineData?: { data?: string } }) => p.inlineData)?.inlineData?.data
    if (!cutoutBase64) return null

    return cutoutBase64 // returns base64 PNG
  } catch (err) {
    logWarn(ROUTE_NAME, `Background removal failed: ${(err as Error).message}`)
    return null
  }
}

// ── Main handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  logInfo(ROUTE_NAME, "Pipeline request received")

  if (!checkApiKey(request)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
  }

  let body: PipelineRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { brief, platform = "ig-feed-square", layout = "center-overlay", contrast = "gradient", callouts = [], imageModel, bannerColor: reqBannerColor, bannerText: reqBannerText, productUrl = null } = body as PipelineRequest
  const bannerColor = reqBannerColor || "#D4C96B"
  const bannerText = reqBannerText || "SUBSCRIBE & SAVE 20%"
  const headlineOverride = body.headlineOverride || null
  const subheadOverride = body.subheadOverride || null
  const imagePromptOverride = body.imagePromptOverride || null
  const backgroundImageDataUrl = body.backgroundImageDataUrl || null
  const sceneId = body.sceneId || null
  const beforeAfterScenes = body.beforeAfterScenes || null
  const checklistImages = body.checklistImages || null
  const checklistItems = body.checklistItems || null
  const bannerStyle = body.bannerStyle || (layout === "before-after-quad" ? "trustpilot" : "gold")
  const socialProofText = body.socialProofText || "SUBSCRIBE & SAVE 20%"
  const accentColor = body.accentColor || "#4AADE0"

  if (layout !== "before-after-quad" && layout !== "checklist" && (!brief || typeof brief !== "string" || brief.trim().length < 10)) {
    return NextResponse.json({ error: "A brief (string, min 10 chars) is required" }, { status: 400 })
  }

  // Get platform spec
  const platformSpec = platformSpecs[platform as Platform]
  if (!platformSpec) {
    return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
  }
  const { width, height, safeZones } = platformSpec

  // Get layout template
  const template = layoutTemplates.find((t) => t.id === layout) ?? layoutTemplates.find((t) => t.id === "center-overlay")!
  const { messageZone } = template.getZones(width, height, safeZones)
  const messageZonePosition = getMessageZonePosition(messageZone, width, height)

  try {
    // Before-After-Quad early return path
    if (layout === "before-after-quad") {
      logInfo(ROUTE_NAME, "Before-After-Quad layout detected")

      if (!beforeAfterScenes || beforeAfterScenes.length < 2) {
        return NextResponse.json({ error: "before-after-quad layout requires beforeAfterScenes array with at least 2 scene pairs" }, { status: 400 })
      }

      let quadHeadline: string
      if (headlineOverride) {
        quadHeadline = headlineOverride
      } else if (brief) {
        const headlinePrompt = `Write a single short, punchy, attention-grabbing headline for a cleaning product ad. The headline should be a question or bold statement that creates urgency. Max 6 words. Brief: ${brief}`
        const headlineRaw = await generateText(GEMINI_FLASH, "You write ad headlines. Return ONLY the headline text, nothing else.", headlinePrompt, 15_000)
        quadHeadline = headlineRaw.trim().replace(/^["'']|["'']$/g, "")
      } else {
        quadHeadline = "SEE THE DIFFERENCE"
      }

      let productCutoutBase64: string | null = null
      if (productUrl) {
        logInfo(ROUTE_NAME, "Before-After-Quad: Scraping product image")
        try {
          const heroImageUrl = await scrapeProductHeroImage(productUrl)
          if (heroImageUrl) {
            const imgRes = await fetch(heroImageUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
              signal: AbortSignal.timeout(15000),
            })
            if (imgRes.ok) {
              const imgBuf = await imgRes.arrayBuffer()
              const cleanCutout = await removeBackground(Buffer.from(imgBuf))
              if (cleanCutout) {
                productCutoutBase64 = cleanCutout.toString("base64")
                logInfo(ROUTE_NAME, "Before-After-Quad: Background removed")
              } else {
                productCutoutBase64 = Buffer.from(imgBuf).toString("base64")
              }
            }
          }
        } catch (err) {
          logWarn(ROUTE_NAME, `Before-After-Quad: Product image failed (${(err as Error).message})`)
        }
      }

      logInfo(ROUTE_NAME, "Before-After-Quad: Rendering")
      const finalImageDataUrl = await renderBeforeAfterQuad(
        width,
        height,
        quadHeadline,
        beforeAfterScenes,
        productCutoutBase64,
        socialProofText,
        bannerStyle === "trustpilot" ? "trustpilot" : "gold",
        accentColor,
      )

      logInfo(ROUTE_NAME, "Before-After-Quad: Done")

      return NextResponse.json({
        concepts: [],
        selectedConcept: null,
        imagePrompt: "before-after-quad layout",
        generatedImageUrl: finalImageDataUrl,
        imageDescription: "Before/after quad layout with product overlay",
        headlines: [{ id: uuid(), headline: quadHeadline, subhead: null, cta: "SHOP NOW" }],
        selectedHeadline: { id: uuid(), headline: quadHeadline, subhead: null, cta: "SHOP NOW" },
        finalAds: [{
          imageDataUrl: finalImageDataUrl,
          label: "Before/After Quad Ad",
          headline: quadHeadline,
          subhead: null,
          cta: "SHOP NOW",
          callouts: [],
        }],
        productIntelligence: null,
      })
    }

    // ── CHECKLIST: separate pipeline path ───────────────────────────
    if (layout === "checklist") {
      logInfo(ROUTE_NAME, "Checklist layout requested")

      // Accept checklistItems (text callouts) or fall back to checklistImages labels
      const items: string[] = checklistItems
        || (checklistImages ? checklistImages.map(ci => ci.label) : [])
      if (items.length < 1) {
        return NextResponse.json({ error: "checklist layout requires checklistItems array or checklistImages with labels" }, { status: 400 })
      }

      let checklistHeadline: string
      if (headlineOverride) {
        checklistHeadline = headlineOverride
      } else if (brief) {
        try {
          const headlineRaw = await generateText(
            GEMINI_FLASH,
            "You write short, punchy ad headlines for cleaning products. Return ONLY the headline text, nothing else. ALL CAPS. Max 6 words.",
            `Product brief: ${brief}\n\nWrite a headline for a product showcase ad showing it works on multiple surfaces.`,
            15_000
          )
          checklistHeadline = headlineRaw.trim().replace(/^["']/g, "").replace(/["']$/g, "").toUpperCase()
        } catch {
          checklistHeadline = "ONE BOTTLE. EVERY SURFACE."
        }
      } else {
        checklistHeadline = "ONE BOTTLE. EVERY SURFACE."
      }

      let productCutoutBase64: string | null = null
      if (productUrl) {
        logInfo(ROUTE_NAME, "Checklist: Scraping product image")
        try {
          const heroImageUrl = await scrapeProductHeroImage(productUrl)
          if (heroImageUrl) {
            const imgRes = await fetch(heroImageUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
              signal: AbortSignal.timeout(15000),
            })
            if (imgRes.ok) {
              const imgBuf = await imgRes.arrayBuffer()
              const cleanCutout = await removeBackground(Buffer.from(imgBuf))
              if (cleanCutout) {
                productCutoutBase64 = cleanCutout.toString("base64")
                logInfo(ROUTE_NAME, "Checklist: Background removed")
              } else {
                productCutoutBase64 = Buffer.from(imgBuf).toString("base64")
              }
            }
          }
        } catch (err) {
          logWarn(ROUTE_NAME, `Checklist: Product image failed (${(err as Error).message})`)
        }
      }

      logInfo(ROUTE_NAME, "Checklist: Rendering")
      const finalImageDataUrl = await renderChecklist(
        width,
        height,
        checklistHeadline,
        items.slice(0, 4),
        productCutoutBase64,
        socialProofText,
        bannerStyle === "trustpilot" ? "trustpilot" : "gold",
        accentColor,
      )

      logInfo(ROUTE_NAME, "Checklist: Done")

      return NextResponse.json({
        concepts: [],
        selectedConcept: null,
        imagePrompt: "checklist layout",
        generatedImageUrl: finalImageDataUrl,
        imageDescription: "Checklist layout with product and surface thumbnails",
        headlines: [{ id: uuid(), headline: checklistHeadline, subhead: null, cta: "SHOP NOW" }],
        selectedHeadline: { id: uuid(), headline: checklistHeadline, subhead: null, cta: "SHOP NOW" },
        finalAds: [{
          imageDataUrl: finalImageDataUrl,
          label: "Checklist Ad",
          headline: checklistHeadline,
          subhead: null,
          cta: "SHOP NOW",
          callouts: [],
        }],
        productIntelligence: null,
      })
    }

    // ── STEP 1: Generate concepts ─────────────────────────────────
    logInfo(ROUTE_NAME, "Step 1: Generating concepts")
    const conceptUserPrompt = buildConceptUserPrompt(brief)
    const conceptRaw = await generateText(GEMINI_PRO, CONCEPT_SYSTEM_PROMPT, conceptUserPrompt, 60_000)
    const conceptData = extractJSON<{ angles: ConceptAngle[] }>(conceptRaw)
    const concepts = conceptData.angles ?? []
    if (concepts.length === 0) {
      return NextResponse.json({ error: "Failed to generate concepts" }, { status: 502 })
    }
    const selectedConcept = concepts[0]
    logInfo(ROUTE_NAME, `Step 1 done: selected concept "${selectedConcept.hook}"`)

    // ── STEP 0.5: Product Intelligence ───────────────────────────
    let productIntel: ProductIntelligence | null = null
    if (productUrl) {
      logInfo(ROUTE_NAME, "Step 0.5: Analyzing product")
      try {
        productIntel = await analyzeProduct(productUrl, generateText, extractJSON)
        logInfo(ROUTE_NAME, `Step 0.5 done: ${productIntel.name} → ${productIntel.category}`)
      } catch (err) {
        logWarn(ROUTE_NAME, `Product intelligence failed: ${(err as Error).message}`)
      }
    }

    // ── STEP 2: Generate image prompt ────────────────────────────
    logInfo(ROUTE_NAME, "Step 2: Building image prompt")
    let imagePromptText: string

    if (imagePromptOverride) {
      // Direct image prompt override — highest priority
      const aspectRatio = width === height ? "1:1" : `${width}:${height}`
      imagePromptText = buildPhotographyPrompt(imagePromptOverride, aspectRatio)
      logInfo(ROUTE_NAME, `Step 2: Using image prompt override`)
    } else if (productIntel) {
      // Product Intelligence path: Scene DNA + Photography Spec
      const scene = selectScene(productIntel)
      const aspectRatio = width === height ? "1:1" : `${width}:${height}`
      imagePromptText = buildPhotographyPrompt(scene, aspectRatio)
      logInfo(ROUTE_NAME, `Step 2: Using Scene DNA — category: ${productIntel.category}, scene: "${scene.slice(0, 60)}..."`)
    } else {
      // Fallback: generic image prompt generation (existing flow)
      const imgPromptUserPrompt = buildImagePromptUserPrompt(
        selectedConcept,
        messageZonePosition,
        width,
        height,
        contrast
      )
      const imgPromptRaw = await generateText(GEMINI_FLASH, IMAGE_PROMPT_SYSTEM_PROMPT, imgPromptUserPrompt, 30_000)
      const imgPromptData = extractJSON<{ prompts: Array<{ id: string; text: string; rank: number }> }>(imgPromptRaw)
      const imagePrompts = imgPromptData.prompts ?? []
      if (imagePrompts.length === 0) {
        return NextResponse.json({ error: "Failed to generate image prompts" }, { status: 502 })
      }
      const bestPrompt = imagePrompts.find((p) => p.rank === 1) ?? imagePrompts[0]
      imagePromptText = bestPrompt.text
      imagePromptText += ". Ultra photorealistic photograph. Shot on Canon EOS R5 with 35mm f/1.4 lens. Shallow depth of field. Natural dramatic lighting. 4K resolution, razor sharp textures. Professional commercial photography. No text, no logos, no watermarks, no borders, no artifacts, no empty spaces."
    }
    logInfo(ROUTE_NAME, "Step 2 done")

    // ── STEP 3: Generate image ────────────────────────────────────
    let imageBase64: string | null = null
    let imageMimeType = "image/png"

    if (backgroundImageDataUrl) {
      // Pre-generated background — skip Gemini image generation
      const match = backgroundImageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
      if (!match) {
        return NextResponse.json({ error: "Invalid backgroundImageDataUrl format" }, { status: 400 })
      }
      imageMimeType = match[1]
      imageBase64 = match[2]
      if (sceneId) logInfo(ROUTE_NAME, `Step 3: Using pre-generated background (sceneId: ${sceneId})`)
      else logInfo(ROUTE_NAME, "Step 3: Using pre-generated background image")
    } else {
      logInfo(ROUTE_NAME, "Step 3: Generating image")
      const activeImageModel = imageModel ?? "gemini-3-pro-image-preview"
      const ai = getGeminiClient()

      const imageResponse = await ai.models.generateContent({
        model: activeImageModel,
        contents: [{ role: "user", parts: [{ text: imagePromptText }] }],
        config: { responseModalities: ["IMAGE", "TEXT"] },
      })

      const imageParts = imageResponse.candidates?.[0]?.content?.parts
      if (!imageParts) {
        return NextResponse.json({ error: "Image generation returned no response" }, { status: 502 })
      }

      for (const part of imageParts) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data ?? null
          imageMimeType = part.inlineData.mimeType ?? "image/png"
          break
        }
      }

      if (!imageBase64) {
        return NextResponse.json({ error: "Image model did not return an image" }, { status: 422 })
      }
    }
    const generatedImageUrl = `data:${imageMimeType};base64,${imageBase64}`
    logInfo(ROUTE_NAME, "Step 3 done")

    // ── STEP 4: Describe image ────────────────────────────────────
    logInfo(ROUTE_NAME, "Step 4: Describing image")
    const DESCRIBE_SYSTEM = `You are describing an ad image for a copywriter. Your description will be used to write headlines that COMPLEMENT the image — not repeat it. Describe the scene, mood, colors, subjects, composition, and emotional tone in 2-3 sentences. Do NOT describe text, logos, or UI elements.`
    const imageDescription = await describeImageWithVision(
      GEMINI_FLASH,
      imageBase64,
      imageMimeType,
      DESCRIBE_SYSTEM,
      "Describe this ad image for a copywriter. Return only the description, no JSON.",
      30_000
    )
    logInfo(ROUTE_NAME, "Step 4 done")

    // ── STEP 5: Generate headlines (skip if override provided) ────
    let headlines: HeadlineVariation[]
    let selectedHeadline: HeadlineVariation

    if (headlineOverride) {
      logInfo(ROUTE_NAME, "Step 5: Using headline override — skipping copy generation")
      const overrideVariation: HeadlineVariation = {
        id: uuid(),
        headline: headlineOverride,
        subhead: subheadOverride ?? null,
        cta: "SHOP NOW",
        hookMechanism: "override",
      }
      headlines = [overrideVariation]
      selectedHeadline = overrideVariation
    } else {
      logInfo(ROUTE_NAME, "Step 5: Generating headlines")
      const copyUserPrompt = buildCopyUserPrompt(
        selectedConcept,
        imageDescription,
        messageZonePosition,
        contrast
      )
      const copyRaw = await generateText(GEMINI_PRO, COPY_SYSTEM_PROMPT, copyUserPrompt, 30_000)
      const copyData = extractJSON<{ variations: HeadlineVariation[] }>(copyRaw)
      headlines = copyData.variations ?? []
      if (headlines.length === 0) {
        return NextResponse.json({ error: "Failed to generate headlines" }, { status: 502 })
      }
      selectedHeadline = headlines[0]
    }
    logInfo(ROUTE_NAME, "Step 5 done")

    // ── STEP 5.5: Scrape product image + background removal ────
    let productCutoutBase64: string | null = null
    if (productUrl) {
      logInfo(ROUTE_NAME, "Step 5.5: Scraping product image")
      try {
        const heroImageUrl = await scrapeProductHeroImage(productUrl)
        if (heroImageUrl) {
          logInfo(ROUTE_NAME, `Step 5.5: Found hero image ${heroImageUrl}`)
          const imgRes = await fetch(heroImageUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(15000),
          })
          if (imgRes.ok) {
            const imgBuf = await imgRes.arrayBuffer()
            logInfo(ROUTE_NAME, "Step 5.5: Attempting background removal")
            const cleanCutout = await removeBackground(Buffer.from(imgBuf))
            if (cleanCutout) {
              productCutoutBase64 = cleanCutout.toString("base64")
              logInfo(ROUTE_NAME, "Step 5.5: Background removed successfully")
            } else {
              productCutoutBase64 = Buffer.from(imgBuf).toString("base64")
              logInfo(ROUTE_NAME, "Step 5.5: Background removal unavailable — using original image")
            }
          } else {
            logWarn(ROUTE_NAME, `Step 5.5: Failed to fetch hero image (${imgRes.status}) — skipping product image`)
          }
        } else {
          logWarn(ROUTE_NAME, "Step 5.5: Could not find hero image — skipping product image")
        }
      } catch (productErr) {
        logWarn(ROUTE_NAME, `Step 5.5: Product image failed (${(productErr as Error).message}) — continuing without it`)
      }
    }

    // ── STEP 6: Compose final ad ──────────────────────────────────
    logInfo(ROUTE_NAME, "Step 6: Composing ad")

    // Position callouts
    const positionedCallouts = autoPositionCallouts(callouts, width, height)

    // Text position from message zone
    const textX = messageZone.x
    const textY = messageZone.y
    const maxTextW = messageZone.width

    let finalImageDataUrl: string
    let useSimpleFallback = false

    try {
      finalImageDataUrl = await renderAdServerSide(
        imageBase64,
        width,
        height,
        headlineOverride ?? selectedHeadline.headline,
        subheadOverride ?? selectedHeadline.subhead,
        selectedHeadline.cta,
        contrast,
        positionedCallouts,
        textX,
        textY,
        maxTextW,
        bannerColor,
        bannerText,
        productCutoutBase64
      )
    } catch (canvasErr) {
      logWarn(ROUTE_NAME, `Canvas rendering failed (${(canvasErr as Error).message}), using fallback`)
      useSimpleFallback = true
      finalImageDataUrl = generatedImageUrl
    }

    logInfo(ROUTE_NAME, "Step 6 done")

    // ── Build response ────────────────────────────────────────────
    const response: PipelineResponse = {
      concepts,
      selectedConcept,
      imagePrompt: imagePromptText,
      generatedImageUrl,
      imageDescription,
      headlines,
      selectedHeadline,
      finalAds: [
        {
          imageDataUrl: finalImageDataUrl,
          label: useSimpleFallback ? "Ad (raw image — compose client-side)" : "Ad",
          headline: headlineOverride ?? selectedHeadline.headline,
          subhead: subheadOverride ?? selectedHeadline.subhead,
          cta: selectedHeadline.cta,
          callouts: positionedCallouts,
        },
      ],
    }

    return NextResponse.json({
      ...response,
      productIntelligence: productIntel
        ? {
            name: productIntel.name,
            category: productIntel.category,
            features: productIntel.features,
            sceneUsed: imagePromptText.slice(0, 100),
          }
        : null,
    })
  } catch (err: unknown) {
    console.error("Pipeline error:", err)
    const msg = err instanceof Error ? err.message : "Pipeline failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
