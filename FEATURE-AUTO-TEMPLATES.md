# Feature: Auto-Compositor Templates

## Status: Proposed
## Priority: Enhancement
## Source: Analysis of legacy `ai-ad-generator` project (TegridyRepoRanch/ai-ad-generator)

---

## Summary
Add a **"Quick Templates"** system to Step 6 (Compose) that auto-generates multiple templated ad variations from the current image + headline, giving users instant professional layouts alongside the existing manual drag-and-compose workflow.

## Problem
Currently Step 6 requires manual positioning of text over images. This is flexible but slow — especially when generating multiple ad variations for A/B testing or multi-platform campaigns. The legacy `ai-ad-generator` project had a Python PIL-based compositor that auto-generated 6 template styles from a single image+headline pair.

## Proposed Solution

### User Flow
1. User reaches Step 6 (Compose) with their image and copy already generated
2. A new **"⚡ Auto-Generate Templates"** button appears alongside the manual compose canvas
3. Clicking it generates 4-6 templated variations server-side in ~2-3 seconds
4. User sees a grid of variations, picks favorites, or continues to manual compose
5. Selected templates can be fine-tuned in the manual editor if needed

### Template Styles (from legacy codebase, adapted)

#### 1. Minimal Top
- Clean white/dark bar at top 15% of image
- Headline centered in bar
- Subtle drop shadow on text
- Best for: product shots, lifestyle images

#### 2. Banner Bottom
- Solid color banner across bottom 20%
- Headline left-aligned with brand accent color
- Optional CTA button right-aligned
- Best for: feed ads, Facebook

#### 3. Sale Sticker
- Circular or angled badge overlay in top-right corner
- Large price/discount number
- Headline below or beside badge
- Best for: promotions, e-commerce

#### 4. Split Layout
- Image occupies 60% (left or top)
- Solid color panel with headline occupies 40% (right or bottom)
- Clean typography hierarchy
- Best for: stories, informational ads

#### 5. Diagonal Banner
- Angled color strip across corner (top-left to mid-right)
- Headline follows the diagonal
- Dynamic, attention-grabbing
- Best for: sale announcements, urgency

#### 6. Gradient Overlay
- Semi-transparent gradient from bottom (dark) to top (clear)
- Headline sits in the gradient zone at bottom
- Image remains fully visible
- Best for: hero images, brand awareness

### Technical Implementation

#### Option A: Server-Side (PIL/Pillow via API route)
```
POST /api/compose-templates
Body: { imageUrl, headline, subheadline?, ctaText?, brandColor? }
Returns: { templates: [{ style, imageUrl }] }
```
- Use Sharp (Node) or spawn a Python subprocess with Pillow
- Generate all 6 templates in parallel
- Upload results to Supabase storage
- Return public URLs

#### Option B: Client-Side (Canvas API)
- Render templates using HTML5 Canvas in the browser
- No server cost, instant preview
- Export as PNG when user selects
- Lighter implementation, but less control over typography

#### Recommended: Option A (server-side)
Better typography control, consistent output across devices, and the image is already on the server (Supabase storage). Sharp is already common in Next.js deployments.

### Data Model Addition
```typescript
// In store.ts, add to Project type:
autoTemplates?: {
  style: string
  imageUrl: string
  selected: boolean
}[]
```

### Key Files to Modify
- `src/app/create/compose/page.tsx` — add template grid UI + generate button
- `src/app/api/compose-templates/route.ts` — new API route (create)
- `src/lib/compositor.ts` — template rendering logic (create)
- `src/lib/store.ts` — add autoTemplates to project state

### Reference Code
The legacy compositor implementation is at:
- `TegridyRepoRanch/ai-ad-generator/compositor.py` — full PIL compositor with all 6 templates
- `TegridyRepoRanch/ai-ad-generator/config.py` — template colors, font settings, ad sizes

Key patterns to port:
- `AdCompositor._select_template()` — avoids repeating same template
- `AdCompositor.compose()` — main render method per template style
- `compose_ad_batch()` — generates all styles at once
- Template color system: primary, secondary, accent, text colors
- Font size ratios relative to image dimensions (0.08 for headline, 0.04 for sub)

### Hobby Tier Considerations
- Vercel serverless function timeout: 10s on hobby
- PIL/Sharp processing for 6 templates should complete in 3-5s — within limit
- Each template is ~200KB PNG → ~1.2MB total upload per batch
- Consider generating 4 templates instead of 6 to stay well within timeout

---

## Not Included (but possible future additions)
- Brand kit integration (save colors, fonts, logo for reuse)
- Template style learning (track which styles get selected most)
- Animated template previews
- Multi-format batch (generate Instagram + Facebook + Story from one template)
