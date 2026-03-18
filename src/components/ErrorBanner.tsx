"use client"

/**
 * User-friendly error banner with retry button and human-readable guidance.
 */

const ERROR_GUIDANCE: Record<string, string> = {
  overloaded: "The AI service is temporarily overloaded. This usually resolves within a minute.",
  "rate limit": "Too many requests — please wait a moment before trying again.",
  "429": "Rate limit reached. Wait 30 seconds and try again.",
  "403": "API access denied — check that your API key is configured correctly.",
  "401": "Authentication failed — your API key may be invalid or expired.",
  "500": "The AI service encountered an internal error. Try again in a moment.",
  "503": "Service temporarily unavailable. The provider may be experiencing downtime.",
  timeout: "The request took too long. Try simplifying your brief or generating again.",
  "network": "Connection issue — check your internet and try again.",
  "did not return an image": "The AI declined to generate this image. Try adjusting your prompt — remove any content that might trigger safety filters.",
  "safety": "The prompt was flagged by the AI's safety filter. Revise the prompt to avoid sensitive content.",
  "content filtered": "Content was filtered. Try rephrasing your prompt with less controversial language.",
}

function getGuidance(errorMessage: string): string {
  const lower = errorMessage.toLowerCase()
  for (const [key, guidance] of Object.entries(ERROR_GUIDANCE)) {
    if (lower.includes(key.toLowerCase())) return guidance
  }
  return "Something went wrong. Please try again."
}

export default function ErrorBanner({
  error,
  onRetry,
  onDismiss,
}: {
  error: string
  onRetry?: () => void
  onDismiss?: () => void
}) {
  const guidance = getGuidance(error)

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-red-400">⚠</span>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-red-300">{guidance}</p>
          <p className="text-xs text-red-400/70">Details: {error}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-400 hover:text-red-300"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-md bg-red-500/20 px-4 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
