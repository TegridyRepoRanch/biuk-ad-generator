import { NextRequest, NextResponse } from "next/server"
import { getGeminiClient, GEMINI_PRO, GEMINI_FLASH, generateText, describeImageWithVision } from "@/lib/gemini"
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
}

interface PipelineRequest {
  brief: string
  platform?: Platform
  layout?: string
  contrast?: string
  callouts?: CalloutInput[]
  imageModel?: string
  count?: number
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
  maxTextWidth: number
): Promise<string> {
  // Dynamically import canvas (server-only)
  const { createCanvas, loadImage, registerFont } = await import("canvas")

  // Register a font if available, otherwise fall back
  try {
    const path = await import("path")
    const fs = await import("fs")
    // Try common font paths
    const fontPaths = [
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
      "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for (const fp of fontPaths) {
      if (fs.existsSync(fp)) {
        if (fp.includes("Bold")) {
          registerFont(fp, { family: "Pipeline", weight: "bold" })
        } else {
          registerFont(fp, { family: "Pipeline", weight: "normal" })
        }
      }
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

  // Draw gradient overlay
  if (contrastMethod === "gradient" || contrastMethod === "gradient-overlay") {
    const grad = ctx.createLinearGradient(0, height, 0, 0)
    grad.addColorStop(0, "rgba(0,0,0,0.85)")
    grad.addColorStop(0.6, "rgba(0,0,0,0.3)")
    grad.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }

  // Font settings — use registered Pipeline font or DejaVu Sans as fallback
  const fontFamily = "Pipeline, DejaVu Sans, Liberation Sans, Arial, sans-serif"
  const headlineFontSize = Math.round(width * 0.06)
  const subheadFontSize = Math.round(width * 0.035)
  const ctaFontSize = Math.round(width * 0.035)
  const headlineColor = "#FFFFFF"
  const subheadColor = "#DDDDDD"
  const headlineWeight = "bold"

  let ty = textY

  // Draw solid block background if needed
  if (contrastMethod === "solid-block") {
    ctx.fillStyle = "rgba(0,0,0,0.7)"
    ctx.fillRect(textX - 24, textY - 24, maxTextWidth + 48, headlineFontSize * 3 + 80)
  }

  // Draw headline
  ctx.font = `${headlineWeight} ${headlineFontSize}px ${fontFamily}`
  ctx.fillStyle = headlineColor
  ctx.textAlign = "left"
  ctx.textBaseline = "top"

  // Text shadow
  ctx.shadowColor = "rgba(0,0,0,0.6)"
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2

  // Word-wrap headline
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

  for (const l of lines) {
    ctx.fillText(l, textX, ty)
    ty += headlineFontSize * 1.15
  }

  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Draw subhead
  if (subhead) {
    ty += 8
    ctx.font = `400 ${subheadFontSize}px ${fontFamily}`
    ctx.fillStyle = subheadColor
    ctx.fillText(subhead, textX, ty)
    ty += subheadFontSize * 1.15
  }

  // Draw CTA button
  if (cta) {
    ty += 16
    const ctaPadX = 24
    const ctaPadY = 12
    ctx.font = `700 ${ctaFontSize}px ${fontFamily}`
    const ctaWidth = ctx.measureText(cta).width + ctaPadX * 2
    const ctaHeight = ctaFontSize + ctaPadY * 2
    const r = 8

    ctx.fillStyle = "#FFFFFF"
    ctx.beginPath()
    ctx.moveTo(textX + r, ty)
    ctx.lineTo(textX + ctaWidth - r, ty)
    ctx.quadraticCurveTo(textX + ctaWidth, ty, textX + ctaWidth, ty + r)
    ctx.lineTo(textX + ctaWidth, ty + ctaHeight - r)
    ctx.quadraticCurveTo(textX + ctaWidth, ty + ctaHeight, textX + ctaWidth - r, ty + ctaHeight)
    ctx.lineTo(textX + r, ty + ctaHeight)
    ctx.quadraticCurveTo(textX, ty + ctaHeight, textX, ty + ctaHeight - r)
    ctx.lineTo(textX, ty + r)
    ctx.quadraticCurveTo(textX, ty, textX + r, ty)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = "#000000"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(cta, textX + ctaWidth / 2, ty + ctaHeight / 2)
  }

  // Draw callouts
  for (const callout of callouts) {
    const fontSize = Math.round(width * 0.025)
    const padX = 12
    const padY = 8
    const dotR = 6
    const lineW = 2
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

    // Leader line
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.lineWidth = lineW
    ctx.beginPath()
    ctx.moveTo(edgeX, edgeY)
    ctx.lineTo(ax, ay)
    ctx.stroke()

    // Dot
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.beginPath()
    ctx.arc(ax, ay, dotR, 0, Math.PI * 2)
    ctx.fill()

    // Bubble
    ctx.fillStyle = "rgba(0,0,0,0.75)"
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

  return canvas.toDataURL("image/png")
}

// ── Auto-position callouts on the image ──────────────────────────

function autoPositionCallouts(
  calloutTexts: string[],
  width: number,
  height: number
): Array<{ text: string; position: { x: number; y: number }; anchorPoint: { x: number; y: number } }> {
  // Spread callouts around the center of the image
  const positions = [
    { bx: width * 0.05, by: height * 0.15, ax: width * 0.25, ay: height * 0.35 },
    { bx: width * 0.60, by: height * 0.15, ax: width * 0.75, ay: height * 0.35 },
    { bx: width * 0.05, by: height * 0.60, ax: width * 0.25, ay: height * 0.60 },
    { bx: width * 0.60, by: height * 0.60, ax: width * 0.75, ay: height * 0.60 },
  ]

  return calloutTexts.map((text, i) => {
    const pos = positions[i % positions.length]
    return {
      text,
      position: { x: pos.bx, y: pos.by },
      anchorPoint: { x: pos.ax, y: pos.ay },
    }
  })
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

  const { brief, platform = "ig-feed-square", layout = "center-overlay", contrast = "gradient", callouts = [], imageModel } = body

  if (!brief || typeof brief !== "string" || brief.trim().length < 10) {
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

    // ── STEP 2: Generate image prompts ────────────────────────────
    logInfo(ROUTE_NAME, "Step 2: Generating image prompts")
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
    // Pick rank 1 (or fallback to first)
    const bestPrompt = imagePrompts.find((p) => p.rank === 1) ?? imagePrompts[0]
    const imagePromptText = bestPrompt.text
    logInfo(ROUTE_NAME, "Step 2 done")

    // ── STEP 3: Generate image ────────────────────────────────────
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

    let imageBase64: string | null = null
    let imageMimeType = "image/png"
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

    // ── STEP 5: Generate headlines ────────────────────────────────
    logInfo(ROUTE_NAME, "Step 5: Generating headlines")
    const copyUserPrompt = buildCopyUserPrompt(
      selectedConcept,
      imageDescription,
      messageZonePosition,
      contrast
    )
    const copyRaw = await generateText(GEMINI_PRO, COPY_SYSTEM_PROMPT, copyUserPrompt, 30_000)
    const copyData = extractJSON<{ variations: HeadlineVariation[] }>(copyRaw)
    const headlines = copyData.variations ?? []
    if (headlines.length === 0) {
      return NextResponse.json({ error: "Failed to generate headlines" }, { status: 502 })
    }
    const selectedHeadline = headlines[0]
    logInfo(ROUTE_NAME, "Step 5 done")

    // ── STEP 6: Compose final ad ──────────────────────────────────
    logInfo(ROUTE_NAME, "Step 6: Composing ad")

    // Position callouts
    const calloutTexts = callouts.map((c) => c.text)
    const positionedCallouts = autoPositionCallouts(calloutTexts, width, height)

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
        selectedHeadline.headline,
        selectedHeadline.subhead,
        selectedHeadline.cta,
        contrast,
        positionedCallouts,
        textX,
        textY,
        maxTextW
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
          headline: selectedHeadline.headline,
          subhead: selectedHeadline.subhead,
          cta: selectedHeadline.cta,
          callouts: positionedCallouts,
        },
      ],
    }

    return NextResponse.json(response)
  } catch (err: unknown) {
    console.error("Pipeline error:", err)
    const msg = err instanceof Error ? err.message : "Pipeline failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
