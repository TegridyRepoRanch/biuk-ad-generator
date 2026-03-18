# Gemini Image Generation Models (Nano Banana Family)

## Quick Reference

| Marketing Name    | API Model String                 | Quality | Speed   | Cost    |
|-------------------|----------------------------------|---------|---------|---------|
| Nano Banana       | `gemini-2.5-flash-image`         | Good    | Fastest | Lowest  |
| Nano Banana Pro   | `gemini-3-pro-image-preview`     | Best    | Slow    | Highest |
| Nano Banana 2     | `gemini-3.1-flash-image-preview` | Great   | Fast    | Mid     |

**CRITICAL**: "Nano Banana" is a marketing name. The API model strings all use
the `gemini-*` convention. Never pass `nano-banana-pro` or `nano-banana-2` as
a model identifier — it won't work.

## Which Model To Use

- **Nano Banana Pro** (`gemini-3-pro-image-preview`): Use for final ad images.
  Best quality, uses "Thinking" mode for complex prompts, renders text in
  images accurately. This is what we default to in the app.
- **Nano Banana 2** (`gemini-3.1-flash-image-preview`): Good fallback. Nearly
  Pro quality at Flash speed. Use if Pro is too slow or for drafts/iterations.
- **Nano Banana** (`gemini-2.5-flash-image`): Original model. Use only for
  bulk generation or when latency matters more than quality.

## SDK & API Pattern

Package: `@google/genai` (unified Google Gen AI SDK for JS/TS)

```typescript
import { GoogleGenAI } from "@google/genai"

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const response = await ai.models.generateContent({
  model: "gemini-3-pro-image-preview",  // or any model from table above
  contents: [{ role: "user", parts: [{ text: "your image prompt here" }] }],
  config: {
    responseModalities: ["IMAGE", "TEXT"],
  },
})

// Extract image from response
const parts = response.candidates?.[0]?.content?.parts ?? []
for (const part of parts) {
  if (part.inlineData) {
    const base64 = part.inlineData.data       // base64-encoded image bytes
    const mime = part.inlineData.mimeType      // "image/png" or "image/jpeg"
    const dataUrl = `data:${mime};base64,${base64}`
  }
  if (part.text) {
    // Model sometimes returns text alongside the image
    console.log(part.text)
  }
}
```

## Important Notes

1. **responseModalities must include "IMAGE"** — without it, the model only
   returns text even if you ask for an image.
2. **Always iterate all parts** — the model may return text + image, or just
   image. Don't assume the first part is the image.
3. **Images come back as base64** — for large images (especially from Pro),
   the response payload can be several MB. Handle accordingly.
4. **SynthID watermarks** — all generated images include invisible SynthID
   watermarks for AI content identification. This is automatic and cannot
   be disabled.
5. **The model may refuse** — if the prompt triggers safety filters, you'll
   get a response with no image parts. Check for this and surface a useful
   error to the user.

## Environment Variables

- `GEMINI_API_KEY` — Google AI API key (get from https://aistudio.google.com)
- Set in `.env.local` for local dev, and as Vercel env var for production.

## Where This Is Used In The App

- `src/lib/gemini.ts` — Client setup + model constants
- `src/app/api/generate-image/route.ts` — POST endpoint that takes a prompt
  and returns a base64 data URL
- `src/app/create/upload/page.tsx` — Step 4 UI with "AI Generate" button

## Version History

- 2026-03-18: Initial setup with Nano Banana Pro as default model
