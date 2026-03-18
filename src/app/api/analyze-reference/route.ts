import { NextRequest, NextResponse } from "next/server"
import { getAnthropicClient, MODEL } from "@/lib/anthropic"
import { REFERENCE_ANALYSIS_SYSTEM_PROMPT } from "@/lib/prompts"
import { ReferenceAnalysis } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const imageFile = formData.get("image") as File | null
    const imageId = formData.get("imageId") as string

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }

    const client = getAnthropicClient()
    const bytes = await imageFile.arrayBuffer()
    const base64 = Buffer.from(bytes).toString("base64")

    const mediaType = imageFile.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp"

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: REFERENCE_ANALYSIS_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: "Analyze this reference ad image. Return your analysis as JSON.",
            },
          ],
        },
      ],
    })

    const text = message.content[0].type === "text" ? message.content[0].text : ""
    const parsed: ReferenceAnalysis = { ...extractJSON(text), imageId }
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Reference analysis error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze reference" },
      { status: 500 }
    )
  }
}
