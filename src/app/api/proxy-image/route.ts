import { NextRequest, NextResponse } from "next/server"
import { validateExternalUrl } from "@/lib/url-validation"
import { rateLimit } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-error"
import { logInfo, logWarn, logRequest } from "@/lib/logger"

const ROUTE_NAME = "proxy-image"

/**
 * GET /api/proxy-image?url=...
 * Proxies external images to avoid CORS issues in canvas export.
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now()
  logInfo(ROUTE_NAME, "Request received")

  const { allowed } = rateLimit(ROUTE_NAME, 60, 60_000)
  if (!allowed) {
    logWarn(ROUTE_NAME, "Rate limit exceeded")
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const url = req.nextUrl.searchParams.get("url")
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
  }

  const validation = validateExternalUrl(url)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 })
    }

    const contentType = res.headers.get("content-type")
    if (!contentType?.startsWith("image/")) {
      return NextResponse.json({ error: "URL does not point to an image" }, { status: 400 })
    }

    const buffer = await res.arrayBuffer()
    logRequest(ROUTE_NAME, "GET", Date.now() - startTime)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    })
  } catch (error) {
    console.error("Proxy image error:", error)
    return errorResponse(error, ROUTE_NAME)
  }
}
