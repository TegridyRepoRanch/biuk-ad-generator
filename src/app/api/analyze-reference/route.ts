import { NextRequest, NextResponse } from "next/server"
import { GEMINI_FLASH, describeImageWithVision } from "@/lib/gemini"
import { REFERENCE_ANALYSIS_SYSTEM_PROMPT } from "@/lib/prompts"
import { ReferenceAnalysis } from "@/types/ad"
import { extractJSON } from "@/lib/parse-json"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const imageFile = formData.get("image") as File | null
    const imageId = (formData.get("imageId") as string) || `ref-${Date.now()}`

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }

    const bytes = await imageFile.arrayBuffer()
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
    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Reference analysis error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze reference" },
      { status: 500 }
    )
  }
}
