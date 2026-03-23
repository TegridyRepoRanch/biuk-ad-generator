import { NextRequest, NextResponse } from "next/server"
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
  maxTextWidth: number,
  bannerColor: string = "#D4C96B",
  bannerText: string = "SUBSCRIBE & SAVE 20%"
): Promise<string> {
  // Dynamically import canvas (server-only)
  const { createCanvas, loadImage, registerFont } = await import("canvas")

  // Register bundled fonts (these ship with the app in public/fonts/)
  try {
    const path = await import("path")
    const fs = await import("fs")
    // Fonts bundled in public/fonts/ — deployed with the app
    const fontDir = path.join(process.cwd(), "public", "fonts")
    const regularFont = path.join(fontDir, "DejaVuSans.ttf")
    const boldFont = path.join(fontDir, "DejaVuSans-Bold.ttf")
    if (fs.existsSync(regularFont)) {
      registerFont(regularFont, { family: "AdFont", weight: "normal" })
    }
    if (fs.existsSync(boldFont)) {
      registerFont(boldFont, { family: "AdFont", weight: "bold" })
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

  // Draw bottom banner
  const bannerHeight = Math.round(height * 0.10)
  const bannerY = height - bannerHeight
  ctx.fillStyle = bannerColor
  ctx.fillRect(0, bannerY, width, bannerHeight)

  // Banner text (stars + text centered)
  const bannerFontSize = Math.round(width * 0.035)
  const stars = "★★★★★"
  ctx.font = `bold ${bannerFontSize}px AdFont`
  ctx.fillStyle = "#1a1a1a"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const starsWidth = ctx.measureText(stars).width
  const gap = Math.round(width * 0.015)
  const bannerTextWidth = ctx.measureText(bannerText).width
  const totalWidth = starsWidth + gap + bannerTextWidth
  const startX = (width - totalWidth) / 2
  const bannerCenterY = bannerY + bannerHeight / 2
  ctx.textAlign = "left"
  ctx.fillText(stars, startX, bannerCenterY)
  ctx.fillText(bannerText, startX + starsWidth + gap, bannerCenterY)

  // Font settings — use bundled AdFont (DejaVu Sans)
  const fontFamily = "AdFont"
  const headlineFontSize = Math.round(width * 0.06)
  const subheadFontSize = Math.round(width * 0.028)
  const headlineColor = "#FFFFFF"
  const subheadColor = "#DDDDDD"
  const headlineWeight = "bold"

  // Headline renders at the top (~5% from top)
  const topY = Math.round(height * 0.05)
  const headlineCenterX = width / 2

  // Word-wrap headline (centered)
  ctx.font = `${headlineWeight} ${headlineFontSize}px ${fontFamily}`
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

  // Measure total headline block height
  const headlineBlockHeight = lines.length * headlineFontSize * 1.15
  const subheadBlockHeight = subhead ? (subheadFontSize * 1.15 + 8) : 0
  const backdropPad = 16
  const backdropH = headlineBlockHeight + subheadBlockHeight + backdropPad * 2
  ctx.fillStyle = "rgba(0,0,0,0.45)"
  ctx.fillRect(
    headlineCenterX - maxTextWidth / 2 - backdropPad,
    topY - backdropPad,
    maxTextWidth + backdropPad * 2,
    backdropH
  )

  // Draw headline lines (centered)
  ctx.font = `${headlineWeight} ${headlineFontSize}px ${fontFamily}`
  ctx.fillStyle = headlineColor
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.shadowColor = "rgba(0,0,0,0.6)"
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2

  let ty = topY
  for (const l of lines) {
    ctx.fillText(l, headlineCenterX, ty)
    ty += headlineFontSize * 1.15
  }

  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Draw subhead below headline at top
  if (subhead) {
    ty += 8
    ctx.font = `400 ${subheadFontSize}px ${fontFamily}`
    ctx.fillStyle = subheadColor
    ctx.textAlign = "center"
    ctx.fillText(subhead, headlineCenterX, ty)
    ty += subheadFontSize * 1.15
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
  calloutInputs: CalloutInput[],
  width: number,
  height: number
): Array<{ text: string; position: { x: number; y: number }; anchorPoint: { x: number; y: number } }> {
  // Corner positions for callout bubbles (X-pattern radiating from product center)
  const positions = [
    // top-left: bubble at ~5% left, ~20% top; anchor points to upper-left product area
    { bx: width * 0.05, by: height * 0.20, ax: width * 0.40, ay: height * 0.35 },
    // top-right: bubble at ~right-aligned, ~20% top; anchor points to upper-right product area
    { bx: width * 0.60, by: height * 0.20, ax: width * 0.60, ay: height * 0.35 },
    // bottom-left: bubble at ~5% left, ~70% top; anchor points to lower-left product area
    { bx: width * 0.05, by: height * 0.70, ax: width * 0.40, ay: height * 0.65 },
    // bottom-right: bubble at ~right-aligned, ~70% top; anchor points to lower-right product area
    { bx: width * 0.60, by: height * 0.70, ax: width * 0.60, ay: height * 0.65 },
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
            if (first) return new URL(first, productUrl).href
          }
        } catch { /* continue */ }
      }
    }

    // Try Open Graph
    const ogMatch = html.match(/<meta[^>]*(?:property)=["']og:image["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*(?:property)=["']og:image["']/i)
    if (ogMatch?.[1]) return new URL(ogMatch[1], productUrl).href

    // Try twitter image
    const twMatch = html.match(/<meta[^>]*(?:name)=["']twitter:image["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*(?:name)=["']twitter:image["']/i)
    if (twMatch?.[1]) return new URL(twMatch[1], productUrl).href

    return null
  } catch (err) {
    logWarn(ROUTE_NAME, `Product scrape failed: ${(err as Error).message}`)
    return null
  }
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
              text: "Remove the background from this product image completely. Return ONLY the product on a fully transparent background with clean, precise edges. No shadow, no reflection, no background elements whatsoever. The cutout should look professional and ready to composite onto any background.",
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
        selectedHeadline.headline,
        selectedHeadline.subhead,
        selectedHeadline.cta,
        contrast,
        positionedCallouts,
        textX,
        textY,
        maxTextW,
        bannerColor,
        bannerText
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
