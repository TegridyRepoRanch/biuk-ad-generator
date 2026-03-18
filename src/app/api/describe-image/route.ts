import { NextRequest, NextResponse } from "next/server"
import { GEMINI_FLASH, describeImageWithVision } from "@/lib/gemini"

const SYSTEM_PROMPT = `You are describing an ad image for a copywriter. Your description will be used to write headlines that COMPLEMENT the image — not repeat it.

Describe: the scene, mood, colors, subjects, composition, and emotional tone in 2-3 sentences. Focus on what a copywriter needs to know to write a headline that adds meaning beyond what the viewer already sees.

Do NOT describe text, logos, or UI elements if present — only the visual content.`

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json()

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Base64 image data is required" }, { status: 400 })
    }
    // Block oversized payloads (base64 ~= 1.33x raw size, so 7MB base64 ≈ 5MB image)
    if (image.length > 7 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large — must be under 5MB" }, { status: 413 })
    }

    const description = await describeImageWithVision(
      GEMINI_FLASH,
      image,
      mediaType || "image/png",
      SYSTEM_PROMPT,
      "Describe this ad image for a copywriter. Return only the description, no JSON."
    )

    return NextResponse.json({ description: description.trim() })
  } catch (error) {
    console.error("Image description error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to describe image" },
      { status: 500 }
    )
  }
}
