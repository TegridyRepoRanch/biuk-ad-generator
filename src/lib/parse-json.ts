/**
 * Extract and parse JSON from an AI model response.
 * Handles markdown fences (```json ... ```) and raw JSON.
 */
export function extractJSON<T = unknown>(text: string): T {
  // Strip markdown code fences if present
  let cleaned = text.trim()

  // Match ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // Try to find the outermost JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error("No JSON object found in response")
  }

  return JSON.parse(jsonMatch[0])
}
