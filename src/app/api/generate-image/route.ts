import { NextRequest, NextResponse } from "next/server"
import { getGeminiClient, IMAGE_MODEL } from "@/lib/gemini"
import { getSupabase } from "@/lib/supabase"
import { v4 as uuid } from "uuid"
import { rateLimit } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-error"
import { MAX_PROMPT_LENGTH } from "@/lib/constants"
import { logInfo, logWarn, logRequest } from "@/lib/logger"

const ROUTE_NAME = "generate-image"

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  logInfo(ROUTE_NAME, "Request received")

  try {
    // Rate limit: 15 req/min (most expensive)
    const { allowed } = rateLimit(ROUTE_NAME, 15, 60_000)
    if (!allowed) {
      logWarn(ROUTE_NAME, "Rate limit exceeded")
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 })
    }

    const { prompt } = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "A prompt string is required" },
        { status: 400 }
      )
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: "Prompt is too long (max 10000 characters)" },
        { status: 400 }
      )
    }

    const ai = getGeminiClient()

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    })

    // Extract the image from the response
    const parts = response.candidates?.[0]?.content?.parts
    if (!parts) {
      return NextResponse.json(
        { error: "No response from image model" },
        { status: 502 }
      )
    }

    let imageBase64: string | null = null
    let mimeType = "image/png"

    for (const part of parts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data ?? null
        mimeType = part.inlineData.mimeType ?? "image/png"
        break
      }
    }

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Model did not return an image. Try rephrasing the prompt." },
        { status: 422 }
      )
    }

    // ── Upload to Supabase Storage ───────────────────────────────
    const supabase = getSupabase()
    const ext = mimeType.includes("png") ? "png" : "webp"
    const fileName = `generated/${uuid()}.${ext}`
    const buffer = Buffer.from(imageBase64, "base64")

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error("Supabase upload error:", uploadError)
      // Return the data URL as fallback even if storage fails
      const dataUrl = `data:${mimeType};base64,${imageBase64}`
      return NextResponse.json({ imageUrl: dataUrl })
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName)

    const imageUrl = publicUrlData.publicUrl

    logRequest(ROUTE_NAME, "POST", Date.now() - startTime)
    return NextResponse.json({ imageUrl })
  } catch (err: unknown) {
    console.error("Image generation error:", err)
    return errorResponse(err, ROUTE_NAME)
  }
}
