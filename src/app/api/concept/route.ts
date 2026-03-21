import { NextRequest, NextResponse } from "next/server"
import { GEMINI_PRO, generateText } from "@/lib/gemini"
import { CONCEPT_SYSTEM_PROMPT, buildConceptUserPrompt } from "@/lib/prompts"
import { ConceptRequest, ConceptResponse } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"
import { hashKey, getCachedConcepts, setCachedConcepts } from "@/lib/cache"
import { rateLimit } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-error"
import { MAX_BRIEF_LENGTH } from "@/lib/constants"
import { logInfo, logWarn, logRequest } from "@/lib/logger"

const ROUTE_NAME = "concept"

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

    const body: ConceptRequest = await req.json()

    // ── Input validation ───────────────────────────────────────
    if (!body.brief || typeof body.brief !== "string") {
      return NextResponse.json({ error: "A brief (string) is required" }, { status: 400 })
    }
    if (body.brief.length > MAX_BRIEF_LENGTH) {
      return NextResponse.json({ error: "Brief is too long (max 5000 characters)" }, { status: 400 })
    }

    // ── Check cache first ────────────────────────────────────────
    const briefHash = hashKey(body.brief, body.targetAudience, body.campaignGoal)
    const cacheKey = hashKey(
      briefHash,
      body.productAnalysis?.productName,
      body.productAnalysis?.targetAudience
    )

    if (!body.skipCache && !body.feedback) {
      const cached = await getCachedConcepts(cacheKey)
      if (cached) {
        return NextResponse.json({ angles: cached, fromCache: true })
      }
    }

    // ── Generate fresh concepts ──────────────────────────────────
    const userPrompt = buildConceptUserPrompt(
      body.brief,
      body.referenceAnalysis,
      body.targetAudience,
      body.campaignGoal,
      body.brandVoice,
      body.productAnalysis,
      body.creativeResearch,
      body.feedback
    )

    const text = await generateText(GEMINI_PRO, CONCEPT_SYSTEM_PROMPT, userPrompt)
    const parsed: ConceptResponse = extractJSON(text)

    // ── Cache the result ─────────────────────────────────────────
    await setCachedConcepts(cacheKey, briefHash, parsed.angles).catch(console.warn)

    logRequest(ROUTE_NAME, "POST", Date.now() - startTime)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Concept generation error:", error)
    return errorResponse(error, ROUTE_NAME)
  }
}
