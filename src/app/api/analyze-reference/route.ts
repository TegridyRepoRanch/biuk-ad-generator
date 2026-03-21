import { NextRequest, NextResponse } from "next/server"
import { GEMINI_FLASH, describeImageWithVision } from "@/lib/gemini"
import { REFERENCE_ANALYSIS_SYSTEM_PROMPT } from "@/lib/prompts"
import { ReferenceAnalysis } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"
import { rateLimit } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-error"
import { MAX_IMAGE_BASE64_SIZE } from "@/lib/constants"
import { logInfo, logWarn, logRequest } from "@/lib/logger"

const ROUTE_NAME = "analyze-reference"

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  logInfo(ROUTE_NAME, "Request received")

  try {
    // Rate limit: 20 req/min
    const { allowed } = rateLimit(ROUTE_NAME, 20, 60_000)
    if (!allowed) {
      logWarn(ROUTE_NAME, "Rate limit exceeded")
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 })
    }
    const formData = await req.formData()
    const imageFile = formData.get("image") as File | null
    const imageId = (formData.get("imageId") as string) || `ref-${Date.now()}`

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }

    const bytes = await imageFile.arrayBuffer()
    if (bytes.byteLength > MAX_IMAGE_BASE64_SIZE) {
      return NextResponse.json({ error: "Image too large — must be under 5MB" }, { status: 413 })
    }
    const base64 = Buffer.from(bytes).toString("base64")
    const mediaType = imageFile.type || "image/jpeg"

    const text = await describeImageWithVision(
      GEMINI_FLASH,
      base64,
      mediaType,
      REFERENCE_ANALYSIS_SYSTEM_PROMPT,
      "Analyze this reference ad image. Return your analysis as JSON."
    )

    const parsed: ReferenceAnalysis = { ...extractJSON(text), imageId }
    logRequest(ROUTE_NAME, "POST", Date.now() - startTime)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Reference analysis error:", error)
    return errorResponse(error, ROUTE_NAME)
  }
}
