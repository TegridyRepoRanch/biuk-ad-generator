import { NextRequest, NextResponse } from "next/server"
import { getSupabase, normalizeUrl } from "@/lib/supabase"
import { GEMINI_PRO, generateText } from "@/lib/gemini"
import { extractJSON } from "@/lib/parse-json"

/**
 * POST /api/scrape-product
 * Takes a product URL, scrapes it, analyzes with Gemini Pro, caches in Supabase.
 * Returns cached data if the URL has been seen before.
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "A product URL is required" }, { status: 400 })
    }

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`)
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    const normalized = normalizeUrl(parsedUrl.href)
    const supabase = getSupabase()

    // ── Check cache first ──────────────────────────────────────────
    const { data: cached } = await supabase
      .from("products")
      .select("*, research(*)")
      .eq("normalized_url", normalized)
      .single()

    if (cached) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cachedAny = cached as any
      return NextResponse.json({
        product: cached,
        research: cachedAny.research?.[0] ?? null,
        fromCache: true,
      })
    }

    // ── Scrape the product page ────────────────────────────────────
    const pageContent = await scrapeProductPage(parsedUrl.href)

    if (!pageContent.html && !pageContent.text) {
      return NextResponse.json(
        { error: "Could not fetch the product page. Check the URL and try again." },
        { status: 422 }
      )
    }

    // ── Extract product data + images from HTML ────────────────────
    const extracted = extractProductData(pageContent.html, parsedUrl.href)

    // ── Run Gemini analysis on the scraped content ─────────────────
    const analysisPrompt = buildAnalysisPrompt(
      pageContent.text,
      extracted,
      parsedUrl.href
    )

    const analysisText = await generateText(GEMINI_PRO, PRODUCT_ANALYSIS_SYSTEM_PROMPT, analysisPrompt)

    let aiAnalysis = null
    try {
      aiAnalysis = extractJSON(analysisText)
    } catch {
      // If Gemini didn't return valid JSON, create a basic analysis
      aiAnalysis = {
        targetAudience: "General consumers",
        keySellingPoints: [extracted.name || "Product"],
        emotionalHooks: ["Quality", "Value"],
        competitivePositioning: "Standard market positioning",
        productCategory: extracted.category || "General",
        suggestedBrief: `Ad for ${extracted.name || "this product"} — ${extracted.description?.slice(0, 200) || "a quality product"}`
      }
    }

    // ── Save to Supabase ───────────────────────────────────────────
    const productData = {
      url: parsedUrl.href,
      normalized_url: normalized,
      name: extracted.name || (aiAnalysis as Record<string, unknown>)?.productName || null,
      brand: extracted.brand || null,
      description: extracted.description || null,
      price: extracted.price || null,
      currency: extracted.currency || null,
      category: extracted.category || (aiAnalysis as Record<string, unknown>)?.productCategory || null,
      hero_image_url: extracted.heroImage || null,
      product_images: extracted.images || [],
      ai_analysis: aiAnalysis,
      raw_page_content: pageContent.text?.slice(0, 50000) || null, // Cap at 50KB
    }

    const { data: product, error: insertError } = await supabase
      .from("products")
      .insert(productData)
      .select()
      .single()

    if (insertError) {
      console.error("Supabase insert error:", insertError)
      // Still return the data even if caching failed
      return NextResponse.json({
        product: { ...productData, id: null },
        research: null,
        fromCache: false,
      })
    }

    // ── Generate research / positioning ────────────────────────────
    const researchPrompt = buildResearchPrompt(
      pageContent.text,
      extracted,
      aiAnalysis
    )

    const researchText = await generateText(GEMINI_PRO, RESEARCH_SYSTEM_PROMPT, researchPrompt)

    let researchData = null
    try {
      researchData = extractJSON(researchText)
    } catch {
      researchData = null
    }

    if (researchData && product) {
      await supabase.from("research").insert({
        product_id: product.id,
        market_positioning: (researchData as Record<string, unknown>)?.marketPositioning || null,
        visual_direction: (researchData as Record<string, unknown>)?.visualDirection || null,
        copy_direction: (researchData as Record<string, unknown>)?.copyDirection || null,
        competitor_brands: (researchData as Record<string, unknown>)?.competitorBrands || [],
      })
    }

    // Background removal is handled on-demand via /api/remove-background
    // (uses Gemini Nano Banana Pro, no extra API key needed).
    // The user triggers it from the Compose step when they want a cutout.

    return NextResponse.json({
      product: product || productData,
      research: researchData,
      fromCache: false,
    })
  } catch (error) {
    console.error("Product scrape error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze product" },
      { status: 500 }
    )
  }
}

// ── Scraping ──────────────────────────────────────────────────────

async function scrapeProductPage(url: string): Promise<{ html: string; text: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status}`)
    }

    const html = await res.text()

    // Extract text content (strip HTML tags for Gemini analysis)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30000)

    // If we got very little text, the page is likely JS-rendered.
    // The HTML still has meta/OG tags, so we return it — extractProductData
    // will fall back to those.
    return { html, text }
  } catch (err) {
    console.error("Scrape failed:", err)
    return { html: "", text: "" }
  }
}

// ── Product data extraction from HTML ─────────────────────────────

interface ExtractedProduct {
  name: string | null
  brand: string | null
  description: string | null
  price: string | null
  currency: string | null
  category: string | null
  heroImage: string | null
  images: string[]
}

function extractProductData(html: string, baseUrl: string): ExtractedProduct {
  const result: ExtractedProduct = {
    name: null, brand: null, description: null,
    price: null, currency: null, category: null,
    heroImage: null, images: [],
  }

  if (!html) return result

  // Try JSON-LD structured data first (most reliable)
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      try {
        const jsonStr = match.replace(/<script[^>]*>/, "").replace(/<\/script>/, "")
        const data = JSON.parse(jsonStr)
        const product = data["@type"] === "Product" ? data : data["@graph"]?.find((item: Record<string, string>) => item["@type"] === "Product")

        if (product) {
          result.name = product.name || null
          result.brand = product.brand?.name || product.brand || null
          result.description = product.description || null

          if (product.offers) {
            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers
            result.price = offer?.price?.toString() || null
            result.currency = offer?.priceCurrency || null
          }

          result.category = product.category || null

          if (product.image) {
            const images = Array.isArray(product.image) ? product.image : [product.image]
            result.images = images.filter((img: unknown): img is string => typeof img === "string").map((img: string) => resolveUrl(img, baseUrl))
            result.heroImage = result.images[0] || null
          }
        }
      } catch {
        // Invalid JSON-LD, continue
      }
    }
  }

  // Fallback: Open Graph tags
  if (!result.name) {
    result.name = extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || extractMeta(html, "title") || extractTag(html, "title")
  }
  if (!result.description) {
    result.description = extractMeta(html, "og:description") || extractMeta(html, "twitter:description") || extractMeta(html, "description")
  }
  if (!result.heroImage) {
    const ogImage = extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || extractMeta(html, "twitter:image:src")
    if (ogImage) {
      result.heroImage = resolveUrl(ogImage, baseUrl)
    }
  }
  if (!result.brand) {
    result.brand = extractMeta(html, "og:site_name")
  }

  // Fallback: find product images from HTML
  if (result.images.length === 0) {
    // Skip patterns for non-product images
    const skipPatterns = /favicon|logo|icon|pixel|track|spacer|badge|rating|star|arrow|chevron|spinner|loading|placeholder|avatar|profile|social/i

    const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*/gi)
    for (const m of imgMatches) {
      const src = m[1]
      const fullTag = m[0]
      if (!src || skipPatterns.test(src) || skipPatterns.test(fullTag)) continue

      // Prefer images that look like product images
      const isLikelyProduct =
        src.includes("product") ||
        src.includes("cdn") ||
        src.includes("images") ||
        src.includes("media") ||
        src.includes("upload") ||
        fullTag.includes("product") ||
        fullTag.includes("gallery") ||
        fullTag.includes("hero") ||
        src.match(/\.(jpg|jpeg|png|webp)/i)

      if (isLikelyProduct) {
        // Skip tiny images (1x1, 2x2 tracking pixels)
        const widthMatch = fullTag.match(/width=["']?(\d+)/i)
        if (widthMatch && parseInt(widthMatch[1]) < 50) continue

        const resolved = resolveUrl(src, baseUrl)
        if (!result.images.includes(resolved)) {
          result.images.push(resolved)
        }
      }
    }

    // Also check srcset for high-res images
    const srcsetMatches = html.matchAll(/srcset=["']([^"']+)["']/gi)
    for (const m of srcsetMatches) {
      const urls = m[1].split(",").map((s) => s.trim().split(/\s+/)[0])
      for (const src of urls) {
        if (src && !skipPatterns.test(src) && src.match(/\.(jpg|jpeg|png|webp)/i)) {
          const resolved = resolveUrl(src, baseUrl)
          if (!result.images.includes(resolved)) {
            result.images.push(resolved)
          }
        }
      }
    }

    if (!result.heroImage && result.images.length > 0) {
      result.heroImage = result.images[0]
    }
  }

  // Price fallback: multiple currency patterns
  if (!result.price) {
    // Try common price patterns: $29.99, £19.99, €24.99, ¥1200
    const priceMatch = html.match(/[\$£€¥][\d,]+\.?\d{0,2}/)
    if (priceMatch) {
      const symbol = priceMatch[0][0]
      result.price = priceMatch[0].slice(1).replace(",", "")
      result.currency = symbol === "$" ? "USD" : symbol === "£" ? "GBP" : symbol === "€" ? "EUR" : symbol === "¥" ? "JPY" : "USD"
    }
  }

  // Clean up: strip the site name from the product name if it was appended
  if (result.name && result.brand) {
    result.name = result.name
      .replace(new RegExp(`\\s*[-–|]\\s*${result.brand}\\s*$`, "i"), "")
      .replace(new RegExp(`^${result.brand}\\s*[-–|]\\s*`, "i"), "")
      .trim()
  }

  return result
}

function extractMeta(html: string, name: string): string | null {
  // Match both name="" and property="" attributes
  const match = html.match(new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))
    || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"))
  return match?.[1] || null
}

function extractTag(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"))
  return match?.[1]?.trim() || null
}

function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}

// ── Gemini prompts ────────────────────────────────────────────────

const PRODUCT_ANALYSIS_SYSTEM_PROMPT = `You are a senior advertising strategist analyzing a product page to prepare for ad creation. Your analysis drives the entire creative pipeline — generic output = generic ads.

RULES:
- Be SPECIFIC. "Health-conscious millennials" is bad. "Women 28-40 who meal prep on Sundays and track macros" is good.
- Selling points must be CONCRETE. "High quality" is banned. "Medical-grade stainless steel, dishwasher safe, 10-year warranty" is good.
- Emotional hooks must name the DESIRE or FEAR, not the product feature. "Save time" is bad. "The guilt of ordering takeout again when you said you'd cook" is good.
- The suggestedBrief must LEAD with the emotional hook, not the product. It should read like something a creative director would brief a designer with.
- priceAnchor: What comparison makes this price feel like a steal? (vs. competitor, vs. daily coffee, vs. cost of the problem)
- purchaseBarrier: What's the #1 reason someone would hesitate to buy? (price, skepticism, complexity, already owns alternative)

Return your analysis as JSON with this exact structure:
{
  "productName": "string",
  "targetAudience": "Ultra-specific audience description — demographics + psychographics + what they do on a Tuesday night",
  "keySellingPoints": ["3-5 CONCRETE selling points with numbers/specs, not adjectives"],
  "emotionalHooks": ["3-4 desires or fears this product activates — name the feeling, not the feature"],
  "competitivePositioning": "What makes this product's STORY different — not just features, but the angle that makes someone choose THIS over alternatives",
  "productCategory": "string",
  "pricePoint": "budget | mid-range | premium | luxury",
  "priceAnchor": "What comparison makes this price feel justified (e.g. 'Less than a daily coffee for a month of X')",
  "purchaseBarrier": "The #1 objection a potential buyer would have",
  "suggestedBrief": "A 2-3 sentence ad brief that LEADS with the desire/pain, then connects to the product. Must be hook-driven, not feature-driven. Start with what the audience WANTS, not what the product IS."
}`
const RESEARCH_SYSTEM_PROMPT = `You are a senior creative strategist preparing creative direction for a social media ad campaign. Your research will directly control image generation prompts and headline copy — be specific enough that a designer could execute from your notes alone.

RULES:
- Visual styles must be ACTIONABLE: "lifestyle flat-lay" is vague. "Overhead flat-lay on marble surface, warm side-light from camera-left, shallow DoF, 3 hero items arranged in triangle composition" is good.
- Mood keywords must be EMOTIONAL, not generic: "modern" is banned. "Quiet confidence of someone who's already made it" is good.
- Copy hooks must reference the SPECIFIC product/benefit: "Get results" is banned. "Your meal prep Sunday just went from 3 hours to 40 minutes" is good.
- Avoid patterns must name the SPECIFIC cliché: "stock photo look" is vague. "Person smiling at camera with product held at chin height, white background, stock overlay text" is specific.
- Color palettes should use descriptive modifiers: not just "blue" but "muted navy" or "electric cobalt."

Return your research as JSON:
{
  "marketPositioning": {
    "gap": "The specific unmet need or underserved angle — what are competitors NOT saying that this product SHOULD say?",
    "opportunity": "The creative opportunity for THIS ad specifically — what angle is wide open?",
    "differentiators": ["What makes this product's story unique for ads — the angles competitors can't copy"],
    "audienceInsights": "The deep psychological motivation — what does the buyer REALLY want? (status, belonging, control, relief from guilt, etc.)"
  },
  "visualDirection": {
    "suggestedStyles": ["3 specific visual treatments with camera angle, lighting, and subject described — executable by a photographer or AI image generator"],
    "colorPalettes": [["descriptive primary color", "descriptive secondary", "descriptive accent"]],
    "moodKeywords": ["5 emotional/atmospheric mood words — not generic adjectives"],
    "avoidPatterns": ["3-5 specific visual clichés common in this product category that we should NOT do"]
  },
  "copyDirection": {
    "hooks": ["5 specific headline hooks that reference THIS product's actual benefit — not fill-in-the-blank templates"],
    "avoidCliches": ["3-5 overused phrases/patterns in this category's advertising"],
    "toneGuidance": "Specific tone direction with examples — e.g. 'Confident but not cocky. Think friend who casually mentions their raise, not LinkedIn influencer.'"
  },
  "competitorBrands": ["3-5 actual competitor brands in this space"]
}`

function buildAnalysisPrompt(
  pageText: string,
  extracted: ExtractedProduct,
  url: string
): string {
  let prompt = `Analyze this product page for ad creation.\n\nURL: ${url}\n`

  if (extracted.name) prompt += `Product: ${extracted.name}\n`
  if (extracted.brand) prompt += `Brand: ${extracted.brand}\n`
  if (extracted.price) prompt += `Price: ${extracted.currency || "$"}${extracted.price}\n`
  if (extracted.description) prompt += `Description: ${extracted.description}\n`

  prompt += `\nFull page content:\n${pageText?.slice(0, 20000) || "Could not extract page text"}`
  prompt += `\n\nAnalyze this product and return your assessment as JSON.`

  return prompt
}

function buildResearchPrompt(
  pageText: string,
  extracted: ExtractedProduct,
  aiAnalysis: unknown
): string {
  let prompt = `Based on this product analysis, provide creative direction for an ad campaign.\n\n`
  prompt += `Product: ${extracted.name || "Unknown"}\n`
  prompt += `Brand: ${extracted.brand || "Unknown"}\n`
  prompt += `Category: ${extracted.category || "Unknown"}\n`

  if (aiAnalysis && typeof aiAnalysis === "object") {
    prompt += `\nAI Analysis:\n${JSON.stringify(aiAnalysis, null, 2)}\n`
  }

  prompt += `\nPage content excerpt:\n${pageText?.slice(0, 10000) || "N/A"}`
  prompt += `\n\nProvide your creative research as JSON.`

  return prompt
}
