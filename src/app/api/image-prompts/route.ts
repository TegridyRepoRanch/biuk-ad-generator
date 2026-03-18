import { NextRequest, NextResponse } from "next/server"
import { GEMINI_FLASH, generateText } from "@/lib/gemini"
import { IMAGE_PROMPT_SYSTEM_PROMPT, buildImagePromptUserPrompt } from "@/lib/prompts"
import { ImagePromptRequest, ImagePromptResponse } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"
import { hashKey, getCachedPrompts, setCachedPrompts } from "@/lib/cache"

export async function POST(req: NextRequest) {
  try {
    const body: ImagePromptRequest = await req.json()

    // ── Check cache ──────────────────────────────────────────────
    const conceptHash = hashKey(body.concept.hook, body.concept.mechanism)
    const cacheKey = hashKey(
      conceptHash,
      body.platform,
      `${body.width}x${body.height}`,
      body.messageZonePosition,
      body.contrastMethod
    )

    if (!body.skipCache) {
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
      body.visualDirection
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
