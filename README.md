# BIUK Ad Generator

Paste a product URL → get a finished social media ad image. 7-step pipeline powered by Gemini + Nano Banana Pro.

**Live:** [ad-creator-orpin.vercel.app](https://ad-creator-orpin.vercel.app)

## Quick Start

```bash
npm install
cp .env.local.example .env.local  # add your API keys
npm run dev
```

## Environment Variables

```
GEMINI_API_KEY=AIza...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Stack

Next.js 16 · Tailwind v4 · Gemini (Pro, Flash, Nano Banana Pro) · Supabase · Vercel

## Pipeline

1. Product URL → scrape + AI analysis + Supabase cache → concept angles
2. Platform + layout template + contrast method
3. AI image prompts (optimized for Nano Banana Pro)
4. AI image generation (or manual upload) + auto-describe
5. AI headlines written to complement the actual image
6. Live compose with drag, font picker, styling, undo/redo, 2x2 batch preview
7. Canvas render to PNG at exact platform dimensions — individual or 2x2 grid

See `CLAUDE.md` for full architecture docs.
