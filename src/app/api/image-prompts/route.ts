import { NextRequest, NextResponse } from "next/server"
import { GEMINI_FLASH, generateText } from "@/lib/gemini"
import { IMAGE_PROMPT_SYSTEM_PROMPT, buildImagePromptUserPrompt } from "@/lib/prompts"
import { ImagePromptRequest, ImagePromptResponse } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"
import { hashKey, getCachedPrompts, setCachedPrompts } from "@/lib/cache"

export async function POST(req: NextRequest) {
  try {
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

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Image prompt generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate image prompts" },
      { status: 500 }
    )
  }
}
