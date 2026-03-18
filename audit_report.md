# Ad Creator — Comprehensive Audit Report

**Date:** 2026-03-18
**Auditor:** Principal Engineer Agent
**Codebase:** `ad-creator` — Next.js 16 / Tailwind v4 / Gemini API / Supabase
**Total files:** 35 source files, ~6,500 lines

---

## Executive Summary

**Health Score: 72 / 100**

The app is functional end-to-end with a solid architecture for its scope. The 7-step pipeline, auto-chain flow, and AI integration all work. The codebase is well-organized with clean separation of concerns. However, several runtime bugs will cause crashes or silent failures during real usage, the compose page at 911 lines needs decomposition, there are no tests, and the API routes are completely unprotected. These are solvable problems — nothing is architecturally broken.

---

## 1. Critical Vulnerabilities & Bugs (High Priority)

### BUG-1: `_HYDRATE_IMAGES` type mismatch — batch images won't rehydrate
- **File:** `src/lib/store.tsx:173` vs `src/lib/store.tsx:404-415`
- **Issue:** The `_HYDRATE_IMAGES` action type declares `payload: { uploadedUrl?, exportUrl?, referenceImages? }` but the reducer handler accesses `action.payload.batchImageUrls` which doesn't exist in the type. The hydration effect (line 526-560) never passes `batchImageUrls` either.
- **Impact:** After a page refresh, batch images (the 2 selected images from Step 4) are lost. Users will see empty slots in compose/export and have to re-select.
- **Fix:** Add `batchImageUrls?: string[]` to the `_HYDRATE_IMAGES` payload type, and hydrate batch images in the `hydrateImages()` effect.

### BUG-2: Export CORS failure — canvas silently renders without product image or background
- **File:** `src/app/create/export/page.tsx:69-88, 108-130`
- **Issue:** Product and background images loaded with `crossOrigin = "anonymous"`, but the Gemini-generated images are `data:` URLs (which work fine), while product images are external CDN URLs that may not have CORS headers. When CORS fails, `img.onerror = () => resolve()` silently swallows the error — the layer just doesn't render.
- **Impact:** The exported PNG may be missing the product cutout or even the background image with no user feedback.
- **Fix:** Add an error state that warns the user when an image fails to load during render. Consider proxying external images through an API route.

### BUG-3: `generate-image` returns multi-megabyte data URLs inline in JSON response
- **File:** `src/app/api/generate-image/route.ts:52-54`
- **Issue:** The full base64 image (~2-4 MB) is returned as a JSON `{ imageUrl: "data:image/png;base64,..." }`. On Step 4, three of these fire in parallel = ~6-12 MB of JSON responses parsed into memory, all stored as data URLs in React state, and then saved to IndexedDB.
- **Impact:** This works but is extremely memory-heavy. On mobile or low-memory devices, 3 parallel 4MB image responses + React state + IndexedDB writes can cause OOM crashes or browser tab kills. Large data URLs in JSON also slow parsing.
- **Severity:** Medium-high. Works on desktop, may crash mobile.
- **Fix:** Upload generated images to Supabase Storage and return a URL, or use blob URLs on the client.

### BUG-4: No input validation on API routes
- **Files:** `src/app/api/concept/route.ts`, `copy/route.ts`, `image-prompts/route.ts`
- **Issue:** `req.json()` is cast directly to typed interfaces (`ConceptRequest`, `CopyRequest`, etc.) with no runtime validation. Malformed or missing fields will cause cryptic Gemini API errors or undefined behavior in prompt builders.
- **Impact:** Any bad request body passes through unchecked. This is a security and reliability issue.
- **Fix:** Add basic validation (check required fields exist and are correct types) at the top of each route.

### BUG-5: Hash collision risk in cache keys (djb2 with 32-bit output)
- **File:** `src/lib/cache.ts:7-14`
- **Issue:** `hashKey()` uses djb2 with 32-bit unsigned output, yielding ~4 billion possible values. With even a few thousand products, the birthday problem gives a non-trivial collision chance. Two different products could return the same cached concepts/copy.
- **Impact:** Users may see concepts from a different product. Rare but confusing.
- **Fix:** Use a longer hash (SHA-256 substring or a 64-bit variant) or include more discriminating data in the key.

### BUG-6: `TOGGLE_BATCH_IMAGE` dispatch calls `reducer()` a second time inside the dispatch wrapper
- **File:** `src/lib/store.tsx:496-501`
- **Issue:** Inside the `dispatch` callback, when handling `TOGGLE_BATCH_IMAGE`, the code calls `const newState = reducer(stateRef.current, action)` to get the new state for IndexedDB saves. But `rawDispatch(action)` was already called above this. The reducer runs twice for every batch image toggle — once by React, once manually. This is wasteful and could drift if the reducer has side effects.
- **Fix:** Move the batch image save logic to the `useEffect` that watches state changes, or compute the save keys from the action payload directly without calling reducer.

---

## 2. UX/UI Action Plan

### UI-1: Compose page is 911 lines — needs decomposition
- **File:** `src/app/create/compose/page.tsx`
- **Recommendation:** Extract into:
  - `CanvasPreview.tsx` — the visual preview div with all layers
  - `StylePanel.tsx` — the right sidebar with all controls
  - `ProductImageControls.tsx` — product image section
  - `TextControls.tsx` — headline/CTA style controls
  - `BatchPreview.tsx` — the 2x2 batch mini-grid
- **Why:** The file mixes drag logic, editing logic, rendering, and controls. Changes to any subsystem require reading 900 lines.

### UI-2: Upload page mode toggle uses `bg-white text-black` — inconsistent with design system
- **File:** `src/app/create/upload/page.tsx:288-289, 295-296`
- **Issue:** Selected mode buttons use hardcoded `bg-white text-black` instead of `bg-[var(--accent)] text-white` like every other selected state.
- **Fix:** Change to accent color for consistency.

### UI-3: Step 4 "pick 2 images" flow is unclear for first-time users
- **File:** `src/app/create/upload/page.tsx`
- **Issue:** The instruction "Pick 2 for your ad batch" only appears in the subtitle. Users may click one image thinking they're selecting it as their final choice (the old single-select mental model). The numbered badges (1, 2) on selected images are subtle.
- **Fix:** Add a prominent callout card above the grid: "Select 2 images for your 2x2 ad batch" with a visual 2x2 icon hint.

### UI-4: Step 5 (Copy) — no way to go back to single-image mode
- **File:** `src/app/create/copy/page.tsx:300`
- **Issue:** The "Next" button is disabled unless `batch.copies.length < 2`. If a user came through upload mode (single image), they can't proceed because the button requires 2 copies selected. The page says "Pick 2 for your 2x2 batch" but single-image users didn't build a batch.
- **Fix:** Check `mode` or batch state — if `batch.images.length < 2`, fall back to the old single-select behavior where picking 1 copy is enough.

### UI-5: Landing page step indicators don't connect visually
- **File:** `src/app/page.tsx:47`
- **Issue:** The dashed connector lines are rendered as `border-t` inside each step's column, but they don't actually stretch between columns — they stop at the column boundary. On mobile they collapse entirely.
- **Fix:** Use a flex row with absolute-positioned connector lines or a simple `→` between steps.

### UI-6: No confirmation before "Start Fresh" / RESET
- **File:** `src/app/create/layout.tsx:34-37` and `src/app/create/export/page.tsx:452`
- **Issue:** "Start Fresh" immediately calls `dispatch({ type: "RESET" })` which wipes all state, images, and IndexedDB. One misclick = all work gone.
- **Fix:** Add a browser `confirm()` dialog or a small inline confirmation step.

### UI-7: Step 2 (Format) — no default template selected
- **File:** `src/app/create/format/page.tsx:26`
- **Issue:** `activeTemplateId` starts as `null`. The layout zones are initialized to defaults, but no template card appears selected. Users may not realize they should pick one.
- **Fix:** Default to the first template and highlight it on load.

### UI-8: Compose page safe zone dashed border is nearly invisible
- **File:** `src/app/create/compose/page.tsx:300-307`
- **Issue:** `border-red-500/20` is extremely faint on the dark background. Users won't notice the safe zone indicator.
- **Fix:** Increase to `/40` or add a subtle fill like `bg-red-500/5`.

---

## 3. Robustness & Scalability Gaps

### SCALE-1: No rate limiting on any API route
- **Files:** All 8 routes in `src/app/api/`
- **Issue:** Anyone with the URL can hammer `/api/generate-image` or `/api/concept` and exhaust the Gemini API quota. There's no per-IP, per-session, or global rate limiting.
- **Risk:** API key exhaustion, unexpected billing, or service degradation.
- **Fix:** Add Vercel KV or Upstash Redis rate limiter middleware. Even a simple in-memory rate limiter per route would help.

### SCALE-2: No request body size limits
- **Files:** `src/app/api/describe-image/route.ts`, `src/app/api/remove-background/route.ts`
- **Issue:** `describe-image` accepts a full base64 image in the JSON body with no size check. A 20MB image would be parsed into memory, sent to Gemini, and could crash the serverless function.
- **Fix:** Add `export const config = { api: { bodyParser: { sizeLimit: '5mb' } } }` or validate `image.length` before processing.

### SCALE-3: Supabase service role key used for all operations
- **File:** `src/lib/supabase.ts`
- **Issue:** The service role key bypasses Row Level Security (RLS). All Supabase operations (reads and writes) run with full admin access. If this key leaks, an attacker has unrestricted access to all data.
- **Risk:** Any XSS or SSRF vulnerability exposes the entire database.
- **Fix:** Use the anon key for read operations where possible, and restrict the service role to API routes only (which is currently the case, but the client helper function's name doesn't make this clear).

### SCALE-4: No structured error logging — `console.error` only
- **Files:** All API routes
- **Issue:** Errors are logged to `console.error` which is ephemeral in serverless (Vercel). There's no Sentry, LogRocket, or structured JSON logging. When something breaks in production, there's no way to know unless a user reports it.
- **Fix:** Add Sentry (free tier) or at minimum, structured JSON error logging that Vercel can parse.

### SCALE-5: No timeout on Gemini API calls
- **Files:** `src/lib/gemini.ts:52-64`
- **Issue:** `generateText()` and `describeImageWithVision()` have no `AbortSignal.timeout()`. If Gemini hangs, the serverless function runs until Vercel's 60s limit kills it, and the user sees a generic timeout error.
- **Fix:** Add `signal: AbortSignal.timeout(30000)` to Gemini calls, or use the `@google/genai` timeout option if available.

### SCALE-6: Zero test coverage
- **Discovery:** No test files exist in the project. No test runner configured in `package.json`.
- **Impact:** Every change is a manual regression risk. The auto-chain flow, cache behavior, and state reducer are especially fragile without tests.
- **Fix:** Add at minimum: reducer unit tests, cache key tests, and API route integration tests.

### SCALE-7: Image data URLs bloat localStorage serialization
- **File:** `src/lib/store.tsx:108-134`
- **Issue:** `saveToLocalStorage()` strips uploaded/export images with `__IDB__` markers, but `batch.images` contain full data URLs that ARE serialized to localStorage. With 2 batch images at 2-4 MB each, this can exceed localStorage's 5-10 MB limit.
- **Fix:** Strip batch image URLs in `saveToLocalStorage()` the same way uploaded/export images are handled, and hydrate from IndexedDB.

### SCALE-8: Scrape route SSRF — only the remove-background route has protection
- **File:** `src/app/api/scrape-product/route.ts:163-204`
- **Issue:** `scrapeProductPage()` fetches any URL the user provides with no SSRF protection. The `remove-background` route correctly blocks `localhost`, `127.0.0.1`, internal networks, etc. — but the scraper doesn't.
- **Fix:** Add the same SSRF guards from `remove-background/route.ts` to `scrape-product/route.ts`.

---

## 4. Code Quality Notes

### QUALITY-1: `console.log` in production path
- **File:** `src/app/api/scrape-product/route.ts:534`
- `console.log("Auto-cutout generated and cached: ...")` — should be removed or downgraded.

### QUALITY-2: Unused `searchParams` import in copy page
- **File:** `src/app/create/copy/page.tsx:4`
- `useSearchParams` is imported but not used in the auto-fire logic anymore.

### QUALITY-3: Export page `combos` array recalculated on every render
- **File:** `src/app/create/export/page.tsx:32-50`
- The `combos` array is derived from state but not memoized. Wrap in `useMemo`.

### QUALITY-4: `deleteImage` exported but never used
- **File:** `src/lib/image-store.ts:68-81`
- Dead code — `deleteImage()` is exported but not imported anywhere.

---

## 5. The "Next Steps" Checklist

### Quick Wins (< 30 min each)

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 1 | Fix batch image serialization to localStorage (strip data URLs like uploaded images) | `store.tsx` | **Critical** |
| 2 | Add SSRF protection to scrape-product route | `scrape-product/route.ts` | **Critical** |
| 3 | Add `confirm()` before RESET / Start Fresh | `create/layout.tsx`, `export/page.tsx` | High |
| 4 | Fix upload page mode toggle color (use accent, not white) | `upload/page.tsx` | Medium |
| 5 | Remove `console.log` from scrape route | `scrape-product/route.ts` | Low |
| 6 | Remove unused `useSearchParams` from copy page | `copy/page.tsx` | Low |
| 7 | Memoize `combos` in export page | `export/page.tsx` | Low |
| 8 | Increase safe zone border visibility in compose | `compose/page.tsx` | Low |
| 9 | Default-select first layout template in Step 2 | `format/page.tsx` | Low |

### Medium Effort (1-3 hours each)

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 10 | Fix `_HYDRATE_IMAGES` to rehydrate batch images from IndexedDB | `store.tsx` | **Critical** |
| 11 | Add input validation to all 6 AI API routes | `api/*/route.ts` | **Critical** |
| 12 | Fix copy page single-image vs batch mode gating | `copy/page.tsx` | High |
| 13 | Add Gemini API call timeouts (30s AbortSignal) | `gemini.ts` | High |
| 14 | Add basic rate limiting (in-memory or Vercel KV) | `api/*/route.ts` | High |
| 15 | Add error feedback when export canvas image loading fails | `export/page.tsx` | Medium |
| 16 | Eliminate double-reducer call in TOGGLE_BATCH_IMAGE side effect | `store.tsx` | Medium |
| 17 | Replace djb2 hash with collision-resistant alternative | `cache.ts` | Medium |

### Deep Refactors (half-day+)

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 18 | Decompose compose page (911 LOC) into 5+ components | `compose/page.tsx` | High |
| 19 | Move generated images to Supabase Storage (instead of data URL in JSON) | `generate-image/route.ts`, `upload/page.tsx`, `store.tsx` | High |
| 20 | Add Sentry or structured error logging | All API routes | Medium |
| 21 | Add reducer unit tests + API route integration tests | New test files | Medium |
| 22 | Proxy external images through API route for CORS-safe canvas export | New route | Medium |
