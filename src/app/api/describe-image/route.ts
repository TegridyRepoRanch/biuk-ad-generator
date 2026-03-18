import { NextRequest, NextResponse } from "next/server"
import { getAnthropicClient, MODEL } from "@/lib/anthropic"

const SYSTEM_PROMPT = `You are describing an ad image for a copywriter. Describe the scene, mood, colors, subjects, composition, and emotional tone in 2-3 sentences. Focus on what a copywriter needs to know to write a headline that COMPLEMENTS the image rather than repeating it. Don't describe text or logos.`

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json()

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "A base64 image string is required" },
        { status: 400 }
      )
    }

    const client = getAnthropicClient()

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/png",
                data: image,
              },
            },
            {
              type: "text",
              text: "Describe this image for the copywriter.",
            },
          ],
        },
      ],
    })

    const description =
      message.content[0].type === "text" ? message.content[0].text : ""

    return NextResponse.json({ description })
  } catch (error) {
    console.error("Image description error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to describe image",
      },
      { status: 500 }
    )
  }
}
