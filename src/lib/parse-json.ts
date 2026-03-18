/**
 * Extract and parse JSON from an AI model response.
 * Handles markdown fences (```json ... ```) and raw JSON.
 * Uses balanced-brace matching instead of greedy regex to avoid
 * capturing trailing commentary that contains braces.
 */
export function extractJSON<T = unknown>(text: string): T {
  // Strip markdown code fences if present
  let cleaned = text.trim()

  // Match ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // Find the first { and use balanced-brace matching to find its closing }
  const start = cleaned.indexOf("{")
  if (start === -1) {
    throw new Error("No JSON object found in response")
  }

  let depth = 0
  let end = -1
  let inString = false
  let escape = false

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]

    if (escape) {
      escape = false
      continue
    }

    if (ch === "\\") {
      escape = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }

  if (end === -1) {
    throw new Error("No complete JSON object found in response")
  }

  return JSON.parse(cleaned.slice(start, end + 1))
}
