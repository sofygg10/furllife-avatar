# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — run with nodemon (auto-reload)
- `npm start` — run in production
- No test suite, linter, or build step is configured.

Requires Node >= 18. Environment variables are loaded from `.env` via dotenv:
- `GOOGLE_VISION_KEY`, `FIREWORKS_API_KEY` — external APIs (required unless mocking)
- `FIREWORKS_MODEL` (default `flux-kontext-pro`)
- `PORT` (default 3000), `APP_BASE_URL` — used to build public image URLs in responses
- `GENERATED_DIR` — override path for runtime-generated avatars (useful on OCI with ephemeral disk)
- `MOCK_MODE=true` — skips Fireworks calls, copies a placeholder PNG instead (see `generateAvatarFallback`)

## Architecture

Single Express app (`app.js`) exposing one real endpoint: `POST /api/avatar/match` (multipart `image` field). The entire matching pipeline lives in `controllers/avatarMatchingController.js`, organized into numbered sections (1–8). Understanding the pipeline requires reading it end-to-end, because each stage feeds attribute data into the next.

Pipeline (see `matchAvatar` at the bottom of the controller):

1. **Google Vision `LABEL_DETECTION`** returns raw English labels.
2. **`extractPetAttributes`** normalizes labels into `{species, breed, color, stage}` using four dictionaries defined at the top of the file: `SPECIES_MAP`, `BREED_MAP`, `COLOR_SYNONYMS`, `STAGE_MAP`. Breed resolution is tiered: exact `BREED_MAP` hit → substring hit (min length 3) → `breedKeywords` fallback → `'criollo'` (mixed-breed). Color extraction filters out `COLOR_CONTEXT_BLOCKLIST` (snow, grass, wood, furniture, etc.) to avoid treating background as coat color. If only breed is known, `BREED_TYPICAL_COLORS` supplies a fallback description later in the prompt.
3. **`matchLocalAvatar`** tries progressively less-specific filename candidates (`species_breed_color_stage`, `species_breed_color`, …, `species`) against files in `assets/avatars/` using Levenshtein-based `fuzzyBestMatch`. If `confidence >= MATCH_CONFIDENCE_THRESHOLD` (0.80) the response returns `source: 'local'`.
4. **Fallback: `generateAvatarFallback`** calls Fireworks AI FLUX.1 Kontext Pro. It is a two-step async workflow: POST to create (`/workflows/.../{model}`) returns a `request_id`, then poll `/get_result` every `FIREWORKS_POLL_INTERVAL_MS` (3s) up to `FIREWORKS_POLL_MAX_ATTEMPTS` (20) until status is `Ready`. Handles `Request Moderated` / `Content Moderated` as terminal errors.
5. **Dual-write caching** (important): generated PNGs are written to both `assets/avatars_generated/{canonical}_{ts}.png` (history) **and** `assets/avatars/{canonical}.png` (catalog cache). The second write means the next similar request hits step 3 and skips Fireworks entirely — the local catalog is self-populating. `buildCanonicalFileName` (Section 5) defines the canonical form: `species_breed_color_stage`, matching what `matchLocalAvatar` searches for.

### Prompt construction (Section 6)

`buildFireworksPrompt` has a hardcoded special case for orange cats (bicolor criollo — see `ORANGE_CAT_KEYWORDS` and the `isOrangeCat` branch in `matchAvatar` that defaults cats without a detected color to `orange`). This is app-specific branding, not a generic fallback — don't remove it when refactoring. The generic branch composes a Pixar/Dreamworks-styled prompt using `COLOR_DISPLAY`, `SPECIES_BACKGROUND`, and `BREED_TYPICAL_COLORS` as the source of descriptive strings.

### Static serving

- `/static/avatars` → `assets/avatars/` (local catalog + cached generations)
- `/static/avatars_generated` → `GENERATED_DIR` or `assets/avatars_generated/` (history)

Response `imageUrl` always points at `/static/avatars/{canonical}.png` (the cache path), so even freshly-generated avatars are served from the catalog URL for consistency.

### Language / logging

Comments, log messages, and error strings are in Spanish. Keep that convention when editing. Log prefixes (`[Vision]`, `[Breed]`, `[Match]`, `[Fireworks]`, `[Cache]`, `[Attrs]`) are meaningful for tracing pipeline stages — preserve them.

### Deployment context

Targets Oracle Cloud Infrastructure behind a load balancer (`/health` exists for the LB). `multer.memoryStorage()` is intentional because OCI disk may be ephemeral; writing to `assets/avatars/` relies on that directory being persistent storage in the deployed environment, so the caching behavior only works if that path is a mounted volume.
