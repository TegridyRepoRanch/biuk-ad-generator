# BIUK Ad Generator — Project Instructions

## What This Is

A web app that turns any product URL into a finished social media ad image.
Paste a link, the system scrapes the product page, runs AI analysis +
behavioral psychology profiling, and guides you through a 7-step pipeline
to produce ready-to-upload PNGs with psychologically-targeted copy.

Built by BIUK Creative (Austin's agency / Mad Simple Ads).
Live at ad-creator-orpin.vercel.app.
Repo: TegridyRepoRanch/biuk-ad-generator (auto-deploys to Vercel).

## The Core Insight

Most AI ad tools fail because they write copy before the visual exists, so
text and imagery fight each other. This app enforces the correct order:
product research → behavioral psychology profiling → concept → visual
direction → image generation → THEN copy written to complement the actual
image → composition → export.

## The 7-Step Pipeline

1. **PRODUCT & CONCEPT** — User pastes a product URL. System scrapes the page,
   extracts product data + images, runs Gemini analysis (audience, hooks,
   positioning), runs creative research (visual/copy direction), identifies
   the buyer's Mindstate profile (behavioral psychology), caches everything
   in Supabase. Same URL = instant cache hit. AI generates 3 concept angles
   informed by the matched mindstate. User picks one.
2. **FORMAT** — User selects platform (IG feed, stories, TikTok, FB, etc.).
   Dimensions, safe zones, and layout grid auto-populate. User picks a
   layout template and contrast method.
3. **IMAGE PROMPTS** — AI generates image prompts optimized for Nano Banana Pro
   with explicit negative space for text placement, camera/lighting/mood
   specifics, contrast method awareness, and mindstate visual guidance.
4. **IMAGE GENERATION** — Nano Banana Pro creates images via Gemini API,
   uploads to Supabase Storage (CDN URLs). Manual upload also available.
   Auto-describes the image with Gemini Vision for Step 5.
   User picks 2 for batch (or 1 for single mode).
5. **HEADLINE COPY** — AI writes headlines/CTAs based on the ACTUAL image
   + concept + mindstate copy psychology. Copy complements the visual.
   User picks 2 for batch.
6. **COMPOSE** — Live preview with draggable text (TransformBox). Single-click
   editing on all text. Custom text elements (add/delete/style). Font family
   picker, CTA styling, gradient overlay, product image layer. 2x2 batch
   preview grid. Undo/redo. Safe zone warnings. Snap guides.
7. **EXPORT** — Renders all 4 combos (2 images × 2 headlines) including custom
   texts. Download individually or as 2x2 grid.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack), React 19
- **Styling**: Tailwind CSS v4
- **AI (text)**: Google Gemini API — 2.5 Pro (concept, copy, analysis, research)
  + 2.5 Flash (image prompts, image description, reference analysis)
- **AI (images)**: Google Gemini API — Nano Banana Pro (gemini-3-pro-image-preview)
  + Nano Banana 2 (gemini-3.1-flash-image-preview) for background removal
- **NOTE**: No Anthropic/Claude dependency. Everything runs on GEMINI_API_KEY.
- **Psychology**: Mindstate behavioral framework (Will Leach) — 18 profiles in
  `src/lib/mindstate-data.ts`, integrated into concept/image/copy generation
- **Database**: Supabase (Postgres) for product + research + mindstate caching
- **Image storage**: Supabase Storage (product-images bucket) — cutouts + generated images
- **Client state**: React useReducer + Context, persisted to localStorage +
  IndexedDB (images stored in IDB to avoid localStorage size limits)
- **Export**: HTML Canvas API (raw, no html2canvas dependency)
- **Testing**: Vitest — 98 tests across 7 files (`npm test`)
- **Deployment**: GitHub (TegridyRepoRanch/biuk-ad-generator) → Vercel (auto-deploy)

## File Structure

```
src/
├── app/
│   ├── page.tsx                         # Landing page (BIUK Ad Generator branding)
│   ├── layout.tsx                       # Root layout + Google Fonts
│   ├── globals.css                      # Tailwind + CSS vars + custom styles
│   ├── create/
│   │   ├── layout.tsx                   # ProjectProvider + StepNav + ErrorBoundary + ResumeBanner
│   │   ├── page.tsx                     # Step 1: Product URL + brief + concepts + mindstate badge
│   │   ├── format/page.tsx              # Step 2: Platform + layout + contrast
│   │   ├── image-prompts/page.tsx       # Step 3: AI prompt generation (passes mindstateId)
│   │   ├── upload/page.tsx              # Step 4: Image gen + upload + batch select
│   │   ├── copy/page.tsx                # Step 5: AI headline generation (passes mindstateId)
│   │   ├── compose/                     # Step 6: Compose
│   │   │   ├── page.tsx                 # Main compose (free-form edit, custom texts)
│   │   │   ├── TextStylePanel.tsx       # Font/size/weight/color/alignment controls
│   │   │   ├── ProductImageControls.tsx # Product image visibility/scale/rotation
│   │   │   └── BatchPreviewGrid.tsx     # 2x2 mini-preview grid
│   │   └── export/page.tsx              # Step 7: Canvas render + download
│   └── api/
│       ├── scrape-product/route.ts      # Scrape + analysis + research + mindstate → Supabase
│       ├── concept/route.ts             # Concept angles (cached, + mindstate psychology)
│       ├── image-prompts/route.ts       # Image prompts (cached, + mindstate visual guidance)
│       ├── generate-image/route.ts      # Image gen → Supabase Storage CDN URL
│       ├── describe-image/route.ts      # Gemini Vision: describe image for copy
│       ├── copy/route.ts                # Headlines/CTAs (cached, + mindstate copy psychology)
│       ├── analyze-reference/route.ts   # Gemini Vision: analyze reference ads
│       ├── remove-background/route.ts   # Background removal → Supabase Storage
│       └── proxy-image/route.ts         # CORS proxy for external images
├── components/
│   ├── StepNav.tsx                      # Step navigation with prerequisite gating
│   ├── TransformBox.tsx                 # Canva-style resize/drag handles
│   ├── ErrorBoundary.tsx                # React error boundary
│   ├── ErrorBanner.tsx                  # Dismissible error banner with retry
│   └── LoadingOverlay.tsx               # Loading overlay with elapsed timer
├── hooks/
│   ├── useApiCall.ts                    # API call wrapper with loading/error/elapsed
│   ├── useKeyboardShortcuts.ts          # Enter/Escape/Ctrl+Z/Ctrl+Shift+Z
│   └── useDebouncedDispatch.ts          # Debounced state dispatch for sliders
├── lib/
│   ├── gemini.ts                        # Gemini client + model constants
│   ├── mindstate-data.ts               # 18 Mindstate profiles + helpers (getMindstateById, etc.)
│   ├── prompts.ts                       # ALL AI prompts + builders (with mindstate injection)
│   ├── store.tsx                        # useReducer + localStorage + IDB + undo/redo + custom texts
│   ├── cache.ts                         # Supabase caching layer (djb2 hash keys)
│   ├── supabase.ts                      # Supabase client + URL normalizer
│   ├── parse-json.ts                    # extractJSON() — strips markdown fences
│   ├── platforms.ts                     # 9 platform specs
│   ├── layout-templates.ts              # 6 layout templates
│   ├── image-store.ts                   # IndexedDB helpers
│   ├── preview-scale.ts                 # Preview scale calculator
│   ├── logger.ts                        # Structured JSON logging
│   ├── rate-limit.ts                    # In-memory rate limiter
│   ├── api-error.ts                     # ApiError + errorResponse
│   ├── url-validation.ts               # SSRF protection
│   ├── snap-guides.ts                   # Snap-to-center/edge guides
│   ├── toast.tsx                        # Toast notifications
│   ├── project-history.ts              # Recent project snapshots
│   ├── constants.ts                     # Shared constants
│   └── anthropic.ts                     # DEAD FILE — no-op, safe to delete
├── types/
│   └── ad.ts                            # All types (AdProject, CustomTextElement, etc.)
└── __tests__/                           # 7 test files, 98 tests
    ├── cache.test.ts
    ├── parse-json.test.ts
    ├── url-validation.test.ts
    ├── supabase.test.ts
    ├── rate-limit.test.ts
    ├── preview-scale.test.ts
    └── snap-guides.test.ts
```

## Environment Variables

| Variable | Where | What |
|---|---|---|
| `GEMINI_API_KEY` | Vercel + .env.local | ALL AI calls |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + .env.local | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + .env.local | Supabase service role key (server-side only) |

## Supabase Schema

Project: `ad-creator` (fldofdiahgtlkapxxdsw) in us-east-1

- `products` — URL, normalized_url (unique), name, brand, description, price,
  hero_image_url, product_images (JSONB), cutout_image_url, ai_analysis (JSONB),
  mindstate_match (JSONB), raw_page_content
- `research` — product_id (FK), market_positioning (JSONB), visual_direction (JSONB),
  copy_direction (JSONB), competitor_brands (JSONB), mindstate_match (JSONB)
- `concept_cache`, `prompt_cache`, `copy_cache` — cached AI outputs by hash key
- `product-images` storage bucket (public) — cutouts/ and generated/ folders

## Key Design Decisions

### Copy comes AFTER images (Step 5 after Step 4)
Gemini Vision auto-describes the image, and that feeds into copy generation.
Headlines complement the visual, not the other way around.

### Mindstate psychology is injected, not imposed
The mindstate match is identified during research and threaded into prompts
as additional context. It doesn't replace the existing creative direction —
it layers psychological targeting on top. If no mindstate is identified,
everything works exactly as before.

### Generated images go to Supabase Storage, not data URLs
The generate-image route uploads to Supabase Storage and returns CDN URLs.
This prevents multi-MB base64 strings from bloating client memory (critical
for mobile). Falls back to data URL if upload fails.

### Product URL is the entry point
Scraping + AI analysis replaces manual brief writing. Same product URL =
instant cache hit via normalized_url.

### Image prompts are tailored for Nano Banana Pro
Prompts leverage Nano Banana Pro's Thinking mode with detailed composition
instructions, exact negative space specs, and contrast method awareness.

### State persistence
useReducer → localStorage (minus images). Images → IndexedDB.
Undo/redo history (30 snapshots, debounced for high-frequency actions).

## What Still Needs Work

See HANDOFF.md for the full list. Key items:
- Marketing theory tuning for copy prompts (Austin will provide direction)
- Meta Ad Library integration (needs API key)
- Clean up truncated mindstate profile text fields
- Delete dead anthropic.ts
- Add CI pipeline for tests
- Custom domain setup
