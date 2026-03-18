"use client"

import { createContext, useContext, useReducer, ReactNode, Dispatch } from "react"
import { v4 as uuid } from "uuid"
import { AdProject, ConceptAngle, CopyVariation, Platform, Rect, ContrastMethod, CTAStyle, GradientConfig } from "@/types/ad"
import { platformSpecs } from "@/lib/platforms"

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

    export: {
      pngUrl: null,
      renderedAt: null,
    },
  }
}

type Action =
  | { type: "SET_BRIEF"; payload: Partial<AdProject["brief"]> }
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
  | { type: "SET_EXPORT_URL"; payload: string }
  | { type: "SET_STEP"; payload: 1 | 2 | 3 | 4 | 5 | 6 | 7 }
  | { type: "RESET" }

function reducer(state: AdProject, action: Action): AdProject {
  const updated = { ...state, updatedAt: new Date().toISOString() }

  switch (action.type) {
    case "SET_BRIEF":
      return { ...updated, brief: { ...updated.brief, ...action.payload } }

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
      return { ...updated, uploadedImage: action.payload }

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

    case "SET_EXPORT_URL":
      return {
        ...updated,
        export: { pngUrl: action.payload, renderedAt: new Date().toISOString() },
      }

    case "SET_STEP":
      return { ...updated, currentStep: action.payload }

    case "RESET":
      return createDefaultProject()

    default:
      return state
  }
}

const ProjectContext = createContext<AdProject | null>(null)
const DispatchContext = createContext<Dispatch<Action> | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, createDefaultProject)

  return (
    <ProjectContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
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
