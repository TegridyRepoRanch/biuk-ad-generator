"use client"

import { createContext, useContext, useReducer, useEffect, useState, useRef, ReactNode, Dispatch, useCallback } from "react"
import { v4 as uuid } from "uuid"
import { AdProject, ConceptAngle, CopyVariation, Platform, Rect, ContrastMethod, CTAStyle, GradientConfig, ProductAnalysis, CreativeResearch, ProductImageLayer } from "@/types/ad"

// Batch image keys for IndexedDB
function batchImgKey(index: number) {
  return `img-batch-${index}`
}
import { platformSpecs } from "@/lib/platforms"
import { saveImage, loadImage, clearImages } from "@/lib/image-store"

// ─── Storage keys ──────────────────────────────────────────────────
const STORAGE_KEY = "ad-creator-project"
const IMG_KEY_UPLOADED = "img-uploaded"
const IMG_KEY_EXPORT = "img-export"

// Reference image keys — stored per-index
function refImgKey(index: number) {
  return `img-ref-${index}`
}

// ─── Default project ───────────────────────────────────────────────
const defaultPlatform: Platform = "ig-feed-square"
const spec = platformSpecs[defaultPlatform]

function createDefaultProject(): AdProject {
  return {
    id: uuid(),
    name: "Untitled Ad",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: 1,

    brief: {
      description: "",
      referenceImages: [],
      referenceAnalysis: [],
    },
    concept: {
      angles: [],
      selectedAngleId: null,
    },

    format: {
      platform: defaultPlatform,
      width: spec.width,
      height: spec.height,
      safeZones: spec.safeZones,
      layout: {
        anchorZone: { x: 0, y: spec.height * 0.33, width: spec.width, height: spec.height * 0.67 },
        messageZone: { x: 60, y: 60, width: spec.width - 120, height: spec.height * 0.28 },
        supportZone: null,
      },
      contrastMethod: "gradient-overlay",
    },

    imagePrompts: {
      prompts: [],
      selectedPromptId: null,
    },

    uploadedImage: {
      url: null,
    },

    copy: {
      variations: [],
      selected: null,
    },

    composition: {
      textPosition: { x: 60, y: 60 },
      headlineFontSize: 64,
      headlineFontFamily: "Inter, sans-serif",
      headlineFontWeight: 800,
      headlineColor: "#FFFFFF",
      headlineAlign: "left",
      ctaStyle: {
        backgroundColor: "#FFFFFF",
        textColor: "#000000",
        borderRadius: 8,
        padding: { x: 24, y: 12 },
        fontSize: 24,
      },
      supportElements: [],
    },

    batch: {
      images: [],
      copies: [],
    },

    export: {
      pngUrl: null,
      renderedAt: null,
    },
  }
}

// ─── Persistence helpers ───────────────────────────────────────────

/**
 * Serialize state to localStorage, stripping large image data URLs.
 * Images are stored separately in IndexedDB.
 */
function saveToLocalStorage(state: AdProject) {
  try {
    const toStore = {
      ...state,
      // Replace image URLs with marker strings so we know to load from IndexedDB
      uploadedImage: {
        ...state.uploadedImage,
        url: state.uploadedImage.url ? "__IDB__" : null,
      },
      brief: {
        ...state.brief,
        // Replace blob/data URLs with markers per index
        referenceImages: state.brief.referenceImages.map((url) =>
          url ? "__IDB_REF__" : ""
        ),
      },
      batch: {
        ...state.batch,
        // Replace batch image URLs with markers
        images: state.batch.images.map((img) => ({
          ...img,
          url: img.url ? "__IDB_BATCH__" : "",
        })),
      },
      export: {
        ...state.export,
        pngUrl: state.export.pngUrl ? "__IDB__" : null,
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  } catch {
    // localStorage might be full or unavailable — non-critical
    console.warn("Failed to save project state to localStorage")
  }
}

function loadFromLocalStorage(): AdProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Merge defaults for fields added after initial release (migration)
    if (!parsed.batch) {
      parsed.batch = { images: [], copies: [] }
    }
    return parsed as AdProject
  } catch {
    return null
  }
}

// ─── Actions ───────────────────────────────────────────────────────

type Action =
  | { type: "SET_BRIEF"; payload: Partial<AdProject["brief"]> }
  | { type: "SET_PRODUCT_DATA"; payload: { productAnalysis?: ProductAnalysis; creativeResearch?: CreativeResearch } }
  | { type: "SET_CONCEPT_ANGLES"; payload: ConceptAngle[] }
  | { type: "SELECT_CONCEPT"; payload: string }
  | { type: "SET_PLATFORM"; payload: Platform }
  | { type: "SET_LAYOUT"; payload: Partial<AdProject["format"]["layout"]> }
  | { type: "SET_CONTRAST_METHOD"; payload: ContrastMethod }
  | { type: "SET_IMAGE_PROMPTS"; payload: Array<{ id: string; text: string; isEdited: boolean }> }
  | { type: "SELECT_IMAGE_PROMPT"; payload: string }
  | { type: "EDIT_IMAGE_PROMPT"; payload: { id: string; text: string } }
  | { type: "SET_UPLOADED_IMAGE"; payload: { url: string; aiDescription?: string } }
  | { type: "SET_COPY_VARIATIONS"; payload: CopyVariation[] }
  | { type: "SELECT_COPY"; payload: { headline: string; subhead?: string; cta: string } }
  | { type: "UPDATE_COMPOSITION"; payload: Partial<AdProject["composition"]> }
  | { type: "SET_TEXT_POSITION"; payload: { x: number; y: number } }
  | { type: "SET_CTA_STYLE"; payload: Partial<CTAStyle> }
  | { type: "SET_OVERLAY_GRADIENT"; payload: GradientConfig | undefined }
  | { type: "SET_PRODUCT_IMAGE"; payload: ProductImageLayer | undefined }
  | { type: "UPDATE_PRODUCT_IMAGE"; payload: Partial<ProductImageLayer> }
  | { type: "TOGGLE_BATCH_IMAGE"; payload: { url: string; aiDescription?: string } }
  | { type: "CLEAR_BATCH_IMAGES" }
  | { type: "TOGGLE_BATCH_COPY"; payload: CopyVariation }
  | { type: "CLEAR_BATCH_COPIES" }
  | { type: "SET_EXPORT_URL"; payload: string }
  | { type: "SET_STEP"; payload: 1 | 2 | 3 | 4 | 5 | 6 | 7 }
  | { type: "RESET" }
  | { type: "UNDO"; payload: AdProject }
  | { type: "REDO"; payload: AdProject }
  | { type: "_HYDRATE_IMAGES"; payload: { uploadedUrl?: string | null; exportUrl?: string | null; referenceImages?: string[]; batchImageUrls?: (string | null)[] } }

function reducer(state: AdProject, action: Action): AdProject {
  const updated = { ...state, updatedAt: new Date().toISOString() }

  switch (action.type) {
    case "SET_BRIEF":
      return { ...updated, brief: { ...updated.brief, ...action.payload } }

    case "SET_PRODUCT_DATA":
      return {
        ...updated,
        brief: {
          ...updated.brief,
          productAnalysis: action.payload.productAnalysis ?? updated.brief.productAnalysis,
          creativeResearch: action.payload.creativeResearch ?? updated.brief.creativeResearch,
        },
      }

    case "SET_CONCEPT_ANGLES":
      return { ...updated, concept: { ...updated.concept, angles: action.payload } }

    case "SELECT_CONCEPT":
      return { ...updated, concept: { ...updated.concept, selectedAngleId: action.payload } }

    case "SET_PLATFORM": {
      const spec = platformSpecs[action.payload]
      return {
        ...updated,
        format: {
          ...updated.format,
          platform: action.payload,
          width: spec.width,
          height: spec.height,
          safeZones: spec.safeZones,
          layout: {
            anchorZone: { x: 0, y: spec.height * 0.33, width: spec.width, height: spec.height * 0.67 },
            messageZone: { x: spec.safeZones.left, y: spec.safeZones.top, width: spec.width - spec.safeZones.left - spec.safeZones.right, height: spec.height * 0.28 },
            supportZone: null,
          },
        },
      }
    }

    case "SET_LAYOUT":
      return {
        ...updated,
        format: {
          ...updated.format,
          layout: { ...updated.format.layout, ...action.payload },
        },
      }

    case "SET_CONTRAST_METHOD":
      return {
        ...updated,
        format: { ...updated.format, contrastMethod: action.payload },
      }

    case "SET_IMAGE_PROMPTS":
      return {
        ...updated,
        imagePrompts: { ...updated.imagePrompts, prompts: action.payload },
      }

    case "SELECT_IMAGE_PROMPT":
      return {
        ...updated,
        imagePrompts: { ...updated.imagePrompts, selectedPromptId: action.payload },
      }

    case "EDIT_IMAGE_PROMPT":
      return {
        ...updated,
        imagePrompts: {
          ...updated.imagePrompts,
          prompts: updated.imagePrompts.prompts.map((p) =>
            p.id === action.payload.id
              ? { ...p, text: action.payload.text, isEdited: true }
              : p
          ),
        },
      }

    case "SET_UPLOADED_IMAGE":
      return { ...updated, uploadedImage: { ...updated.uploadedImage, ...action.payload } }

    case "SET_COPY_VARIATIONS":
      return { ...updated, copy: { ...updated.copy, variations: action.payload } }

    case "SELECT_COPY":
      return { ...updated, copy: { ...updated.copy, selected: action.payload } }

    case "UPDATE_COMPOSITION":
      return {
        ...updated,
        composition: { ...updated.composition, ...action.payload },
      }

    case "SET_TEXT_POSITION":
      return {
        ...updated,
        composition: { ...updated.composition, textPosition: action.payload },
      }

    case "SET_CTA_STYLE":
      return {
        ...updated,
        composition: {
          ...updated.composition,
          ctaStyle: { ...updated.composition.ctaStyle, ...action.payload },
        },
      }

    case "SET_OVERLAY_GRADIENT":
      return {
        ...updated,
        composition: { ...updated.composition, overlayGradient: action.payload },
      }

    case "SET_PRODUCT_IMAGE":
      return {
        ...updated,
        composition: { ...updated.composition, productImage: action.payload },
      }

    case "UPDATE_PRODUCT_IMAGE": {
      if (!updated.composition.productImage) return updated
      return {
        ...updated,
        composition: {
          ...updated.composition,
          productImage: { ...updated.composition.productImage, ...action.payload },
        },
      }
    }

    case "TOGGLE_BATCH_IMAGE": {
      const existing = updated.batch.images
      const idx = existing.findIndex((i) => i.url === action.payload.url)
      let nextImages: typeof existing
      if (idx >= 0) {
        // Remove it
        nextImages = existing.filter((_, i) => i !== idx)
      } else if (existing.length >= 2) {
        // Replace oldest
        nextImages = [existing[1], action.payload]
      } else {
        nextImages = [...existing, action.payload]
      }
      // Also set uploadedImage to the first batch image for compose compat
      const primary = nextImages[0]
      return {
        ...updated,
        batch: { ...updated.batch, images: nextImages },
        uploadedImage: primary
          ? { url: primary.url, aiDescription: primary.aiDescription }
          : { url: null },
      }
    }

    case "CLEAR_BATCH_IMAGES":
      return {
        ...updated,
        batch: { ...updated.batch, images: [] },
      }

    case "TOGGLE_BATCH_COPY": {
      const existing = updated.batch.copies
      const idx = existing.findIndex((c) => c.id === action.payload.id)
      let nextCopies: typeof existing
      if (idx >= 0) {
        nextCopies = existing.filter((_, i) => i !== idx)
      } else if (existing.length >= 2) {
        nextCopies = [existing[1], action.payload]
      } else {
        nextCopies = [...existing, action.payload]
      }
      // Also set copy.selected to the first batch copy for compose compat
      const primaryCopy = nextCopies[0]
      return {
        ...updated,
        batch: { ...updated.batch, copies: nextCopies },
        copy: {
          ...updated.copy,
          selected: primaryCopy
            ? { headline: primaryCopy.headline, subhead: primaryCopy.subhead, cta: primaryCopy.cta }
            : null,
        },
      }
    }

    case "CLEAR_BATCH_COPIES":
      return {
        ...updated,
        batch: { ...updated.batch, copies: [] },
      }

    case "SET_EXPORT_URL":
      return {
        ...updated,
        export: { pngUrl: action.payload, renderedAt: new Date().toISOString() },
      }

    case "SET_STEP":
      return { ...updated, currentStep: action.payload }

    case "RESET":
      return createDefaultProject()

    case "UNDO":
    case "REDO":
      return action.payload

    case "_HYDRATE_IMAGES": {
      // Hydrate batch images from IndexedDB
      let hydratedBatch = state.batch
      if (action.payload.batchImageUrls && action.payload.batchImageUrls.length > 0) {
        hydratedBatch = {
          ...state.batch,
          images: state.batch.images.map((img, i) => ({
            ...img,
            url: action.payload.batchImageUrls![i] ?? img.url,
          })),
        }
      }
      return {
        ...state, // don't update updatedAt for hydration
        uploadedImage: {
          ...state.uploadedImage,
          url: action.payload.uploadedUrl ?? state.uploadedImage.url,
        },
        brief: {
          ...state.brief,
          referenceImages: action.payload.referenceImages ?? state.brief.referenceImages,
        },
        batch: hydratedBatch,
        export: {
          ...state.export,
          pngUrl: action.payload.exportUrl ?? state.export.pngUrl,
        },
      }
    }

    default:
      return state
  }
}

// ─── Context ───────────────────────────────────────────────────────

const ProjectContext = createContext<AdProject | null>(null)
const DispatchContext = createContext<Dispatch<Action> | null>(null)
const HydratedContext = createContext<boolean>(false)
const UndoContext = createContext<{ canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }>({
  canUndo: false, canRedo: false, undo: () => {}, redo: () => {},
})

// Actions that fire very frequently during drag/slider — debounce for history
const HIGH_FREQ_ACTIONS = new Set(["SET_TEXT_POSITION", "UPDATE_COMPOSITION", "SET_CTA_STYLE", "SET_OVERLAY_GRADIENT", "UPDATE_PRODUCT_IMAGE"])
const HISTORY_LIMIT = 30

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, null, () => {
    // Try to hydrate from localStorage on initial render (SSR-safe: runs client-side in useReducer init)
    if (typeof window === "undefined") return createDefaultProject()
    return loadFromLocalStorage() ?? createDefaultProject()
  })

  const [hydrated, setHydrated] = useState(false)

  // ── Undo/redo history ────────────────────────────────────────
  const undoStack = useRef<AdProject[]>([])
  const redoStack = useRef<AdProject[]>([])
  const lastPushTime = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  // Wrapped dispatch that persists state + images + tracks history
  const dispatch: Dispatch<Action> = useCallback((action: Action) => {
    // Skip history for internal/hydration/undo/redo actions
    const skip = action.type === "_HYDRATE_IMAGES" || action.type === "UNDO" || action.type === "REDO" || action.type === "RESET"
    if (!skip) {
      const now = Date.now()
      // For high-frequency actions, only push a snapshot every 500ms
      if (HIGH_FREQ_ACTIONS.has(action.type)) {
        if (now - lastPushTime.current > 500) {
          undoStack.current.push(stateRef.current)
          if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
          redoStack.current = []
          lastPushTime.current = now
        }
      } else {
        undoStack.current.push(stateRef.current)
        if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
        redoStack.current = []
        lastPushTime.current = now
      }
    }

    rawDispatch(action)

    // Side effects for image storage (fire-and-forget)
    if (action.type === "SET_UPLOADED_IMAGE" && action.payload.url) {
      saveImage(IMG_KEY_UPLOADED, action.payload.url).catch(console.warn)
    }
    if (action.type === "TOGGLE_BATCH_IMAGE" && action.payload.url) {
      // Save batch images to IndexedDB
      const newState = reducer(stateRef.current, action)
      newState.batch.images.forEach((img, i) => {
        if (img.url) saveImage(batchImgKey(i), img.url).catch(console.warn)
      })
    }
    if (action.type === "SET_EXPORT_URL") {
      saveImage(IMG_KEY_EXPORT, action.payload).catch(console.warn)
    }
    if (action.type === "RESET") {
      clearImages().catch(console.warn)
      localStorage.removeItem(STORAGE_KEY)
    }
    if (action.type === "SET_BRIEF" && action.payload.referenceImages) {
      // Save each new reference image to IndexedDB
      action.payload.referenceImages.forEach((url, i) => {
        if (url && !url.startsWith("__IDB")) {
          saveImage(refImgKey(i), url).catch(console.warn)
        }
      })
    }
  }, [])

  // Persist to localStorage on every state change (excluding images)
  useEffect(() => {
    saveToLocalStorage(state)
  }, [state])

  // Hydrate images from IndexedDB on mount
  useEffect(() => {
    async function hydrateImages() {
      try {
        const [uploadedUrl, exportUrl] = await Promise.all([
          loadImage(IMG_KEY_UPLOADED),
          loadImage(IMG_KEY_EXPORT),
        ])

        // Load any reference images
        const refImages: string[] = []
        for (let i = 0; i < state.brief.referenceImages.length; i++) {
          const img = await loadImage(refImgKey(i))
          refImages.push(img ?? "")
        }

        // Load batch images
        const batchImageUrls: (string | null)[] = []
        for (let i = 0; i < state.batch.images.length; i++) {
          const img = await loadImage(batchImgKey(i))
          batchImageUrls.push(img ?? null)
        }

        rawDispatch({
          type: "_HYDRATE_IMAGES",
          payload: {
            uploadedUrl: uploadedUrl ?? undefined,
            exportUrl: exportUrl ?? undefined,
            referenceImages: refImages.length > 0 ? refImages : undefined,
            batchImageUrls: batchImageUrls.length > 0 ? batchImageUrls : undefined,
          },
        })
      } catch {
        console.warn("Failed to hydrate images from IndexedDB")
      } finally {
        setHydrated(true)
      }
    }

    hydrateImages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (prev) {
      redoStack.current.push(stateRef.current)
      rawDispatch({ type: "UNDO", payload: prev })
    }
  }, [])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (next) {
      undoStack.current.push(stateRef.current)
      rawDispatch({ type: "REDO", payload: next })
    }
  }, [])

  return (
    <ProjectContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        <HydratedContext.Provider value={hydrated}>
          <UndoContext.Provider value={{
            canUndo: undoStack.current.length > 0,
            canRedo: redoStack.current.length > 0,
            undo,
            redo,
          }}>
            {children}
          </UndoContext.Provider>
        </HydratedContext.Provider>
      </DispatchContext.Provider>
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error("useProject must be used within ProjectProvider")
  return ctx
}

export function useDispatch() {
  const ctx = useContext(DispatchContext)
  if (!ctx) throw new Error("useDispatch must be used within ProjectProvider")
  return ctx
}

export function useHydrated() {
  return useContext(HydratedContext)
}

export function useUndo() {
  return useContext(UndoContext)
}
