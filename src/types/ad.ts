// Core types for the Ad Creator app

export type Platform =
  | "ig-feed-square"
  | "ig-feed-portrait"
  | "ig-stories"
  | "fb-stories"
  | "tiktok"
  | "fb-feed-square"
  | "fb-feed-landscape"
  | "fb-feed-portrait"
  | "ig-reels-cover"

export interface SafeZones {
  top: number
  bottom: number
  left: number
  right: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PlatformSpec {
  name: string
  platform: string
  format: string
  width: number
  height: number
  aspectRatio: string
  safeZones: SafeZones
  notes: string
}

export interface ConceptAngle {
  id: string
  hook: string
  mechanism: string
  rationale: string
}

export interface ReferenceAnalysis {
  imageId: string
  visualHierarchy: {
    anchor: string
    eyePath: string[]
    hasCompetingAnchors: boolean
    scanPattern: "z-pattern" | "f-pattern" | "single-focal"
  }
  composition: {
    gridPlacement: string
    technique: "rule-of-thirds" | "golden-ratio" | "centered" | "asymmetric"
    negativeSpacePercent: number
    tensionPoint: string
  }
  colorStrategy: {
    dominant: { color: string; percent: number }
    secondary: { color: string; percent: number }
    accent: { color: string; percent: number }
    hierarchyMethod: string
  }
  copyMechanics: {
    headlineWords: number
    hookMechanism: string
    copyImageRelationship: "complementary" | "independent" | "redundant"
    readingOrder: string[]
  }
  psychologicalHook: {
    desireOrPain: string
    impliedTransformation: { before: string; after: string }
    persuasionSignals: string[]
  }
  keyPrinciples: string[]
}

export interface CopyVariation {
  id: string
  headline: string
  subhead?: string
  cta: string
  hookMechanism: string
  wordCount: number
}

export type ContrastMethod =
  | "solid-block"
  | "gradient-overlay"
  | "text-shadow"
  | "natural-area"
  | "outlined-text"

export interface CTAStyle {
  backgroundColor: string
  textColor: string
  borderRadius: number
  padding: { x: number; y: number }
  fontSize: number
}

export interface GradientConfig {
  direction: string
  from: string
  to: string
  coverage: number
}

// ── Product analysis & creative research (from URL scrape) ────────

export interface ProductAnalysis {
  productName?: string
  targetAudience?: string
  keySellingPoints?: string[]
  emotionalHooks?: string[]
  competitivePositioning?: string
  productCategory?: string
  pricePoint?: string
  priceAnchor?: string
  purchaseBarrier?: string
  suggestedBrief?: string
}

export interface CreativeResearch {
  marketPositioning?: {
    gap?: string
    opportunity?: string
    differentiators?: string[]
    audienceInsights?: string
  }
  visualDirection?: {
    suggestedStyles?: string[]
    colorPalettes?: string[][]
    moodKeywords?: string[]
    avoidPatterns?: string[]
  }
  copyDirection?: {
    hooks?: string[]
    avoidCliches?: string[]
    toneGuidance?: string
  }
  competitorBrands?: string[]
}

export interface ProductImageLayer {
  url: string                    // product image or cutout URL
  position: { x: number; y: number }
  scale: number                  // 0.1 to 2.0
  rotation: number               // degrees, -180 to 180
  opacity: number                // 0 to 1
  visible: boolean
}

export interface AdProject {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7

  brief: {
    description: string
    referenceImages: string[]
    referenceAnalysis: ReferenceAnalysis[]
    targetAudience?: string
    campaignGoal?: string
    brandVoice?: string
    constraints?: string
    productAnalysis?: ProductAnalysis
    creativeResearch?: CreativeResearch
    productImages?: string[]       // all scraped product image URLs
    productHeroUrl?: string | null // hero image from scrape
    productCutoutUrl?: string | null // background-removed cutout
  }
  concept: {
    angles: ConceptAngle[]
    selectedAngleId: string | null
  }

  format: {
    platform: Platform
    width: number
    height: number
    safeZones: SafeZones
    layout: {
      anchorZone: Rect
      messageZone: Rect
      supportZone: Rect | null
    }
    contrastMethod: ContrastMethod
  }

  imagePrompts: {
    prompts: Array<{
      id: string
      text: string
      isEdited: boolean
      rank?: number
      reason?: string
    }>
    selectedPromptId: string | null
  }

  uploadedImage: {
    url: string | null
    aiDescription?: string
  }

  copy: {
    variations: CopyVariation[]
    selected: {
      headline: string
      subhead?: string
      cta: string
    } | null
  }

  composition: {
    textPosition: { x: number; y: number }
    headlineFontSize: number
    headlineFontFamily: string
    headlineFontWeight: number
    headlineColor: string
    headlineAlign: "left" | "center" | "right"
    subheadFontSize?: number
    subheadColor?: string
    ctaStyle: CTAStyle
    overlayGradient?: GradientConfig
    productImage?: ProductImageLayer
    supportElements: Array<{
      type: "logo" | "badge" | "text"
      content: string
      position: { x: number; y: number }
      size: { width: number; height: number }
    }>
  }

  export: {
    pngUrl: string | null
    renderedAt: string | null
  }
}

// API request/response types

export interface ConceptRequest {
  brief: string
  referenceAnalysis?: ReferenceAnalysis[]
  targetAudience?: string
  campaignGoal?: string
  brandVoice?: string
  productAnalysis?: ProductAnalysis
  creativeResearch?: CreativeResearch
  skipCache?: boolean
}

export interface ConceptResponse {
  angles: ConceptAngle[]
}

export interface ImagePromptRequest {
  concept: ConceptAngle
  layout: AdProject["format"]["layout"]
  platform: Platform
  width: number
  height: number
  messageZonePosition: string
  contrastMethod?: ContrastMethod
  visualDirection?: CreativeResearch["visualDirection"]
  skipCache?: boolean
}

export interface ImagePromptResponse {
  prompts: Array<{
    id: string
    text: string
    rank?: number
    reason?: string
  }>
}

export interface CopyRequest {
  concept: ConceptAngle
  imageDescription: string
  layout: AdProject["format"]["layout"]
  messageZonePosition: string
  contrastMethod: ContrastMethod
  targetAudience?: string
  campaignGoal?: string
  brandVoice?: string
  copyDirection?: CreativeResearch["copyDirection"]
  productAnalysis?: ProductAnalysis
  skipCache?: boolean
}

export interface CopyResponse {
  variations: CopyVariation[]
}
