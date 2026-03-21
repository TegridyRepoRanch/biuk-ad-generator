import { NextRequest, NextResponse } from "next/server"
import { GEMINI_PRO, generateText } from "@/lib/gemini"
import { COPY_SYSTEM_PROMPT, buildCopyUserPrompt } from "@/lib/prompts"
import { CopyRequest, CopyResponse } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"
import { hashKey, getCachedCopy, setCachedCopy } from "@/lib/cache"
import { rateLimit } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-error"
import { logInfo, logWarn, logRequest } from "@/lib/logger"

const ROUTE_NAME = "copy"

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

    const body: CopyRequest = await req.json()

    // ── Input validation ───────────────────────────────────────
    if (!body.concept || typeof body.concept.hook !== "string" || typeof body.concept.mechanism !== "string") {
      return NextResponse.json({ error: "A concept with hook and mechanism is required" }, { status: 400 })
    }
    if (!body.imageDescription || typeof body.imageDescription !== "string") {
      return NextResponse.json({ error: "An imageDescription (string) is required" }, { status: 400 })
    }

    // ── Check cache ──────────────────────────────────────────────
    const conceptHash = hashKey(body.concept.hook, body.concept.mechanism)
    const imageDescHash = hashKey(body.imageDescription.slice(0, 200))
    const cacheKey = hashKey(
      conceptHash,
      imageDescHash,
      body.contrastMethod,
      body.targetAudience,
      body.campaignGoal
    )

    if (!body.skipCache && !body.feedback) {
      const cached = await getCachedCopy(cacheKey)
      if (cached) {
        return NextResponse.json({ variations: cached, fromCache: true })
      }
    }

    // ── Generate fresh copy ──────────────────────────────────────
    const userPrompt = buildCopyUserPrompt(
      body.concept,
      body.imageDescription,
      body.messageZonePosition,
      body.contrastMethod,
      body.targetAudience,
      body.campaignGoal,
      body.brandVoice,
      body.copyDirection,
      body.productAnalysis,
      body.feedback
    )

    const text = await generateText(GEMINI_PRO, COPY_SYSTEM_PROMPT, userPrompt)
    const parsed: CopyResponse = extractJSON(text)

    // ── Cache ────────────────────────────────────────────────────
    await setCachedCopy(cacheKey, conceptHash, imageDescHash, parsed.variations).catch(console.warn)

    logRequest(ROUTE_NAME, "POST", Date.now() - startTime)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Copy generation error:", error)
    return errorResponse(error, ROUTE_NAME)
  }
}
