# Ad Creator — Session Handoff (March 18, 2026)

## What This Is

A web app that turns any product URL into finished social media ad images.
Built by Austin (BIUK Creative). Lives at **ad-creator-orpin.vercel.app**.
Repo: **TegridyRepoRanch/ad-creator** (auto-deploys to Vercel on push to main).

## Current State: FUNCTIONAL, ACTIVELY TESTING

The app works end-to-end. Austin is testing the full pipeline and giving
feedback on UX. The core flow is:

1. Paste product URL → auto-scrape → AI analysis → AI research → cache in Supabase
2. Auto-generate 3 concept angles → user picks one
3. Pick platform + layout template + contrast method
4. Auto-generate ranked image prompts → user selects one → auto-generates 3 images
5. User picks an image → auto-describe → auto-generate headlines
6. User picks headline → compose with drag, font picker, product image layer
7. Auto-render PNG → download

## Architecture (Single API Key)

**CRITICAL: The entire app runs on ONE API key — GEMINI_API_KEY.**
There is NO Anthropic/Claude dependency. The `@anthropic-ai/sdk` was removed.
`src/lib/anthropic.ts` was deleted. All text AI uses Gemini.

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

Model constants are in `src/lib/gemini.ts`. Helper functions:
- `generateText(model, systemPrompt, userPrompt)` — replaces Claude messages.create()
- `describeImageWithVision(model, base64, mediaType, systemPrompt, userPrompt)` — replaces Claude Vision

## Supabase

Project: `ad-creator` (ID: `fldofdiahgtlkapxxdsw`) in us-east-1.

Tables:
- `products` — scraped product data + AI analysis, keyed by `normalized_url`
- `research` — creative research per product (FK to products)
- `concept_cache` — cached concept angles, keyed by brief+product hash
- `prompt_cache` — cached image prompts, keyed by concept+platform hash
- `copy_cache` — cached copy variations, keyed by concept+image-desc hash
- `product-images` storage bucket — product cutout PNGs

Cache helper: `src/lib/cache.ts` with `hashKey()`, `getCached*()`, `setCached*()`.
All 3 generation routes (concept, image-prompts, copy) check cache first.
`skipCache: true` in the request body bypasses cache (used by Regenerate buttons).

## Vercel Environment Variables

| Variable | Set? |
|---|---|
| `GEMINI_API_KEY` | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `ANTHROPIC_API_KEY` | ✅ (legacy, unused — can remove) |

## Key Files Modified This Session

- `src/lib/gemini.ts` — ALL AI models + text/vision helpers
- `src/lib/anthropic.ts` — DELETED
- `src/lib/cache.ts` — NEW, Supabase caching layer
- `src/lib/parse-json.ts` — balanced-brace JSON parser (not greedy regex)
- `src/lib/supabase.ts` — untyped client (`<any>` generics, no generated types)
- `src/lib/store.tsx` — localStorage + IndexedDB persistence, undo/redo, product data actions
- `src/app/api/scrape-product/route.ts` — product scrape + analysis + research + auto-cutout
- `src/app/api/remove-background/route.ts` — on-demand cutout via Nano Banana 2
- `src/app/api/concept/route.ts` — Gemini Pro + caching
- `src/app/api/image-prompts/route.ts` — Gemini Flash + caching + ranked output
- `src/app/api/copy/route.ts` — Gemini Pro + caching + contrastMethod + copyDirection
- `src/app/api/describe-image/route.ts` — Gemini Flash vision
- `src/app/api/analyze-reference/route.ts` — Gemini Flash vision
- `src/app/create/page.tsx` — NEW Step 1 with URL input, session gating, auto-chain
- `src/app/create/image-prompts/page.tsx` — auto-fire, ranked prompts, "Select & Generate"
- `src/app/create/upload/page.tsx` — 3 parallel image gen, selection grid, auto-describe, auto-advance
- `src/app/create/copy/page.tsx` — auto-fire copy generation
- `src/app/create/compose/page.tsx` — product image layer, inline text editing, touch drag
- `src/app/create/export/page.tsx` — auto-render, 2x2 batch builder, product image in canvas

## Auto-Chain Flow

The pipeline auto-chains so the user doesn't click unnecessary buttons:
1. Analyze URL → auto-fire concept generation
2. Select concept → manual (user picks) → Next to format
3. Format → Next → auto-fire image prompt generation
4. Select prompt → auto-navigate to Step 4 + auto-generate 3 images
5. Select image → auto-describe → auto-advance to Step 5 → auto-fire copy
6. Select headline → Next to compose (manual)
7. Compose → Next to export → auto-render PNG

## What Austin Asked For That Isn't Done Yet

1. **Compose step text editor** — Austin wants the compose step to be a free-form
   text editor instead of locked headline/subhead/CTA blocks. He should be able to
   delete the subhead, remove the CTA, add extra lines, type whatever he wants.
   Currently the compose step has inline editing (double-click) but the structure
   is still locked to headline + optional subhead + CTA.

2. **Headline copy marketing theory** — Austin mentioned he has headline copy
   marketing theory info to paste for backend logic. This hasn't been provided yet.
   When he gives it, it should be integrated into `COPY_SYSTEM_PROMPT` in
   `src/lib/prompts.ts`.

## Known Issues / Limitations

- **Fire-and-forget cutout** — `generateCutoutAsync()` in scrape-product runs after
  the response is sent. On Vercel serverless, this may get killed. The frontend
  polls for it (every 5s, 12 attempts) and there's a manual "Remove Background"
  button in compose as fallback.

- **No rate limiting** — API routes have no rate limiting. Add Upstash Redis
  when ready for production traffic.

- **No error monitoring** — No Sentry. Errors go to Vercel function logs only.

- **No CI/CD** — No GitHub Actions. Breaking changes can deploy directly.

- **Google Fonts loaded via stylesheet link** — render-blocking. Should migrate
  to `next/font/google` for self-hosting.

## Austin's Workflow Preferences

- Types fast, sloppy, lots of typos. Interpret intent, not literal words.
- Prefers direct answers, no fluff.
- Wants things to just work — bias toward action over asking questions.
- Has 6 products he makes tons of ads for — caching is critical.
- Runs BIUK Creative agency. The tool is for his own ad production workflow.
- Uses Google Antigravity IDE with Claude Code (called "Antigravity") for
  parallel development. Two agents there: Claude Code (implementation) and
  Claude Opus (architecture/prompts). Give them self-contained prompts.

## Commit History (This Session)

1. Initial scaffold push
2. Gemini image gen (Nano Banana Pro) + upload fallback
3. Favicon fix (corrupted .ico → SVG)
4. Nano Banana model documentation
5. Audit fixes P2-P6 (solid-block, system prompt, JSON parsing, error boundary, cleanup)
6. Quick wins (#9 template state, #14 auto-render, #15 validation, #25 singleton, #2 blob URLs)
7. Deep sweep fixes (contrastMethod in copy prompts, imageId validation)
8. Opus audit fixes (Gemini singleton, balanced-brace JSON parser, stale closure)
9. Security fix (SSRF protection on remove-background, data URL regex)
10. New Step 1 (product URL → scrape → AI analysis → Supabase caching)
11. TS fix (untyped Supabase client)
12. Cost reduction (Haiku + Supabase caching on concepts/prompts/copy)
13. **GEMINI MIGRATION** — replaced ALL Claude calls with Gemini, removed @anthropic-ai/sdk
14. Model ID fix (claude-sonnet-4-6-20250514 → claude-sonnet-4-6, then → Gemini entirely)
15. Antigravity sync (auto-chains, session gating, cutout pipeline, inline editing, batch builder)
16. 3x parallel image gen (down from 4 to avoid rate limits)
17. Stale Claude reference cleanup
