import { NextRequest, NextResponse } from "next/server"
import { getGeminiClient, NANO_BANANA_2 } from "@/lib/gemini"
import { getSupabase } from "@/lib/supabase"
import { v4 as uuid } from "uuid"
import { validateExternalUrl } from "@/lib/url-validation"
import { rateLimit } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-error"
import { logInfo, logWarn, logRequest } from "@/lib/logger"

// Allow up to 60s — image generation can be slow
export const maxDuration = 60

const ROUTE_NAME = "remove-background"

/**
 * POST /api/remove-background
 * Uses Gemini (Nano Banana Pro) to remove the background from a product image.
 * Uploads the cutout PNG to Supabase Storage.
 *
 * No extra API key needed — uses the existing GEMINI_API_KEY.
 *
 * Body: { imageUrl: string, productId?: string }
 * Returns: { cutoutUrl: string }
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now()
  logInfo(ROUTE_NAME, "Request received")

  try {
    // Rate limit: 10 req/min
    const { allowed } = rateLimit(ROUTE_NAME, 10, 60_000)
    if (!allowed) {
      logWarn(ROUTE_NAME, "Rate limit exceeded")
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 })
    }

    const { imageUrl, productId } = await req.json()

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "An imageUrl is required" },
        { status: 400 }
      )
    }

    // ── SSRF protection ──────────────────────────────────────────
    const validation = validateExternalUrl(imageUrl)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // ── Download the source image ────────────────────────────────
    const imageRes = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!imageRes.ok) {
      return NextResponse.json(
        { error: "Could not download the source image" },
        { status: 422 }
      )
    }

    const imageBlob = await imageRes.blob()
    const imageBuffer = await imageBlob.arrayBuffer()
    const imageBase64 = Buffer.from(imageBuffer).toString("base64")
    const mimeType = imageBlob.type || "image/jpeg"

    // ── Send to Gemini for background removal ────────────────────
    const ai = getGeminiClient()

    const response = await ai.models.generateContent({
      model: NANO_BANANA_2,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: "Remove the background from this product image completely. Return ONLY the product on a fully transparent background with clean, precise edges. No shadow, no reflection, no background elements whatsoever. The cutout should look professional and ready to composite onto any background.",
            },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
      },
    })

    // ── Extract the cutout image from the response ───────────────
    const parts = response.candidates?.[0]?.content?.parts
    if (!parts) {
      return NextResponse.json(
        { error: "Gemini did not return a response" },
        { status: 502 }
      )
    }

    let cutoutBase64: string | null = null
    let cutoutMime = "image/png"

    for (const part of parts) {
      if (part.inlineData) {
        cutoutBase64 = part.inlineData.data ?? null
        cutoutMime = part.inlineData.mimeType ?? "image/png"
        break
      }
    }

    if (!cutoutBase64) {
      return NextResponse.json(
        { error: "Gemini did not return an image. The model may have refused this image." },
        { status: 422 }
      )
    }

    // ── Upload to Supabase Storage ───────────────────────────────
    const supabase = getSupabase()
    const ext = cutoutMime.includes("png") ? "png" : "webp"
    const fileName = `cutouts/${uuid()}.${ext}`
    const buffer = Buffer.from(cutoutBase64, "base64")

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, buffer, {
        contentType: cutoutMime,
        upsert: false,
      })

    if (uploadError) {
      console.error("Supabase upload error:", uploadError)
      // Return the data URL as fallback even if storage fails
      const dataUrl = `data:${cutoutMime};base64,${cutoutBase64}`
      return NextResponse.json({ cutoutUrl: dataUrl })
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName)

    const cutoutUrl = publicUrlData.publicUrl

    // Update the products table if productId provided
    if (productId) {
      await supabase
        .from("products")
        .update({ cutout_image_url: cutoutUrl })
        .eq("id", productId)
    }

    logRequest(ROUTE_NAME, "POST", Date.now() - startTime)
    return NextResponse.json({ cutoutUrl })
  } catch (error) {
    console.error("Background removal error:", error)
    return errorResponse(error, ROUTE_NAME)
  }
}
