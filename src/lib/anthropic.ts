import Anthropic from "@anthropic-ai/sdk"

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required")
  }
  return new Anthropic({ apiKey })
}

export const MODEL = "claude-sonnet-4-6-20250514"
