import { NextRequest, NextResponse } from "next/server"
import { getAnthropicClient, MODEL } from "@/lib/anthropic"
import { COPY_SYSTEM_PROMPT, buildCopyUserPrompt } from "@/lib/prompts"
import { CopyRequest, CopyResponse } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"

export async function POST(req: NextRequest) {
  try {
    const body: CopyRequest = await req.json()
    const client = getAnthropicClient()

    const userPrompt = buildCopyUserPrompt(
      body.concept,
      body.imageDescription,
      body.messageZonePosition,
      body.targetAudience,
      body.campaignGoal,
      body.brandVoice
    )

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: COPY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })

    const text = message.content[0].type === "text" ? message.content[0].text : ""
    const parsed: CopyResponse = extractJSON(text)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Copy generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate copy" },
      { status: 500 }
    )
  }
}
