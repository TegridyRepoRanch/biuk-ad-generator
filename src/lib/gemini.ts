import { GoogleGenAI } from "@google/genai"

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required")
  }
  return new GoogleGenAI({ apiKey })
}

/**
 * Nano Banana model family — API model identifiers
 *
 * IMPORTANT: The "Nano Banana" names are Google's marketing names.
 * The actual API model strings use the gemini-* naming convention.
 *
 * | Marketing Name       | API Model String                   | Based On           |
 * |----------------------|------------------------------------|--------------------|
 * | Nano Banana          | gemini-2.5-flash-image             | Gemini 2.5 Flash   |
 * | Nano Banana Pro      | gemini-3-pro-image-preview         | Gemini 3 Pro       |
 * | Nano Banana 2        | gemini-3.1-flash-image-preview     | Gemini 3.1 Flash   |
 *
 * Nano Banana Pro: Best quality, uses "Thinking" for complex instructions,
 *   high-fidelity text rendering. Slower, more expensive.
 * Nano Banana 2: Pro-level quality at Flash speed. Best default choice.
 * Nano Banana (original): Fastest, cheapest. Good for bulk/low-latency.
 *
 * All models use the same API pattern:
 *   ai.models.generateContent({ model, contents, config: { responseModalities: ["IMAGE", "TEXT"] } })
 * Response images are in: response.candidates[0].content.parts[].inlineData.data (base64)
 */

// Default to Nano Banana Pro for highest quality ad images
export const NANO_BANANA_PRO = "gemini-3-pro-image-preview"
export const NANO_BANANA_2 = "gemini-3.1-flash-image-preview"
export const NANO_BANANA = "gemini-2.5-flash-image"

// Active model used for image generation in the app
export const IMAGE_MODEL = NANO_BANANA_PRO
