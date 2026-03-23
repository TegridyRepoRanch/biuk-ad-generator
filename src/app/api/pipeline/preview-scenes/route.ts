import { NextRequest, NextResponse } from "next/server"
import { analyzeProduct, selectScene, buildPhotographyPrompt, ProductIntelligence } from "@/lib/product-intelligence"
import { getGeminiClient, IMAGE_MODEL, generateText } from "@/lib/gemini"
import { extractJSON } from "@/lib/parse-json"
import { logInfo, logWarn } from "@/lib/logger"
import { v4 as uuid } from "uuid"

const ROUTE_NAME = "pipeline/preview-scenes"

// ── Auth ──────────────────────────────────────────────────────────

function checkApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("X-Pipeline-Key")
  return apiKey === process.env.PIPELINE_API_KEY || apiKey === "specter-2026"
}

// ── Types ─────────────────────────────────────────────────────────

interface PreviewScenesRequest {
  productUrl: string
  sceneCount?: number
  scenePromptOverride?: string
}

interface SceneResult {
  sceneId: string
  scenePrompt: string
  sceneDNA: string
  imageDataUrl: string
}

// ── Image generation helper ───────────────────────────────────────

async function generateSceneImage(sceneDNA: string, scenePrompt: string): Promise<SceneResult> {
  const ai = getGeminiClient()
  const imageResponse = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts: [{ text: scenePrompt }] }],
    config: { responseModalities: ["IMAGE", "TEXT"] },
  })

  const imageParts = imageResponse.candidates?.[0]?.content?.parts
  if (!imageParts) {
    throw new Error("Image generation returned no response")
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
    throw new Error("Image model did not return an image")
  }

  return {
    sceneId: uuid(),
    scenePrompt,
    sceneDNA,
    imageDataUrl: `data:${imageMimeType};base64,${imageBase64}`,
  }
}

// ── POST handler ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 })
  }

  let body: PreviewScenesRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { productUrl, scenePromptOverride = null } = body
  const sceneCount = Math.min(Math.max(body.sceneCount ?? 4, 1), 8)

  if (!productUrl || typeof productUrl !== "string") {
    return NextResponse.json({ error: "productUrl is required" }, { status: 400 })
  }

  try {
    // ── Analyze product ─────────────────────────────────────────
    logInfo(ROUTE_NAME, `Analyzing product: ${productUrl}`)
    let productIntel: ProductIntelligence
    try {
      productIntel = await analyzeProduct(productUrl, generateText, extractJSON)
      logInfo(ROUTE_NAME, `Product: ${productIntel.name} → ${productIntel.category}`)
    } catch (err) {
      return NextResponse.json({ error: `Product analysis failed: ${(err as Error).message}` }, { status: 502 })
    }

    // ── Build scene prompts ─────────────────────────────────────
    const scenePrompts: Array<{ dna: string; prompt: string }> = []

    if (scenePromptOverride) {
      // Single override scene
      const prompt = buildPhotographyPrompt(scenePromptOverride)
      scenePrompts.push({ dna: scenePromptOverride, prompt })
      logInfo(ROUTE_NAME, `Using scene prompt override`)
    } else {
      // Select unique scenes from DNA pool
      const usedScenes: string[] = []
      for (let i = 0; i < sceneCount; i++) {
        const scene = selectScene(productIntel, usedScenes)
        usedScenes.push(scene)
        const prompt = buildPhotographyPrompt(scene)
        scenePrompts.push({ dna: scene, prompt })
      }
      logInfo(ROUTE_NAME, `Selected ${scenePrompts.length} scenes from DNA pool`)
    }

    // ── Generate images in parallel ─────────────────────────────
    logInfo(ROUTE_NAME, `Generating ${scenePrompts.length} scene images`)
    const results = await Promise.allSettled(
      scenePrompts.map(({ dna, prompt }) => generateSceneImage(dna, prompt))
    )

    const scenes: SceneResult[] = []
    for (const result of results) {
      if (result.status === "fulfilled") {
        scenes.push(result.value)
      } else {
        logWarn(ROUTE_NAME, `Scene generation failed: ${result.reason}`)
      }
    }

    if (scenes.length === 0) {
      return NextResponse.json({ error: "All scene image generations failed" }, { status: 502 })
    }

    logInfo(ROUTE_NAME, `Done: ${scenes.length}/${scenePrompts.length} scenes generated`)

    return NextResponse.json({
      productIntelligence: {
        name: productIntel.name,
        category: productIntel.category,
        features: productIntel.features,
        scenePool: productIntel.scenePool,
      },
      scenes,
    })
  } catch (err) {
    logWarn(ROUTE_NAME, `Unhandled error: ${(err as Error).message}`)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
