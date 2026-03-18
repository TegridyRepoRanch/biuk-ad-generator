# Ad Creator — Session Handoff (March 18, 2026, End of Day)

## What This Is

A web app that turns any product URL into finished social media ad images.
Built by Austin (BIUK Creative). Lives at **ad-creator-orpin.vercel.app**.
Repo: **TegridyRepoRanch/ad-creator** (auto-deploys to Vercel on push to main).

## Current State: FUNCTIONAL, 2x2 BATCH FLOW IMPLEMENTED

The app works end-to-end. The pipeline now supports a full 2x2 batch workflow
(2 images × 2 headlines = 4 ads). An audit was completed and most quick-win
fixes have been applied. Austin is actively testing.

### The 7-Step Pipeline

1. Paste product URL → auto-scrape → AI analysis → AI research → cache in Supabase
2. Auto-generate 3 concept angles → user picks one
3. Pick platform + layout template + contrast method
4. Auto-generate ranked image prompts → user selects one → auto-generates 3 images → **pick 2 for batch**
5. Auto-describe image → auto-generate 3 headlines → **pick 2 for batch**
6. Compose one ad (drag text, font, overlay, product image) → edits mirror to all 4 combos (2x2 preview grid)
7. Auto-render all 4 PNGs → download individually or as 2x2 grid

### What Changed This Session (Post-Compaction)

**2x2 Batch Builder:**
- Step 4: multi-select 2 of 3 generated images (numbered badges, 3-col grid)
- Step 5: multi-select 2 of 3 headlines
- Compose: 2x2 mini-preview grid below main editor showing all 4 combos
- Export: renders all 4 combos, "Download 2x2 Grid" stitches into single image
- New state: `batch.images[]` (max 2) and `batch.copies[]` (max 2) in store
- IndexedDB persistence for batch images, localStorage strips data URLs with `__IDB_BATCH__` markers

**Guided Regeneration:**
- "Not quite right?" button on Regenerate for concepts (Step 1), image prompts (Step 3), and copy (Step 5)
- Optional text field where user describes what didn't work
- Feedback injected into AI prompt as anti-direction, auto-bypasses cache
- Works across all 3 generation routes

**Audit Fixes Applied (by Antigravity Claude Code):**
- #3: `confirm()` dialog before "Start Fresh" / RESET
- #4: Upload mode toggle uses accent color (was white)
- #5: Removed `console.log` from scrape route
- #6: Removed unused `useSearchParams` import from copy page
- #7: Memoized `combos` array in export page
- #8: Safe zone border visibility increased (`/20` → `/40` + `bg-red-500/5`)
- #9: Default-select first layout template in Step 2
- #11: Input validation on concept, image-prompt, and copy API routes
- #12: Fixed single-image mode — copy page now detects batch vs single mode, allows 1 headline in single mode

**Bug Fixes:**
- `batch` property missing from old localStorage → added migration in `loadFromLocalStorage()`
- StepNav showing false checkmarks → now requires both `currentStep > step` AND `isStepReady()`

## Architecture (Single API Key)

**CRITICAL: The entire app runs on ONE API key — GEMINI_API_KEY.**
No Anthropic/Claude dependency. `@anthropic-ai/sdk` was removed.

| Call | Model | Purpose |
|---|---|---|
| Product analysis | `gemini-2.5-pro` | Scrape + analyze product page |
| Creative research | `gemini-2.5-pro` | Market positioning, visual/copy direction |
| Concept generation | `gemini-2.5-pro` | 3 concept angles (cached) |
| Image prompts | `gemini-2.5-flash` | 3 ranked prompts (cached) |
| Image generation | `gemini-3-pro-image-preview` | Nano Banana Pro (3 parallel variations) |
| Image description | `gemini-2.5-flash` | Describe image for copy context |
| Copy generation | `gemini-2.5-pro` | 3 headline/CTA variations (cached) |
| Background removal | `gemini-3.1-flash-image-preview` | Nano Banana 2 for product cutouts |
| Reference analysis | `gemini-2.5-flash` | Analyze uploaded reference ads |

Model constants in `src/lib/gemini.ts`. Helpers:
- `generateText(model, systemPrompt, userPrompt)` — all text generation
- `describeImageWithVision(model, base64, mediaType, systemPrompt, userPrompt)` — vision

All 3 generation routes accept `feedback?: string` and `skipCache?: boolean`.
When feedback is present, cache is always bypassed.

## Supabase

Project: `ad-creator` (ID: `fldofdiahgtlkapxxdsw`) in us-east-1.

Tables:
- `products` — scraped product data + AI analysis, keyed by `normalized_url`
- `research` — creative research per product (FK to products)
- `concept_cache` — cached concept angles, keyed by brief+product hash
- `prompt_cache` — cached image prompts, keyed by concept+platform hash
- `copy_cache` — cached copy variations, keyed by concept+image-desc hash
- `product-images` storage bucket — product cutout PNGs

Cache helper: `src/lib/cache.ts` with `hashKey()` (djb2), `getCached*()`, `setCached*()`.

## Vercel Environment Variables

| Variable | Set? |
|---|---|
| `GEMINI_API_KEY` | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `ANTHROPIC_API_KEY` | ✅ (legacy, unused — can remove) |

## Key Files

### Core Libraries
- `src/lib/gemini.ts` — ALL AI model constants + text/vision helpers
- `src/lib/cache.ts` — Supabase caching layer (djb2 hash keys)
- `src/lib/parse-json.ts` — balanced-brace JSON parser
- `src/lib/supabase.ts` — untyped client (`<any>` generics)
- `src/lib/store.tsx` — state management: useReducer + localStorage + IndexedDB, undo/redo, batch actions
- `src/lib/prompts.ts` — ALL system prompts and user prompt builders (concept, image, copy) with feedback injection
- `src/lib/platforms.ts` — platform specs (dimensions, safe zones)
- `src/lib/layout-templates.ts` — layout templates + message zone position helper
- `src/lib/image-store.ts` — IndexedDB wrapper for large image storage
- `src/lib/preview-scale.ts` — canvas preview scaling helper

### API Routes (all in `src/app/api/`)
- `scrape-product/route.ts` — scrape URL → extract data → Gemini Pro analysis + research → Supabase cache → async cutout
- `concept/route.ts` — Gemini Pro + cache + input validation + feedback
- `image-prompts/route.ts` — Gemini Flash + cache + validation + feedback + ranked output
- `copy/route.ts` — Gemini Pro + cache + validation + feedback + contrastMethod
- `generate-image/route.ts` — Nano Banana Pro image generation
- `describe-image/route.ts` — Gemini Flash vision
- `remove-background/route.ts` — Nano Banana 2 + SSRF protection + Supabase Storage
- `analyze-reference/route.ts` — Gemini Flash vision for reference ads

### Step Pages (all in `src/app/create/`)
- `page.tsx` — Step 1: URL input → scrape → product card → research → brief → concepts → feedback regen
- `format/page.tsx` — Step 2: platform picker, layout templates, contrast method
- `image-prompts/page.tsx` — Step 3: ranked prompts, edit, "Select & Generate", feedback regen
- `upload/page.tsx` — Step 4: 3-col image grid, multi-select 2, upload mode, auto-describe
- `copy/page.tsx` — Step 5: headlines, batch mode (pick 2) vs single mode (pick 1), feedback regen
- `compose/page.tsx` — Step 6: drag text, font picker, product image layer, gradient, 2x2 batch preview
- `export/page.tsx` — Step 7: render all combos, 2x2 grid download, individual downloads

### State Model (AdProject in `src/types/ad.ts`)
Key additions this session:
- `batch.images: Array<{ url, aiDescription? }>` — max 2 selected images
- `batch.copies: CopyVariation[]` — max 2 selected headlines
- `brief.productId?: string` — Supabase products row ID
- All request types have `feedback?: string`

### Store Actions Added
- `TOGGLE_BATCH_IMAGE` — toggle image in/out of batch (max 2), auto-sets `uploadedImage` to first
- `TOGGLE_BATCH_COPY` — toggle headline in/out of batch (max 2), auto-sets `copy.selected` to first
- `CLEAR_BATCH_IMAGES` / `CLEAR_BATCH_COPIES` — reset batch on regenerate

## What's NOT Done Yet (from audit)

### Remaining Audit Items (ranked by importance)
1. **#2 SSRF on scrape route** — scrape-product fetches any URL with no IP blocking (remove-background has it, scraper doesn't)
2. **#13 Gemini API timeouts** — no AbortSignal, hangs = 60s wait
3. **#10 Batch image rehydration test** — code exists but may have edge cases on refresh
4. **#14 Rate limiting** — no rate limiting on any route
5. **#15 Export CORS error feedback** — external images fail silently on canvas
6. **#16 Double reducer call** — TOGGLE_BATCH_IMAGE dispatch calls reducer() manually for IndexedDB save
7. **#17 djb2 hash collisions** — 32-bit, fine at Austin's scale
8. **#18 Compose decomposition** — 911 LOC, works but messy
9. **#19 Images to Supabase Storage** — data URLs in memory, mobile risk
10. **#20 Sentry** — no error monitoring
11. **#21 Tests** — zero test coverage
12. **#22 Image proxy for CORS** — external CDN images may fail in canvas export

### Feature Requests Not Yet Built
1. **Compose free-form text editor** — Austin wants to delete subhead, remove CTA, type freely (currently locked structure)
2. **Headline copy marketing theory** — Austin has marketing theory to paste, integrate into COPY_SYSTEM_PROMPT

## Austin's Workflow Preferences

- Types fast, sloppy, lots of typos. Interpret intent, not literal words.
- Prefers direct answers, no fluff.
- Wants things to just work — bias toward action over asking questions.
- Has 6 products he makes tons of ads for — caching is critical.
- Runs BIUK Creative agency. The tool is for his own ad production workflow.
- Uses Google Antigravity IDE with Claude Code for parallel development. Give Antigravity agents self-contained prompts.
- When asking "what does this do" he wants plain English, not engineering jargon.

## How to Push Code

The local repo at `/ad-creator` is NOT connected to a git remote.
Use the Cowork `deploy_github_push_files` tool to push:
```
repo: TegridyRepoRanch/ad-creator
directory: [path to ad-creator]
```
This pushes all files and triggers Vercel auto-deploy.
Antigravity Claude Code cannot push — only Cowork can.
