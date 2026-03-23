import { getSupabase, normalizeUrl } from "@/lib/supabase"
import { GEMINI_FLASH } from "@/lib/gemini"

// ── Scene DNA Library ─────────────────────────────────────────────
// Each category has 8-12 specific, photorealistic scene descriptions
// These are NOT full prompts — they're the SUBJECT MATTER that gets
// wrapped in a photography spec template

export const SCENE_DNA: Record<string, string[]> = {
  "carpet-fabric-cleaner": [
    "A large red wine spill spreading across a cream-colored wool carpet in a modern living room, with a tipped wine glass nearby",
    "Muddy dog paw prints tracked across a pristine white shag rug, leading from a front door into a living room",
    "A dark coffee stain soaking into a light grey fabric sofa cushion, with a toppled ceramic mug beside it",
    "Ground-in chocolate smudges on a beige upholstered dining chair seat, crumbs scattered nearby",
    "A toddler's juice spill — bright purple grape juice pooling on a cream carpet near scattered toys",
    "Multiple overlapping boot prints of dried mud on a light oatmeal Berber carpet near an entryway",
    "A pasta sauce splatter across a white linen tablecloth draped over a farmhouse dining table",
    "Pet vomit stain on a light-colored carpet runner in a hallway, harsh overhead light emphasizing the discoloration",
  ],
  "kitchen-degreaser": [
    "Thick grease buildup and burnt oil residue on stainless steel stovetop burner grates, shot macro",
    "A glass oven door caked with months of baked-on grease splatters and food residue, backlit to show the grime",
    "Sticky, yellowed grease film coating a stainless steel range hood, with drip lines visible in harsh light",
    "A greasy, food-splattered microwave interior with dried sauce explosions on walls and ceiling",
    "Cooking oil splatter pattern across white subway tile backsplash behind a stovetop",
    "A deep fryer basket coated in dark, oxidized cooking oil residue, sitting on a kitchen counter",
    "Greasy fingerprints and cooking residue smeared across a glass cooktop surface, shot at an angle to catch light reflections",
    "A kitchen exhaust fan filter completely clogged with thick brown grease buildup",
  ],
  "mould-remover": [
    "Black mould growing in the grout lines between white bathroom tiles, spreading in organic patterns",
    "Dark mould patches on a damp bathroom ceiling corner above a shower, with condensation droplets",
    "Green and black mould spreading across a windowsill and into the window frame in a humid bathroom",
    "Mould growing behind a toilet base where it meets the floor tiles, shot from a low angle",
    "Mildew stains across the bottom edge of a shower curtain, with spores visible on the fabric",
    "Black mould creeping along the silicone sealant around a bathtub edge",
    "Damp, mouldy wall section where wallpaper is peeling away, revealing dark mould patches underneath",
    "Mould growth on a basement wall corner with visible moisture damage and water staining",
  ],
  "outdoor-patio-cleaner": [
    "Green algae and moss covering weathered stone patio slabs, with dark organic staining between joints",
    "A wooden deck covered in grey weathering, green algae streaks, and leaf stain imprints",
    "Dirty, stained concrete driveway with oil drips, tire marks, and embedded dirt",
    "Moss-covered brick garden path with weeds growing between the joints",
    "Weathered and green-stained garden furniture — a plastic chair covered in algae and bird droppings",
    "A once-white rendered garden wall now streaked with green algae and atmospheric pollution stains",
    "Lichen and moss growing on a stone garden wall, close-up texture showing organic growth patterns",
    "A neglected patio area with puddles of stagnant water, fallen leaves, and green slime between pavers",
  ],
  "general-surface-cleaner": [
    "Dusty, smudged glass surfaces on a coffee table with fingerprints and water rings visible in angled light",
    "A bathroom mirror covered in toothpaste splatters, water spots, and soap film",
    "A kitchen counter with dried food residue, water stains, and scattered crumbs",
    "Streaky, smudged stainless steel refrigerator surface covered in fingerprints and water marks",
    "A glass shower door with heavy limescale buildup and soap scum creating an opaque white film",
    "Dusty wooden furniture surface with visible dust buildup, scratch marks, and ring stains from glasses",
    "A dirty porcelain sink with soap scum ring, toothpaste residue, and water stains around the drain",
    "Grimy light switches and door handles with visible dirt accumulation and fingerprint buildup",
  ],
  "laundry-stain-remover": [
    "A white cotton shirt with a large red wine stain down the front, laid flat on a surface",
    "Grass-stained knees on a pair of children's white cricket trousers",
    "A white pillowcase with yellow sweat stains around the head area",
    "Coffee splashed down the front of a light blue dress shirt, dripping and spreading into the fabric",
    "A baby's white onesie covered in multiple food stains — orange puree, green vegetables, brown chocolate",
    "Motor oil and grease stains on a pair of work jeans, concentrated around the thigh area",
    "Blood stain on white bedsheets, partially dried and set into the fabric",
    "Deodorant buildup and yellowing in the armpit area of a white t-shirt",
  ],
}

// ── Photography Spec Template ─────────────────────────────────────
// Wraps around scene DNA to ensure consistent photorealistic quality

export function buildPhotographyPrompt(scene: string, aspectRatio: string = "1:1"): string {
  return `${scene}. Shot on a Canon EOS R5 with a 35mm f/1.4L lens at ISO 400. Shallow depth of field with the main subject tack-sharp and background elements softly blurred. Natural available light with slight directional side-lighting from camera-left creating texture and dimension. The scene fills the entire frame edge-to-edge with no empty space, no borders, no vignette. Ultra photorealistic photograph at 4K resolution. Raw, unedited look — not overly saturated or processed. No text, no logos, no watermarks, no typography, no UI elements. Aspect ratio ${aspectRatio}.`
}

// ── Product Intelligence Types ────────────────────────────────────

export interface ProductIntelligence {
  url: string
  normalizedUrl: string
  name: string
  description: string
  category: string
  features: string[]
  targetSurfaces: string[]
  problemItSolves: string
  priceInfo: string | null
  scenePool: string[] // pre-selected scenes from DNA library
  cachedAt: string
}

// ── Supabase Cache Layer ──────────────────────────────────────────

export async function getCachedIntelligence(productUrl: string): Promise<ProductIntelligence | null> {
  try {
    const supabase = getSupabase()
    const normalized = normalizeUrl(productUrl)
    const { data } = await supabase
      .from("product_intelligence")
      .select("*")
      .eq("normalized_url", normalized)
      .single()

    if (data) {
      return {
        url: data.url,
        normalizedUrl: data.normalized_url,
        name: data.name,
        description: data.description,
        category: data.category,
        features: data.features || [],
        targetSurfaces: data.target_surfaces || [],
        problemItSolves: data.problem_it_solves,
        priceInfo: data.price_info,
        scenePool: data.scene_pool || [],
        cachedAt: data.cached_at,
      }
    }
    return null
  } catch {
    return null // Supabase not configured or unavailable — skip cache
  }
}

export async function cacheIntelligence(intel: ProductIntelligence): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase
      .from("product_intelligence")
      .upsert(
        {
          url: intel.url,
          normalized_url: intel.normalizedUrl,
          name: intel.name,
          description: intel.description,
          category: intel.category,
          features: intel.features,
          target_surfaces: intel.targetSurfaces,
          problem_it_solves: intel.problemItSolves,
          price_info: intel.priceInfo,
          scene_pool: intel.scenePool,
          cached_at: intel.cachedAt,
        },
        { onConflict: "normalized_url" }
      )
  } catch {
    // Non-fatal: caching failure shouldn't kill the pipeline
  }
}

// ── Deep Product Scrape + Classification ──────────────────────────

export async function analyzeProduct(
  productUrl: string,
  generateTextFn: (model: string, system: string, user: string, timeout: number) => Promise<string>,
  extractJSONFn: <T>(raw: string) => T
): Promise<ProductIntelligence> {
  // Check cache first
  const cached = await getCachedIntelligence(productUrl)
  if (cached) return cached

  // Scrape the product page
  let pageText = ""
  try {
    const res = await fetch(productUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const html = await res.text()
      // Extract visible text — strip tags but keep structure
      pageText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000) // Cap at 5000 chars for the LLM
    }
  } catch {
    pageText = `Product URL: ${productUrl}`
  }

  // Send to Gemini for structured extraction + classification
  const EXTRACTION_SYSTEM = `You are a product analyst. Given a product page's text content, extract structured product intelligence and classify it into a category.

Available categories (pick the BEST match):
- carpet-fabric-cleaner: carpet cleaners, upholstery cleaners, fabric stain removers
- kitchen-degreaser: kitchen cleaners, degreasers, oven cleaners, stovetop cleaners
- mould-remover: mould removers, mildew cleaners, anti-mould products, bathroom mould treatments
- outdoor-patio-cleaner: patio cleaners, driveway cleaners, deck cleaners, outdoor surface cleaners, algae removers, black spot removers
- general-surface-cleaner: multi-surface cleaners, glass cleaners, bathroom cleaners, all-purpose cleaners
- laundry-stain-remover: laundry detergents, stain removers, fabric treatments

Return JSON:
{
  "name": "Product name",
  "description": "One-sentence product description",
  "category": "one-of-the-categories-above",
  "features": ["feature 1", "feature 2", ...],
  "targetSurfaces": ["carpet", "fabric", "upholstery", ...],
  "problemItSolves": "The core problem this product addresses in one sentence",
  "priceInfo": "Price if found, or null"
}`

  const extractionRaw = await generateTextFn(
    GEMINI_FLASH,
    EXTRACTION_SYSTEM,
    `Product page URL: ${productUrl}\n\nPage content:\n${pageText}`,
    30_000
  )

  const extracted = extractJSONFn<{
    name: string
    description: string
    category: string
    features: string[]
    targetSurfaces: string[]
    problemItSolves: string
    priceInfo: string | null
  }>(extractionRaw)

  // Get scene pool from DNA library
  const category = extracted.category || "general-surface-cleaner"
  const allScenes = SCENE_DNA[category] || SCENE_DNA["general-surface-cleaner"]

  // Shuffle and pick 5 scenes for this product's pool
  const shuffled = [...allScenes].sort(() => Math.random() - 0.5)
  const scenePool = shuffled.slice(0, Math.min(5, shuffled.length))

  const intel: ProductIntelligence = {
    url: productUrl,
    normalizedUrl: normalizeUrl(productUrl),
    name: extracted.name || "Unknown Product",
    description: extracted.description || "",
    category,
    features: extracted.features || [],
    targetSurfaces: extracted.targetSurfaces || [],
    problemItSolves: extracted.problemItSolves || "",
    priceInfo: extracted.priceInfo || null,
    scenePool,
    cachedAt: new Date().toISOString(),
  }

  // Cache for next time
  await cacheIntelligence(intel)

  return intel
}

// ── Scene Selection ───────────────────────────────────────────────
// Pick a scene from the pool, cycling through to avoid repetition

export function selectScene(intel: ProductIntelligence, usedScenes: string[] = []): string {
  const available = intel.scenePool.filter((s) => !usedScenes.includes(s))
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]
  }
  // All used — cycle back
  return intel.scenePool[Math.floor(Math.random() * intel.scenePool.length)]
}
