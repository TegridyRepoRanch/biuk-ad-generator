import { ConceptAngle, ReferenceAnalysis } from "@/types/ad"

export const CONCEPT_SYSTEM_PROMPT = `You are a senior creative director at a top-tier advertising agency. You specialize in social media performance ads — ads that stop the scroll and drive action.

Your job is to generate 3 concept angles for an ad based on the client brief. Each concept angle is:
- A single-sentence emotional hook (what the viewer feels when they see this ad)
- The hook mechanism used (curiosity gap, bold specific claim, direct address to pain, pattern interrupt, before/after contrast, or social proof)
- A brief rationale explaining why this angle will work for this specific brief

Rules:
- Each angle must use a DIFFERENT hook mechanism
- Hooks must activate a desire or pain — never just describe the product
- Be concrete and specific, not generic
- Write in the audience's language, not marketing-speak
- Numbers outperform words ("7 days" not "one week")
- Avoid puns, yes/no questions, superlatives without proof, and words like "elevate", "transform", "unlock"

Return your response as JSON matching this exact structure:
{
  "angles": [
    {
      "id": "1",
      "hook": "The single-sentence emotional hook",
      "mechanism": "curiosity-gap",
      "rationale": "Why this works for this brief"
    }
  ]
}`

export function buildConceptUserPrompt(
  brief: string,
  referenceAnalysis?: ReferenceAnalysis[],
  targetAudience?: string,
  campaignGoal?: string,
  brandVoice?: string
): string {
  let prompt = `Client Brief:\n${brief}\n`

  if (targetAudience) {
    prompt += `\nTarget Audience: ${targetAudience}`
  }
  if (campaignGoal) {
    prompt += `\nCampaign Goal: ${campaignGoal}`
  }
  if (brandVoice) {
    prompt += `\nBrand Voice: ${brandVoice}`
  }

  if (referenceAnalysis && referenceAnalysis.length > 0) {
    prompt += `\n\nThe client provided reference ads. Here are the principles extracted:\n`
    referenceAnalysis.forEach((ref, i) => {
      prompt += `\nReference ${i + 1}: ${ref.keyPrinciples.join(", ")}`
    })
    prompt += `\n\nGenerate concept angles that share these PRINCIPLES without copying the surface appearance. The new ads should feel like they belong in the same family as the references.`
  }

  prompt += `\n\nGenerate 3 concept angles as JSON.`
  return prompt
}

export const IMAGE_PROMPT_SYSTEM_PROMPT = `You are an expert at writing image generation prompts optimized for the Gemini image generation model (Nano Banana Pro). This model uses a "Thinking" mode that follows complex, multi-layered instructions with high fidelity — so be as specific and compositionally detailed as you would in a professional art direction brief.

Your job is to write 3 detailed image generation prompts based on the ad concept and layout specifications. The generated image will be used as the background/anchor of a social media ad with text overlaid later.

COMPOSITION & NEGATIVE SPACE (critical):
- You MUST specify exactly where negative space / low-detail areas should be, using concrete spatial descriptions: "the top 30% of the frame", "a smooth gradient area occupying the left third", etc.
- Describe what should NOT be in the text area: no fine detail, no busy patterns, no faces, no product elements
- The negative space region must have enough tonal contrast for overlaid text to be readable
- If text goes on a dark area, the negative space should be dark/muted; if on light, keep it bright/airy

VISUAL DIRECTION (be extremely specific):
- Camera angle and distance: "shot from 45° above", "tight macro at f/2.8", "environmental wide at 24mm"
- Lighting: specify direction, color temperature, quality — "warm golden hour side-light from camera-left, 3200K, soft diffused"
- Color palette: name 2-3 dominant colors with modifiers — "desaturated sage green", "warm amber", "deep charcoal"
- Depth of field: "shallow DoF with subject sharp and background bokeh at f/1.8" vs "everything in focus, editorial flat"
- Mood/atmosphere: "quiet confidence", "energetic motion blur", "warm intimacy"
- Texture and material quality: "matte ceramic", "dewy skin", "brushed metal"

ABSOLUTE RULES:
- Do NOT include any text, typography, logos, watermarks, brand names, or written words in the image
- Do NOT include any UI elements, buttons, or overlays
- Specify the aspect ratio in every prompt
- Each of the 3 prompts must offer a meaningfully different visual interpretation — vary the subject, angle, or mood

Return your response as JSON:
{
  "prompts": [
    {
      "id": "1",
      "text": "The full image generation prompt..."
    }
  ]
}`

export function buildImagePromptUserPrompt(
  concept: ConceptAngle,
  messageZonePosition: string,
  width: number,
  height: number,
  contrastMethod?: string
): string {
  const aspectRatio = width === height ? "1:1" : width > height ? `${width}:${height}` : `${height}:${width} (portrait)`

  // Calculate what percentage of the frame the text zone occupies
  const isVertical = messageZonePosition.includes("top") || messageZonePosition.includes("bottom")
  const zonePercent = isVertical ? "~30%" : "~35%"

  let prompt = `Concept: "${concept.hook}" (${concept.mechanism})
Rationale: ${concept.rationale}

Canvas: ${width}×${height}px (${aspectRatio})
Text placement zone: ${messageZonePosition} of the frame (approximately ${zonePercent} of the image)

CRITICAL: The ${messageZonePosition} must be a clean, low-detail area suitable for overlaid text. No busy patterns, faces, or key visual elements in that region.`

  if (contrastMethod) {
    const contrastHint: Record<string, string> = {
      "gradient-overlay": "A gradient overlay will be applied over the text zone, so the image can have moderate detail there — the gradient will create contrast.",
      "solid-block": "A solid dark block will sit behind the text, so the text zone can have some visual activity — it will be partially obscured.",
      "text-shadow": "Text will have drop shadows for contrast, so the text zone should ideally be mid-to-dark toned without high-frequency detail.",
      "natural-area": "No overlay will be used — the text zone MUST have a naturally smooth, low-detail area (sky, gradient wall, out-of-focus background, solid surface).",
      "outlined-text": "Text will be outlined/stroked for contrast, so the text zone can have moderate detail but should avoid very busy or high-contrast patterns.",
    }
    const hint = contrastHint[contrastMethod]
    if (hint) prompt += `\n\nContrast method: ${contrastMethod}. ${hint}`
  }

  prompt += `\n\nGenerate 3 image prompts as JSON. Remember: absolutely NO text, logos, or typography rendered in the image.`
  return prompt
}


export const COPY_SYSTEM_PROMPT = `You are writing ad copy for a social media ad. You are a senior copywriter who specializes in high-converting social media ads.

Rules:
- Headlines must be 2-6 words maximum
- Headlines must activate a desire or pain — never just describe the product
- Numbers outperform words ("7 days" not "one week")
- Concrete nouns outperform abstract ones ("$40K months" not "financial freedom")
- Write in audience language, not brand marketing-speak
- CTAs must be 2-4 words and specific to the desired action
- NEVER use generic CTAs like "Learn More", "Click Here", "Sign Up", "Get Started"
- Subhead is optional — only include if it adds genuine value
- Copy must COMPLEMENT the image, not repeat what's visible
- Avoid puns, yes/no questions, superlatives without proof
- Avoid "Elevate", "Transform", "Unlock" — overused to invisibility

Generate 3 headline variations, each using a DIFFERENT hook mechanism:
1. One using curiosity gap, bold claim, or pattern interrupt
2. One using direct address to pain or before/after contrast
3. One using social proof or specificity

Also generate 2 CTA options that are specific to the campaign goal.

Return your response as JSON:
{
  "variations": [
    {
      "id": "1",
      "headline": "2-6 word headline",
      "subhead": "Optional subhead or null",
      "cta": "2-4 word CTA",
      "hookMechanism": "mechanism-name",
      "wordCount": 4
    }
  ]
}`

export function buildCopyUserPrompt(
  concept: ConceptAngle,
  imageDescription: string,
  messageZonePosition: string,
  contrastMethod?: string,
  targetAudience?: string,
  campaignGoal?: string,
  brandVoice?: string
): string {
  let prompt = `Concept angle: "${concept.hook}" (${concept.mechanism})

The image shows: ${imageDescription}

The headline will appear in the ${messageZonePosition} of the image.`

  if (contrastMethod) {
    const readabilityHints: Record<string, string> = {
      "gradient-overlay": "Text sits on a gradient overlay — headlines can be bold and high-contrast.",
      "solid-block": "Text sits on a solid dark block — headlines will have guaranteed readability, so focus on impact over legibility tricks.",
      "text-shadow": "Text has drop shadows — keep headlines short and punchy for best readability.",
      "natural-area": "Text sits directly on the image's natural low-detail area — keep word count minimal (2-4 words ideal).",
      "outlined-text": "Text is outlined/stroked — shorter headlines work better, avoid thin letterforms.",
    }
    const hint = readabilityHints[contrastMethod]
    if (hint) prompt += `\nContrast method: ${hint}`
  }

  if (targetAudience) prompt += `\nTarget audience: ${targetAudience}`
  if (campaignGoal) prompt += `\nCampaign goal: ${campaignGoal}`
  if (brandVoice) prompt += `\nBrand voice: ${brandVoice}`

  prompt += `\n\nWrite copy that complements the image — don't describe what the viewer can already see. Instead, speak to the desire or pain that the image activates.\n\nGenerate 3 headline variations with CTAs as JSON.`
  return prompt
}

export const REFERENCE_ANALYSIS_SYSTEM_PROMPT = `Analyze this ad image as a senior creative director. Don't just describe what you see — explain the design decisions and WHY they work.

For each reference ad, provide:

1. VISUAL HIERARCHY
   - What element has the most visual weight? (This is the anchor)
   - What's the eye path? (1st → 2nd → 3rd)
   - If two elements compete for attention, note this as a hierarchy problem
   - Scan pattern: Z-pattern (horizontal) or F-pattern (vertical)?

2. COMPOSITION
   - Overlay a mental 3x3 grid. Where do key elements fall?
   - Is it using rule of thirds, golden ratio, or centered symmetry?
   - Where is the visual tension? (where elements break the expected grid)
   - What percentage is negative space vs. content?

3. COLOR STRATEGY
   - Dominant color (60% of frame):
   - Secondary color (30%):
   - Accent color (10%):
   - How does color create hierarchy? (CTA/headline usually in accent)

4. COPY MECHANICS
   - Word count per text element
   - Hook mechanism used (curiosity, bold claim, direct address, etc.)
   - How does copy work WITH the image? (complementary vs. independent)
   - Reading order created by the layout

5. PSYCHOLOGICAL HOOK
   - What desire or pain does this ad activate?
   - What's the implied transformation? (before state → after state)
   - Social proof / scarcity / authority / urgency signals?

Return the analysis as JSON matching this structure:
{
  "imageId": "string",
  "visualHierarchy": {
    "anchor": "string",
    "eyePath": ["string"],
    "hasCompetingAnchors": false,
    "scanPattern": "z-pattern" | "f-pattern" | "single-focal"
  },
  "composition": {
    "gridPlacement": "string",
    "technique": "rule-of-thirds" | "golden-ratio" | "centered" | "asymmetric",
    "negativeSpacePercent": 30,
    "tensionPoint": "string"
  },
  "colorStrategy": {
    "dominant": { "color": "string", "percent": 60 },
    "secondary": { "color": "string", "percent": 30 },
    "accent": { "color": "string", "percent": 10 },
    "hierarchyMethod": "string"
  },
  "copyMechanics": {
    "headlineWords": 4,
    "hookMechanism": "string",
    "copyImageRelationship": "complementary" | "independent" | "redundant",
    "readingOrder": ["string"]
  },
  "psychologicalHook": {
    "desireOrPain": "string",
    "impliedTransformation": { "before": "string", "after": "string" },
    "persuasionSignals": ["string"]
  },
  "keyPrinciples": ["string"]
}`
