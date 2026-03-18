import { NextRequest, NextResponse } from "next/server"
import { GEMINI_PRO, generateText } from "@/lib/gemini"
import { COPY_SYSTEM_PROMPT, buildCopyUserPrompt } from "@/lib/prompts"
import { CopyRequest, CopyResponse } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"
import { hashKey, getCachedCopy, setCachedCopy } from "@/lib/cache"

export async function POST(req: NextRequest) {
  try {
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

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Copy generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate copy" },
      { status: 500 }
    )
  }
}
