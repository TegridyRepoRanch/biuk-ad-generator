# BIUK Ad Generator — Session Handoff (March 21, 2026)

## What This Is

A web app that turns any product URL into finished social media ad images using AI.
Built by Austin (BIUK Creative / Mad Simple Ads).

**Live:** ad-creator-orpin.vercel.app
**Repo:** TegridyRepoRanch/biuk-ad-generator (auto-deploys to Vercel on push to main)
**Vercel project:** biuk-ad-generator

## Current State: FULLY FUNCTIONAL + MINDSTATE PSYCHOLOGY INTEGRATION

The app works end-to-end with a 7-step pipeline, 2x2 batch workflow (2 images × 2 headlines = 4 ads), behavioral psychology targeting via Mindstate framework, free-form text editing, and image storage on Supabase CDN.

### The 7-Step Pipeline

1. Paste product URL → auto-scrape → AI analysis → AI research → **mindstate identification** → cache in Supabase → auto-generate 3 concept angles → user picks one
2. Pick platform + layout template + contrast method
3. AI generates ranked image prompts (with mindstate visual guidance) → user selects one → generates 3 images (stored on Supabase CDN)
4. Multi-select 2 of 3 images for batch (or 1 for single)
5. AI writes headlines (with mindstate copy psychology) → pick 2 for batch
6. Compose: drag text, font picker, product image layer, gradient, custom text elements, 2x2 batch preview
7. Export: render all 4 combos, download individually or as 2x2 grid

## What Changed This Session (March 21, 2026)

### Rebranding
- Renamed everywhere: GitHub repo (biuk-ad-generator), Vercel project, page title, homepage, README, package.json
- README now accurately reflects Gemini-only stack (removed stale Anthropic/Claude references)

### Mindstate Behavioral Psychology Framework (BIG FEATURE)
- Extracted 18 mindstate profiles from Will Leach's 299-page Mindstate Personas PDF
- Saved as structured TypeScript data: `src/lib/mindstate-data.ts` (~400 lines)
- 18 profiles = 2 approaches (Cautious/Optimistic) × 9 motivations (Achievement, Autonomy, Belonging, Competence, Empowerment, Engagement, Esteem, Nurturance, Security)
- Each profile includes: core description, goal to activate, approach framing, cognitive triggers, feelings to evoke/avoid, visual guidance, copy tone, copy guidance, example headlines
- **Research step** (`scrape-product` route) now asks Gemini to identify primary + secondary mindstate match from the 18 profiles based on product analysis
- **Concept generation** receives mindstate triggers, feelings to evoke/avoid — concepts resonate with buyer psychology
- **Image prompt generation** receives mindstate visual guidance — images evoke the right emotional states
- **Copy generation** receives mindstate copy tone, guidance, example headlines — headlines are psychologically targeted
- Frontend shows matched mindstate badge on Step 1, threads mindstate ID to Steps 3 and 5
- All backward compatible — pipeline works identically if no mindstate identified (e.g., pre-existing cached products)

### Free-Form Text Editing on Compose Page
- **Single-click to edit** (was double-click) for headline, subhead, CTA
- **Custom text elements**: "Add text" button creates unlimited new text elements
- Custom texts are fully styled (font, size, weight, color, alignment), deletable, and rendered in exports
- New types: `CustomTextElement` in ad.ts
- New store actions: `ADD_CUSTOM_TEXT`, `UPDATE_CUSTOM_TEXT`, `DELETE_CUSTOM_TEXT`
- Compose page imports `uuid` for generating custom text IDs

### Generated Images → Supabase Storage
- `generate-image` route now uploads to Supabase Storage (`generated/{uuid}.png`)
- Returns CDN public URL instead of multi-MB base64 data URL
- Falls back to data URL if upload fails (graceful degradation, same pattern as remove-background)
- Reduces mobile memory pressure significantly

### Structured Error Logging
- New `src/lib/logger.ts` with JSON-formatted logging (timestamp, level, route, message, metadata)
- All 9 API routes now log: request start, rate limit hits, duration on success, structured errors
- `errorResponse()` in api-error.ts now accepts optional route name for structured error logging
- Compatible with Vercel's log viewer

### Dead Code Cleanup
- `src/lib/anthropic.ts` gutted to no-op export with deprecation comment (couldn't `rm` due to sandbox perms — delete when convenient)

### Test Suite
- Vitest set up with 98 tests across 7 files
- Tests cover: cache (hashKey), parse-json, url-validation (SSRF), supabase (normalizeUrl), rate-limit, preview-scale, snap-guides
- Run with `npm test`

## Architecture

### Single API Key
**CRITICAL: The entire app runs on ONE API key — GEMINI_API_KEY.**

| Call | Model | Purpose |
|---|---|---|
| Product analysis | `gemini-2.5-pro` | Scrape + analyze product page |
| Creative research | `gemini-2.5-pro` | Market positioning, visual/copy direction, **mindstate identification** |
| Concept generation | `gemini-2.5-pro` | 3 concept angles (cached) + mindstate psychology |
| Image prompts | `gemini-2.5-flash` | 3 ranked prompts (cached) + mindstate visual guidance |
| Image generation | `gemini-3-pro-image-preview` | Nano Banana Pro (3 parallel variations → Supabase Storage) |
| Image description | `gemini-2.5-flash` | Describe image for copy context |
| Copy generation | `gemini-2.5-pro` | 3 headline/CTA variations (cached) + mindstate copy psychology |
| Background removal | `gemini-3.1-flash-image-preview` | Nano Banana 2 for product cutouts |
| Reference analysis | `gemini-2.5-flash` | Analyze uploaded reference ads |

### Supabase
Project: `ad-creator` (ID: `fldofdiahgtlkapxxdsw`) in us-east-1.

Tables:
- `products` — scraped product data + AI analysis + `mindstate_match`, keyed by `normalized_url`
- `research` — creative research per product (FK to products) + `mindstate_match`
- `concept_cache` — cached concept angles, keyed by brief+product hash
- `prompt_cache` — cached image prompts, keyed by concept+platform hash
- `copy_cache` — cached copy variations, keyed by concept+image-desc hash
- `product-images` storage bucket — product cutout PNGs + generated images

### Vercel Environment Variables

| Variable | Set? |
|---|---|
| `GEMINI_API_KEY` | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |

## Key Files

### Core Libraries
- `src/lib/gemini.ts` — ALL AI model constants + text/vision helpers
- `src/lib/mindstate-data.ts` — 18 Mindstate behavioral psychology profiles + helpers
- `src/lib/prompts.ts` — ALL system prompts + user prompt builders (concept, image, copy) with mindstate + feedback injection
- `src/lib/cache.ts` — Supabase caching layer (djb2 hash keys)
- `src/lib/parse-json.ts` — balanced-brace JSON parser
- `src/lib/supabase.ts` — untyped Supabase client
- `src/lib/store.tsx` — state management: useReducer + localStorage + IndexedDB, undo/redo, batch actions, custom text actions
- `src/lib/platforms.ts` — platform specs (dimensions, safe zones)
- `src/lib/layout-templates.ts` — layout templates + message zone position helper
- `src/lib/image-store.ts` — IndexedDB wrapper for large image storage
- `src/lib/preview-scale.ts` — canvas preview scaling helper
- `src/lib/logger.ts` — structured JSON logging for API routes
- `src/lib/rate-limit.ts` — in-memory sliding window rate limiter
- `src/lib/api-error.ts` — ApiError class + errorResponse helper with structured logging
- `src/lib/url-validation.ts` — SSRF protection for external URL fetching
- `src/lib/snap-guides.ts` — snap-to-center/edge guide system
- `src/lib/toast.tsx` — toast notification system
- `src/lib/project-history.ts` — recent project snapshots
- `src/lib/anthropic.ts` — DEAD FILE, no-op export, safe to delete

### API Routes (all in `src/app/api/`)
- `scrape-product/route.ts` — scrape URL → extract data → Gemini Pro analysis + research + mindstate → Supabase cache → async cutout
- `concept/route.ts` — Gemini Pro + cache + validation + feedback + mindstate psychology
- `image-prompts/route.ts` — Gemini Flash + cache + validation + feedback + mindstate visual guidance
- `copy/route.ts` — Gemini Pro + cache + validation + feedback + mindstate copy psychology
- `generate-image/route.ts` — Nano Banana Pro → Supabase Storage (CDN URL)
- `describe-image/route.ts` — Gemini Flash vision
- `remove-background/route.ts` — Nano Banana 2 + SSRF protection + Supabase Storage
- `analyze-reference/route.ts` — Gemini Flash vision for reference ads
- `proxy-image/route.ts` — CORS proxy for external images in canvas export

### Step Pages (all in `src/app/create/`)
- `page.tsx` — Step 1: URL input → scrape → product card → research → brief → concepts → mindstate badge → feedback regen
- `format/page.tsx` — Step 2: platform picker, layout templates, contrast method
- `image-prompts/page.tsx` — Step 3: ranked prompts, edit, "Select & Generate", feedback regen, passes mindstateId
- `upload/page.tsx` — Step 4: 3-col image grid, multi-select 2, upload mode, auto-describe
- `copy/page.tsx` — Step 5: headlines, batch mode (pick 2) vs single mode (pick 1), feedback regen, passes mindstateId
- `compose/page.tsx` — Step 6: single-click edit, custom text elements, font picker, product image layer, gradient, 2x2 batch preview
- `export/page.tsx` — Step 7: render all combos including custom texts, 2x2 grid download, individual downloads

### Compose Subcomponents
- `compose/TextStylePanel.tsx` — font family/size/weight/color/alignment controls
- `compose/ProductImageControls.tsx` — product image visibility, scale, rotation, opacity
- `compose/BatchPreviewGrid.tsx` — 2x2 mini-preview grid showing all 4 combos

### State Model (AdProject in `src/types/ad.ts`)
Key properties:
- `brief.creativeResearch.mindstateMatch` — `{ primary: string, secondary?: string, reasoning?: string }`
- `batch.images: Array<{ url, aiDescription? }>` — max 2 selected images
- `batch.copies: CopyVariation[]` — max 2 selected headlines
- `composition.customTexts: CustomTextElement[]` — user-added free-form text elements
- All request types have `feedback?: string` and relevant ones have `mindstateId?: string`

## What's NOT Done Yet

### Feature Requests
1. **Marketing theory for copy prompts** — The Mindstate framework is integrated, but Austin may want to further tune the copy system prompt with additional marketing theory. The infrastructure is there — `src/lib/prompts.ts` COPY_SYSTEM_PROMPT and the mindstate injection in `buildCopyUserPrompt` are the places to modify.
2. **Meta Ad Library integration** — When Austin gets a Meta API key, add competitor ad search to the research step. Schema ready (competitor_brands field exists).

### Technical Debt
1. **`src/lib/anthropic.ts`** — Dead file, safe to delete
2. **djb2 hash collisions** — 32-bit hash, fine at Austin's scale but not collision-resistant
3. **Supabase types** — Client uses `<any>` generics, no generated types
4. **proxy-image route** — Doesn't use `errorResponse()` helper (inconsistent with other routes)
5. **No Sentry** — Structured logging added but no external error monitoring service
6. **No CI** — Tests exist (98 passing) but no GitHub Actions pipeline to run them on push

### Nice-to-Have
1. **Custom domain** — Still on `ad-creator-orpin.vercel.app`
2. **Mindstate data quality** — Some profile fields have truncated text from PDF extraction. The feelings/triggers/headlines are solid but `visualGuidance`, `copyGuidance`, `goalToActivate`, and `approachFraming` fields could be cleaned up with fuller text
3. **Individual custom text positioning** — Custom texts are currently part of the main text TransformBox. Could be independent draggable elements with their own positions.

## How to Push Code

The repo is at **TegridyRepoRanch/biuk-ad-generator**.

From Cowork: use `deploy_github_push_files` tool:
```
repo: TegridyRepoRanch/biuk-ad-generator
directory: [path to ad-creator]
```
This pushes all files and triggers Vercel auto-deploy.

## Austin's Workflow Preferences

- Types fast, sloppy, lots of typos. Interpret intent, not literal words.
- Prefers direct answers, no fluff.
- Wants things to just work — bias toward action over asking questions.
- Has 6 products he makes tons of ads for — caching is critical.
- Runs BIUK Creative agency. The tool is for his own ad production workflow.
- Uses Google Antigravity IDE with Claude Code for parallel development.
- When asking "what does this do" he wants plain English, not engineering jargon.
