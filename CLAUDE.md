# Ad Creator — Project Instructions

## What This Is

A web app that turns any product URL into a finished social media ad image.
Paste a link, the system scrapes the product page, runs AI analysis, and
guides you through a 7-step pipeline to produce a ready-to-upload PNG.

Built by BIUK Creative (Austin's agency). Lives at ad-creator-orpin.vercel.app.

## The Core Insight

Most AI ad tools fail because they write copy before the visual exists, so
text and imagery fight each other. This app enforces the correct order:
product research → concept → visual direction → image generation → THEN
copy written to complement the actual image → composition → export.

## The 7-Step Pipeline

1. **PRODUCT & CONCEPT** — User pastes a product URL. System scrapes the page,
   extracts product data + images, runs Claude analysis (audience, hooks,
   positioning), runs creative research (visual/copy direction), caches
   everything in Supabase. Same URL = instant cache hit. Brief auto-populates.
   User can also skip the URL and write a manual brief. AI generates 3
   concept angles. User picks one.
2. **FORMAT** — User selects platform (IG feed, stories, TikTok, FB, etc.).
   Dimensions, safe zones, and layout grid auto-populate. User picks a
   layout template and contrast method.
3. **IMAGE PROMPTS** — AI generates image prompts optimized for Nano Banana Pro
   (Gemini 3 Pro Image) with explicit negative space for text placement,
   camera/lighting/mood specifics, and contrast method awareness.
4. **IMAGE GENERATION** — User clicks "Generate" and Nano Banana Pro creates
   the image in-app via Gemini API. Manual upload is also available as
   fallback. Auto-describes the image with Gemini Vision for Step 5.
5. **HEADLINE COPY** — AI writes headlines/CTAs based on the ACTUAL image
   (auto-described by Gemini Vision) + concept + contrast method. Copy
   complements the visual, doesn't repeat it.
6. **COMPOSE** — Live preview with draggable text overlay (mouse + touch).
   Font family picker (8 Google Fonts), size, weight, color, alignment.
   CTA button styling. Gradient overlay. Safe zone violation warnings.
   Undo/redo with keyboard shortcuts.
7. **EXPORT** — Auto-renders to PNG at exact platform dimensions on page load.
   One-click download. Filename includes platform and dimensions.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Styling**: Tailwind CSS v4
- **AI (text)**: Google Gemini API — 2.5 Pro (concept, copy, product analysis,
  research) + 2.5 Flash (image prompts, image description, reference analysis)
- **AI (images)**: Google Gemini API — Nano Banana Pro (gemini-3-pro-image-preview)
- **NOTE**: No Anthropic/Claude dependency. Everything runs on GEMINI_API_KEY.
- **Database**: Supabase (Postgres) for product + research caching
- **Image storage**: Supabase Storage (product-images bucket)
- **Client state**: React useReducer + Context, persisted to localStorage +
  IndexedDB (images stored in IDB to avoid localStorage size limits)
- **Export**: HTML Canvas API (raw, no html2canvas dependency)
- **Deployment**: GitHub (TegridyRepoRanch/ad-creator) → Vercel (auto-deploy)

## File Structure (actual, not aspirational)

```
src/
├── app/
│   ├── page.tsx                         # Landing page
│   ├── layout.tsx                       # Root layout + Google Fonts
│   ├── globals.css                      # Tailwind + CSS vars + custom styles
│   ├── create/
│   │   ├── layout.tsx                   # ProjectProvider + StepNav + ErrorBoundary + ResumeBanner
│   │   ├── page.tsx                     # Step 1: Product URL + brief + concepts
│   │   ├── format/page.tsx              # Step 2: Platform + layout + contrast
│   │   ├── image-prompts/page.tsx       # Step 3: AI prompt generation
│   │   ├── upload/page.tsx              # Step 4: Gemini image gen + upload
│   │   ├── copy/page.tsx                # Step 5: AI headline generation
│   │   ├── compose/page.tsx             # Step 6: Live preview + drag + style
│   │   └── export/page.tsx              # Step 7: Canvas render + download
│   └── api/
│       ├── scrape-product/route.ts      # Scrape URL + Gemini Pro analysis + Supabase cache
│       ├── concept/route.ts             # Gemini Pro: concept angles (cached)
│       ├── image-prompts/route.ts       # Gemini Flash: image prompts (cached)
│       ├── generate-image/route.ts      # Gemini: generate image (Nano Banana Pro)
│       ├── describe-image/route.ts      # Gemini Vision: describe image for copy
│       ├── copy/route.ts                # Gemini Pro: headlines/CTAs (cached)
│       ├── analyze-reference/route.ts   # Gemini Vision: analyze reference ads
│       └── remove-background/route.ts   # Gemini: remove product image background
├── components/
│   ├── StepNav.tsx                      # Step navigation with prerequisite gating
│   ├── ErrorBoundary.tsx                # React error boundary
│   ├── ErrorBanner.tsx                  # Dismissible error banner with retry
│   └── LoadingOverlay.tsx               # Loading overlay with elapsed timer
├── hooks/
│   ├── useApiCall.ts                    # API call wrapper with loading/error/elapsed
│   └── useKeyboardShortcuts.ts          # Enter/Escape/Ctrl+Z/Ctrl+Shift+Z
├── lib/
│   ├── gemini.ts                        # Gemini client + text models (Pro/Flash) + image models (Nano Banana)
│   ├── supabase.ts                      # Supabase client + URL normalizer
│   ├── prompts.ts                       # All AI system prompts + user prompt builders
│   ├── platforms.ts                     # 9 platform specs (dimensions, safe zones, notes)
│   ├── layout-templates.ts              # 6 layout templates + getMessageZonePosition
│   ├── parse-json.ts                    # extractJSON() — strips markdown fences
│   ├── store.tsx                        # useReducer + Context + localStorage + IndexedDB + undo/redo
│   ├── image-store.ts                   # IndexedDB helpers for large image storage
│   └── preview-scale.ts                 # Shared preview scale calculator
├── types/
│   └── ad.ts                            # All TypeScript types + API request/response shapes
└── reference/                           # (inside ad-creator/)
    └── gemini-image-models.md           # Nano Banana model ID reference
```

## Environment Variables

| Variable | Where | What |
|---|---|---|
| `GEMINI_API_KEY` | Vercel + .env.local | ALL AI calls — text (Pro/Flash), images (Nano Banana), bg removal |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + .env.local | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + .env.local | Supabase service role key (server-side only) |

## Supabase Schema

Project: `ad-creator` (fldofdiahgtlkapxxdsw) in us-east-1

- `products` — URL, normalized_url (unique), name, brand, description, price,
  hero_image_url, product_images (JSONB), cutout_image_url, ai_analysis (JSONB),
  raw_page_content
- `research` — product_id (FK), market_positioning (JSONB), visual_direction (JSONB),
  copy_direction (JSONB), competitor_brands (JSONB)
- `product-images` storage bucket (public)

## Key Design Decisions

### Copy comes AFTER images (Step 5 after Step 4)
The most important architectural decision. Gemini Vision auto-describes
the uploaded/generated image, and that description feeds into copy generation.
Headlines complement the visual, not the other way around.

### Product URL is the entry point, not a manual brief
Scraping + AI analysis replaces manual brief writing. The system extracts
product name, price, brand, images, and then Gemini generates audience
insights, emotional hooks, and a suggested brief. Manual brief is fallback.

### Supabase caches everything by normalized URL
Same product URL = instant cache hit. No re-scraping, no re-analyzing.
The normalized_url strips protocol, www, trailing slashes to prevent dupes.

### Image prompts are tailored for Nano Banana Pro
The prompts are NOT generic "Midjourney/DALL-E" prompts. They leverage
Nano Banana Pro's Thinking mode with detailed composition instructions,
exact negative space specifications, camera/lighting specifics, and
contrast method awareness.

### Nano Banana model identifiers
"Nano Banana" is Google's marketing name. The actual API strings:
- Nano Banana Pro: `gemini-3-pro-image-preview` (default, best quality)
- Nano Banana 2: `gemini-3.1-flash-image-preview` (fast, nearly as good)
- Nano Banana: `gemini-2.5-flash-image` (fastest, cheapest)
See `reference/gemini-image-models.md` and `src/lib/gemini.ts`.

### State persistence
useReducer state → localStorage (minus images). Images → IndexedDB via
`src/lib/image-store.ts`. Hydration on mount with loading spinner.
Undo/redo history (30 snapshots, debounced for high-frequency actions).

## What's Done

- Background removal uses Gemini (Nano Banana Pro) — no extra API key.
  Endpoint: `/api/remove-background`. Triggered on-demand from compose step.
  Cutout stored in Supabase Storage, URL saved to `products.cutout_image_url`.
- Product image layer in compose: draggable, scalable, toggle cutout/original.
- Loading spinners with elapsed time on all AI calls.
- Error banners with retry guidance.
- Font family picker (8 Google Fonts) in compose.
- Touch drag works (pointer-agnostic: mouse + touch).
- Keyboard shortcuts (Enter/Escape/Ctrl+Z/Ctrl+Shift+Z).
- Undo/redo (30-snapshot history, debounced for drag/sliders).
- Safe zone violation warnings in compose.
- Step prerequisite gating in StepNav with tooltips.
- State persistence: localStorage + IndexedDB for images.
- Auto image description via Gemini Vision for copy generation.
- Research pipeline threads through concept → image prompts → copy.

## What Still Needs Work

### Rate limiting on API routes
No rate limiting yet. A bad actor could exhaust API quotas. Consider
Upstash Redis or Vercel KV for per-IP limiting.

### Error monitoring
No Sentry or equivalent. Errors log to console only. Add structured
error reporting for production debugging.

### Meta Ad Library integration
When Austin gets a Meta API key, add competitor ad search to the
research step. Schema is ready (competitor_brands field exists).
