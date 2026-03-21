import { NextRequest, NextResponse } from "next/server"
import { GEMINI_FLASH, generateText } from "@/lib/gemini"
import { IMAGE_PROMPT_SYSTEM_PROMPT, buildImagePromptUserPrompt } from "@/lib/prompts"
import { ImagePromptRequest, ImagePromptResponse } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"
import { hashKey, getCachedPrompts, setCachedPrompts } from "@/lib/cache"
import { rateLimit } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-error"
import { logInfo, logWarn, logRequest } from "@/lib/logger"

const ROUTE_NAME = "image-prompts"

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  logInfo(ROUTE_NAME, "Request received")

  try {
    // Rate limit: 20 req/min
    const { allowed } = rateLimit(ROUTE_NAME, 20, 60_000)
    if (!allowed) {
      logWarn(ROUTE_NAME, "Rate limit exceeded")
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 })
    }

    const body: ImagePromptRequest = await req.json()

    // ── Input validation ───────────────────────────────────────
    if (!body.concept || typeof body.concept.hook !== "string" || typeof body.concept.mechanism !== "string") {
      return NextResponse.json({ error: "A concept with hook and mechanism is required" }, { status: 400 })
    }
    if (!body.platform || typeof body.platform !== "string") {
      return NextResponse.json({ error: "A platform (string) is required" }, { status: 400 })
    }
    if (typeof body.width !== "number" || typeof body.height !== "number" || body.width <= 0 || body.height <= 0) {
      return NextResponse.json({ error: "Valid width and height (positive numbers) are required" }, { status: 400 })
    }

    // ── Check cache ──────────────────────────────────────────────
    const conceptHash = hashKey(body.concept.hook, body.concept.mechanism)
    const cacheKey = hashKey(
      conceptHash,
      body.platform,
      `${body.width}x${body.height}`,
      body.messageZonePosition,
      body.contrastMethod
    )

    if (!body.skipCache && !body.feedback) {
      const cached = await getCachedPrompts(cacheKey)
      if (cached) {
        return NextResponse.json({ prompts: cached, fromCache: true })
      }
    }

    // ── Generate fresh prompts ───────────────────────────────────
    const userPrompt = buildImagePromptUserPrompt(
      body.concept,
      body.messageZonePosition,
      body.width,
      body.height,
      body.contrastMethod,
      body.visualDirection,
      body.feedback
    )

    const text = await generateText(GEMINI_FLASH, IMAGE_PROMPT_SYSTEM_PROMPT, userPrompt)
    const parsed: ImagePromptResponse = extractJSON(text)

    // ── Cache ────────────────────────────────────────────────────
    await setCachedPrompts(cacheKey, conceptHash, body.platform, parsed.prompts).catch(console.warn)

    logRequest(ROUTE_NAME, "POST", Date.now() - startTime)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Image prompt generation error:", error)
    return errorResponse(error, ROUTE_NAME)
  }
}
