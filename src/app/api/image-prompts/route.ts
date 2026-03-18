import { NextRequest, NextResponse } from "next/server"
import { getAnthropicClient, MODEL } from "@/lib/anthropic"
import { IMAGE_PROMPT_SYSTEM_PROMPT, buildImagePromptUserPrompt } from "@/lib/prompts"
import { ImagePromptRequest, ImagePromptResponse } from "@/types/ad"

export async function POST(req: NextRequest) {
  try {
    const body: ImagePromptRequest = await req.json()
    const client = getAnthropicClient()

    const userPrompt = buildImagePromptUserPrompt(
      body.concept,
      body.messageZonePosition,
      body.width,
      body.height
    )

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: IMAGE_PROMPT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })

    const text = message.content[0].type === "text" ? message.content[0].text : ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 })
    }

    const parsed: ImagePromptResponse = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Image prompt generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate image prompts" },
      { status: 500 }
    )
  }
}
