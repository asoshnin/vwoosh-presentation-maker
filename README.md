# AI Presentation Maker

> Agentic AI assistant that turns abstract ideas into enterprise-ready PowerPoint — via natural conversation, branded output, and Meta AI.

[![Track](https://img.shields.io/badge/Track%201-Indie%20Developer-blue)](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
[![Theme](https://img.shields.io/badge/Theme-Push%20the%20Frontier-purple)](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
[![Meta Model API](https://img.shields.io/badge/Meta%20Model%20API-muse--spark--1.3--contributor-orange)](https://dev.meta.ai)
[![Muse Code](https://img.shields.io/badge/Coding%20Agent-Muse%20Code-black)](https://dev.meta.ai/docs/muse-code)

**Submission repository:** [`asoshnin/vwoosh-presentation-maker`](https://github.com/asoshnin/vwoosh-presentation-maker)

---

## Demo (3 min)

🎬 **Video:** _coming soon — will be hosted on YouTube/Loom and linked here before submission._

> Pre-existing: our prompt-engineering patterns and Liquid Glass brand-kit design system. Built during Oct 26 – Nov 4: the agentic presentation pipeline (strategy chat → outline → branded slide synthesis), Meta Model API integration via Muse Spark, and the polished demo experience.

---

## What it does

1. **Strategy chat** — agentic conversation that extracts goals, audience, and core messages (not a static form).
2. **Outline generation** — deterministic LLM synthesis of a structured `{title, slides[]}` outline from the conversation.
3. **Brand kit** — logo (SVG/PNG → base64) + primary color; applied to every slide via `defineSlideMaster`.
4. **Branded PPTX generation** — multi-slide output with master layout, bullet content, logo on every slide, direct download.
5. **Session Images (Sprint 09)** — upload PNG/JPEG outside the dialogue into a session library (SHA256 dedupe, license-tagged); reference image IDs in chat for per-slide art direction.

## Quickstart (local)

```bash
# 1. Clone
git clone https://github.com/asoshnin/vwoosh-presentation-maker
cd vwoosh-presentation-maker

# 2. Backend — requires MODEL_API_KEY in backend/.env
cp backend/.env.example backend/.env   # fill MODEL_API_KEY from dev.meta.ai
cd backend && npm install && npm start  # → http://localhost:3002

# 3. Frontend (new terminal)
cd frontend && npm install && npm run dev  # → http://localhost:3001

# 4. (Optional) Python post-processing — Z-order layering correction
cd python-service && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000  # → http://localhost:8000
```

Open `http://localhost:3001` — chat with the strategist, generate outline, set brand, download PPTX.

## Tooling

* **Meta Model API** — `muse-spark-1.3-contributor` (primary) and `muse-wonder-1.0` (fallback) via `POST https://api.meta.ai/v1/chat/completions`. Every AI inference in the app flows through this API.
* **Muse Code** (`muse 1.4.14`) — coding agent for the hackathon refactor, headless `muse exec` with `muse-spark-1.3-contributor`.
* **PptxGenJS** `4.0.1` — slide generation, master slides, SVG logo import.
* **python-pptx** — optional Z-order `_spTree` post-processing (conditional on layering).

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for full system design and tooling disclosure.

## Project structure

```
frontend/        React 19 + Vite + TailwindCSS — Liquid Glass chat UI, brand kit, Session Images, generation hub
backend/         Node.js + Express — /api/chat, /api/generate-outline, /api/generate-presentation, /api/assets
backend/assetstore/  Session image library — upload/list, magic-byte probe, 50 MB LRU
backend/creative/    Creative-director composer + mckinsey.json geometry pack
backend/tests/       node --test suite (12 tests, zero deps): node --test backend/tests/test_sprint09.mjs
python-service/  FastAPI — Z-order correction via _spTree manipulation (conditional)
demo/winning-deck/   High-fidelity teaser deck + one-command rebuild (build_winning_deck.py) + RUNBOOK.md
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `MODEL_API_KEY` | yes | Meta Model API key (`LLM_…`) from `https://dev.meta.ai` — or set it in Settings (stored server-side, `0600`) |
| `META_API_BASE` | no | Override, default `https://api.meta.ai/v1` |

## Provenance

All commits in this repository were made **Oct 26 – Nov 4, 2026** during the Meta Global AI Developer Hackathon (Track 1 — Indie). The project builds on the dev repo at `dev/PresentationMaker` (3-service architecture validated locally) but this submission tree contains only the runtime code required to run the app.

## Teaser deck

`demo/winning-deck/winning_deck.pptx` — the template-engine preview from the demo's closing act (dark theme, problem/stat cards, timing chart, AI hero visuals). Rebuild deterministically with `python3 demo/winning-deck/build_winning_deck.py` (no API calls); camera runbook in `RUNBOOK.md`.

## License

MIT — see `LICENSE`.

---

*Built for the Meta Global AI Developer Hackathon — $1M prize pool, 20,000 builders, 10-day sprint.*
