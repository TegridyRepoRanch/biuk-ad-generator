"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useProject, useDispatch } from "@/lib/store"
import { ConceptAngle, ConceptResponse, ProductAnalysis, CreativeResearch } from "@/types/ad"
import { useApiCall } from "@/hooks/useApiCall"
import LoadingOverlay from "@/components/LoadingOverlay"
import ErrorBanner from "@/components/ErrorBanner"

interface ProductData {
  name: string | null
  brand: string | null
  description: string | null
  price: string | null
  currency: string | null
  category: string | null
  hero_image_url: string | null
  product_images: string[]
  ai_analysis: ProductAnalysis | null
}

export default function ConceptPage() {
  const project = useProject()
  const dispatch = useDispatch()
  const router = useRouter()
  const { loading: scraping, error: scrapeError, elapsed: scrapeElapsed, execute: executeScrape, clearError: clearScrapeError } = useApiCall()
  const { loading: generating, error: genError, elapsed: genElapsed, execute: executeGen, clearError: clearGenError } = useApiCall()

  const [productUrl, setProductUrl] = useState("")
  const [product, setProduct] = useState<ProductData | null>(null)
  const [research, setResearch] = useState<CreativeResearch | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [showManualBrief, setShowManualBrief] = useState(false)
  // Session gate: hide stale generated content until the user takes action in THIS session
  const [sessionStarted, setSessionStarted] = useState(false)
  // Flag to auto-fire concept generation after scrape completes
  const [pendingConceptGen, setPendingConceptGen] = useState(false)
  const cutoutPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clean up cutout polling on unmount
  useEffect(() => {
    return () => {
      if (cutoutPollRef.current) clearInterval(cutoutPollRef.current)
    }
  }, [])

  // Poll for async cutout URL (generated in background by scrape-product)
  const pollForCutout = useCallback((url: string) => {
    if (cutoutPollRef.current) clearInterval(cutoutPollRef.current)
    let attempts = 0
    cutoutPollRef.current = setInterval(async () => {
      attempts++
      if (attempts > 12) { // 60s max (12 * 5s)
        if (cutoutPollRef.current) clearInterval(cutoutPollRef.current)
        return
      }
      try {
        const res = await fetch("/api/scrape-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.product?.cutout_image_url) {
          dispatch({ type: "SET_BRIEF", payload: { productCutoutUrl: data.product.cutout_image_url } })
          if (cutoutPollRef.current) clearInterval(cutoutPollRef.current)
        }
      } catch { /* non-blocking */ }
    }, 5000)
  }, [dispatch])

  const canGenerate = (product?.ai_analysis?.suggestedBrief || project.brief.description.trim().length > 10)

  // ── Scrape + analyze product ─────────────────────────────────────
  const analyzeProduct = useCallback(async () => {
    if (!productUrl.trim()) return

    setSessionStarted(true)
    await executeScrape(async () => {
      const res = await fetch("/api/scrape-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: productUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to analyze product")

      setProduct(data.product)
      setResearch(data.research)
      setFromCache(data.fromCache)

      // Auto-populate brief fields from the analysis
      const analysis = data.product?.ai_analysis as ProductAnalysis | null
      if (analysis) {
        dispatch({
          type: "SET_BRIEF",
          payload: {
            description: analysis.suggestedBrief || "",
            targetAudience: analysis.targetAudience || "",
            campaignGoal: analysis.keySellingPoints?.[0] ? `Promote: ${analysis.keySellingPoints[0]}` : "",
          },
        })
      }

      // Persist analysis + research + product images in the reducer
      dispatch({
        type: "SET_PRODUCT_DATA",
        payload: {
          productAnalysis: analysis || undefined,
          creativeResearch: (data.research as CreativeResearch) || undefined,
        },
      })

      // Store product images for use in compose step
      dispatch({
        type: "SET_BRIEF",
        payload: {
          productImages: data.product?.product_images || [],
          productHeroUrl: data.product?.hero_image_url || null,
          productCutoutUrl: data.product?.cutout_image_url || null,
        },
      })

    })

    // Signal that we should auto-generate concepts once state settles
    setPendingConceptGen(true)
  }, [productUrl, executeScrape, dispatch])

  // ── Generate concepts ────────────────────────────────────────────
  const generateConcepts = useCallback(async (skipCache = false) => {
    await executeGen(async () => {
      const res = await fetch("/api/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: project.brief.description,
          referenceAnalysis: project.brief.referenceAnalysis,
          targetAudience: project.brief.targetAudience,
          campaignGoal: project.brief.campaignGoal,
          brandVoice: project.brief.brandVoice,
          productAnalysis: project.brief.productAnalysis,
          creativeResearch: project.brief.creativeResearch,
          skipCache,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to generate concepts")
      }
      const data: ConceptResponse = await res.json()
      if (!data.angles || data.angles.length === 0) {
        throw new Error("No concept angles returned. Try adding more detail to your brief.")
      }
      dispatch({ type: "SET_CONCEPT_ANGLES", payload: data.angles })
    })
  }, [project.brief, dispatch, executeGen])

  // Auto-chain: fire concept generation after scrape populates the brief
  useEffect(() => {
    if (pendingConceptGen && project.brief.description.trim().length > 10 && !generating) {
      setPendingConceptGen(false)
      generateConcepts()
    }
  }, [pendingConceptGen, project.brief.description, generating, generateConcepts])

  const selectAngle = (angle: ConceptAngle) => {
    dispatch({ type: "SELECT_CONCEPT", payload: angle.id })
  }

  const proceed = () => {
    if (project.concept.selectedAngleId) {
      dispatch({ type: "SET_STEP", payload: 2 })
      router.push("/create/format")
    }
  }

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      dispatch({
        type: "SET_BRIEF",
        payload: {
          referenceImages: [...project.brief.referenceImages, url],
        },
      })
      const formData = new FormData()
      formData.append("image", file)
      formData.append("imageId", `ref-${Date.now()}`)
      try {
        const res = await fetch("/api/analyze-reference", { method: "POST", body: formData })
        if (res.ok) {
          const analysis = await res.json()
          dispatch({
            type: "SET_BRIEF",
            payload: { referenceAnalysis: [...project.brief.referenceAnalysis, analysis] },
          })
        }
      } catch {
        // Non-blocking
      }
    }
  }

  return (
    <div className="step-transition relative mx-auto max-w-3xl px-6 py-10">
      {scraping && <LoadingOverlay message="Analyzing product page…" elapsed={scrapeElapsed}><p className="text-xs text-zinc-500">Scraping page, extracting data, running AI analysis</p></LoadingOverlay>}
      {generating && <LoadingOverlay message="Generating concepts…" elapsed={genElapsed} />}

      <h1 className="text-2xl font-bold">Step 1: Product &amp; Concept</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Paste a product link and we&apos;ll research it automatically — or write a brief manually.
      </p>

      {/* ── Product URL Input ──────────────────────────────────── */}
      <div className="mt-8">
        <label className="block text-sm font-medium text-zinc-300">Product URL</label>
        <div className="mt-1 flex gap-2">
          <input
            type="url"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyzeProduct()}
            placeholder="https://example.com/product-page"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <button
            onClick={analyzeProduct}
            disabled={!productUrl.trim() || scraping}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Analyze
          </button>
        </div>
        {scrapeError && <ErrorBanner error={scrapeError} onRetry={analyzeProduct} onDismiss={clearScrapeError} />}
      </div>

      {/* ── Product Card (after analysis) ──────────────────────── */}
      {product && (
        <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900 p-5">
          <div className="flex gap-4">
            {product.hero_image_url && (
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
                <img src={product.hero_image_url} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white truncate">{product.name || "Product"}</h3>
                {fromCache && (
                  <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    Cached
                  </span>
                )}
              </div>
              {product.brand && <p className="text-sm text-zinc-400">{product.brand}</p>}
              {product.price && (
                <p className="mt-1 text-sm font-medium text-zinc-200">
                  {product.currency || "$"}{product.price}
                </p>
              )}
              {product.ai_analysis?.targetAudience && (
                <p className="mt-2 text-xs text-zinc-500">
                  Audience: {product.ai_analysis.targetAudience}
                </p>
              )}
            </div>
          </div>

          {/* Emotional hooks */}
          {product.ai_analysis?.emotionalHooks && product.ai_analysis.emotionalHooks.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Emotional Hooks
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {product.ai_analysis.emotionalHooks.map((hook, i) => (
                  <span key={i} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                    {hook}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key selling points */}
          {product.ai_analysis?.keySellingPoints && product.ai_analysis.keySellingPoints.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Key Selling Points
              </div>
              <div className="mt-1.5 space-y-1">
                {product.ai_analysis.keySellingPoints.map((point, i) => (
                  <p key={i} className="text-xs text-zinc-400">• {point}</p>
                ))}
              </div>
            </div>
          )}

          {/* Product images */}
          {product.product_images && product.product_images.length > 1 && (
            <div className="mt-4">
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Product Images ({product.product_images.length})
              </div>
              <div className="mt-1.5 flex gap-2 overflow-x-auto">
                {product.product_images.slice(0, 6).map((img, i) => (
                  <div key={i} className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-zinc-700">
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Research Card ──────────────────────────────────────── */}
      {research && (
        <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Creative Research
          </div>

          {research.marketPositioning?.opportunity && (
            <p className="mt-2 text-sm text-zinc-300">
              {research.marketPositioning.opportunity}
            </p>
          )}

          {research.visualDirection?.suggestedStyles && (
            <div className="mt-3">
              <span className="text-[10px] font-medium uppercase text-zinc-500">Visual styles: </span>
              <span className="text-xs text-zinc-400">
                {research.visualDirection.suggestedStyles.join(" • ")}
              </span>
            </div>
          )}

          {research.copyDirection?.toneGuidance && (
            <div className="mt-2">
              <span className="text-[10px] font-medium uppercase text-zinc-500">Tone: </span>
              <span className="text-xs text-zinc-400">{research.copyDirection.toneGuidance}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Brief (auto-populated or manual) ───────────────────── */}
      {(product || showManualBrief) && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-zinc-300">
              Ad Brief {product ? "(auto-generated — edit if needed)" : "*"}
            </label>
          </div>
          <textarea
            value={project.brief.description}
            onChange={(e) =>
              dispatch({ type: "SET_BRIEF", payload: { description: e.target.value } })
            }
            placeholder="Describe the product/service, the campaign goal, and any key messages or offers..."
            rows={4}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Target Audience</label>
              <input
                type="text"
                value={project.brief.targetAudience || ""}
                onChange={(e) => dispatch({ type: "SET_BRIEF", payload: { targetAudience: e.target.value } })}
                placeholder="e.g. Women 25-45, fitness enthusiasts"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Campaign Goal</label>
              <input
                type="text"
                value={project.brief.campaignGoal || ""}
                onChange={(e) => dispatch({ type: "SET_BRIEF", payload: { campaignGoal: e.target.value } })}
                placeholder="e.g. Drive trial subscriptions"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Brand Voice</label>
              <input
                type="text"
                value={project.brief.brandVoice || ""}
                onChange={(e) => dispatch({ type: "SET_BRIEF", payload: { brandVoice: e.target.value } })}
                placeholder="e.g. Bold, confident, playful"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Reference Uploads */}
          <div>
            <label className="block text-sm font-medium text-zinc-300">Reference Ads (optional)</label>
            <div className="mt-2 flex flex-wrap gap-3">
              {project.brief.referenceImages.map((url, i) => (
                <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg border border-zinc-700">
                  <img src={url} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
                  {project.brief.referenceAnalysis[i] && (
                    <div className="absolute bottom-0 left-0 right-0 bg-emerald-500/80 px-1 py-0.5 text-center text-[10px] font-bold text-black">
                      Analyzed
                    </div>
                  )}
                </div>
              ))}
              <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300">
                <span className="text-2xl">+</span>
                <input type="file" accept="image/*" multiple onChange={handleReferenceUpload} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual brief toggle (no product URL) ───────────────── */}
      {!product && !showManualBrief && (
        <button
          onClick={() => { setShowManualBrief(true); setSessionStarted(true) }}
          className="mt-6 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Or write a brief manually without a product URL →
        </button>
      )}

      {/* ── Generate Concepts ──────────────────────────────────── */}
      {(product || showManualBrief) && (
        <div className="mt-8">
          <button
            onClick={() => generateConcepts(true)}
            disabled={!canGenerate || generating}
            className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generate Concept Angles
          </button>
          {genError && <ErrorBanner error={genError} onRetry={generateConcepts} onDismiss={clearGenError} />}
        </div>
      )}

      {/* ── Concept Angles (only show if session is active) ───── */}
      {sessionStarted && project.concept.angles.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pick a Concept Angle</h2>
            <button
              onClick={() => generateConcepts(true)}
              disabled={generating}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
            >
              {generating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {project.concept.angles.map((angle) => (
              <button
                key={angle.id}
                onClick={() => selectAngle(angle)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  project.concept.selectedAngleId === angle.id
                    ? "border-white bg-zinc-800"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{angle.hook}</p>
                    <p className="mt-1 text-sm text-zinc-400">{angle.rationale}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-700 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                    {angle.mechanism}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Next Step ──────────────────────────────────────────── */}
      {sessionStarted && project.concept.selectedAngleId && (
        <div className="mt-8 flex justify-end">
          <button
            onClick={proceed}
            className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Next: Format &amp; Layout &rarr;
          </button>
        </div>
      )}
    </div>
  )
}
