# Architecture — AI Presentation Maker

> System design, service contracts, and Meta AI tooling disclosure for the Meta Global AI Developer Hackathon submission (Track 1 — Indie, Theme 2 — Push the Frontier).

---

## 1. Overview

AI Presentation Maker is an **agentic AI assistant** that guides a user from **Ideation → Outlining → Design → Execution** to produce branded, multi-slide PowerPoint presentations. The core problem is twofold: (1) generic tools don't help structure narrative, (2) they mangle professional designs (SVGs, brand colors, element layering).

```
User conversation
      │
      ▼
┌────────────────┐     ┌──────────────────┐     ┌───────────────────┐     ┌──────────┐
│  Frontend      │────▶│  Backend         │────▶│  Meta Model API   │────▶│  PPTX    │
│  (React 3001)  │◀────│  (Express 3002)  │◀────│  (muse-spark)     │     │  output  │
└────────────────┘     └──────────────────┘     └──────────────────┘     └──────────┘
                              │                          │
                              └─────────▶ python-service (port 8000, conditional — Z-order)
```

## 2. Services

### 2.1 `frontend/` — React 19 + Vite + TailwindCSS (port 3001)

* **Design system:** Liquid Glass (visionOS-style) — `backdrop-blur`, semi-transparent fills, inner/outer shadows. Spec: `_DEVELOPMENT/30_ARCHITECTURE_AND_SPECS/LiquidGlass design.md` in the dev repo.
* **Layout:** two-column — chat (left) + generation hub + brand kit (right).
* **Comms:** talks only to backend via Vite proxy on `/api`. No direct Meta API calls from the browser.
* **Brand kit:** file input (SVG/PNG → `FileReader` → base64 data URI) + color picker; stored in React state, sent as `{outline, brandKit}` to the generation endpoint.

### 2.2 `backend/` — Node.js + Express + PptxGenJS (port 3002)

The orchestrator and generation engine. Four endpoints:

| Endpoint | Purpose | Auth | Generation config |
|---|---|---|---|
| `POST /api/chat` | Strategy discussion — agentic conversation | `MODEL_API_KEY` → Meta Model API | `temperature: 0.7`, `maxOutputTokens: 4096` (creative guidance) |
| `POST /api/generate-outline` | Deterministic outline `{title, slides[]}` from conversation history | `MODEL_API_KEY` → Meta Model API | `temperature: 0.0`, `topP: 0.0` (stable JSON) |
| `POST /api/generate-presentation` | Branded PPTX synthesis from outline + brand kit | PptxGenJS only (no LLM) | — |
| `POST /api/generate-debug-test` | 5-slide smoke test (shapes, bullets, tables, overlays) | PptxGenJS only | — |

Also proxies legacy Z-order handover endpoints (`/generate-test`, `/download-processed-file/:filename`) that delegate to the Python service.

### 2.3 `python-service/` — FastAPI + python-pptx (port 8000)

**Conditional** post-processing engine. Active only when Z-order layering correction is required (the "Mutually Exclusive Library Problem": PptxGenJS owns SVG/master slides; python-pptx owns `_spTree` XML reordering).

* `POST /api/process-pptx` — ingest PPTX from Node.
* `GET /api/get-processed-file/:filename` — serve corrected file.
* Implementation: `shape.name` (altText tag) → `_spTree.remove(el) / insert(0, el)` hack.

For plain-text presentations the pipeline short-circuits to direct `PptxGenJS → res.send(buffer)` (no Python hop).

## 3. Meta AI tooling — load-bearing disclosure

This section satisfies **HACKATHON_REGULATIONS.md §4.5 (Tooling disclosure)** and the **25% "Use of Meta AI Tooling"** rubric.

### 3.1 Models and endpoints

| Model | Purpose | Endpoint |
|---|---|---|
| **`muse-spark-1.3-contributor`** (primary) | Strategy chat + outline generation | `POST https://api.meta.ai/v1/chat/completions` |
| `muse-spark-1.3` | Fallback (same provider, no code change) | same |
| `muse-wonder-1.0` | Alternative for richer synthesis if needed | same |
| `sam-3.1`, `muse-image-1.0` | Available on account, not used in MVP (roadmap) | — |

Verified 2026-11-04: `GET https://api.meta.ai/v1/models` with `MODEL_API_KEY` returns 9 models including the above. See `MUSE_CODE_CONTRACT.md` in the dev repo for the verification receipt.

### 3.2 Coding agent

**Muse Code `muse 1.4.14`** — headless `muse exec` with `muse-spark-1.3-contributor` (contributor-mode ON). The hackathon refactor (Vertex AI → Meta Model API migration) is executed via this agent. Muse Code is optional per §4.4 but is load-bearing in this submission: every backend AI call is written through it.

### 3.3 Request shape (chat example)

```json
POST https://api.meta.ai/v1/chat/completions
Authorization: Bearer *** (MODEL_API_KEY from backend/.env)
Content-Type: application/json

{
  "model": "muse-spark-1.3-contributor",
  "messages": [
    {"role": "system", "content": "You are an expert presentation strategist..."},
    {"role": "user", "content": "I need an investor deck for our health-tech startup..."}
  ],
  "temperature": 0.7,
  "max_tokens": 4096
}
```

### 3.4 Outline generation (deterministic JSON)

System prompt (from `backend/auth-server.js`):

```
You are an expert presentation outliner. You will be given a Strategy Discussion.
Your only job is to return a valid JSON object:
{ "title": "...", "slides": [{ "title": "...", "content": "..." }, ...] }
No markdown fences, no conversational text.
```

The response is cleaned (` ```json` stripped) and `JSON.parse`'d before returning to the frontend.

### 3.5 Fallback policy

Google Vertex AI / Gemini is retained behind `USE_VERTEX_FALLBACK=1` for local debugging only. It is **not** the submission's inference path. See `backend/.env.example`; `VITE_GOOGLE_CLOUD_PROJECT` is absent in the submission unless explicitly opted in.

## 4. Presentation generation

1. Receive `{outline, brandKit}` (outline from §3.4, brandKit = `{color, logo}` from frontend).
2. Create `new PptxGenJS()`, resolve `userColor = brandKit.color.replace('#','') || '0072C6'`.
3. `defineSlideMaster({ title: 'MASTER_LAYOUT', background, objects: [footer], slideNumber })`.
4. Loop `outline.slides`: `addSlide({masterName})` → `addText(title, {color: titleColor})` → `addText(bullets, {bullet: true})` → `addImage({data: brandKit.logo})`.
5. `write('nodebuffer')` → `res.setHeader(Content-Disposition, Content-Type) → res.send(buffer)` (in-memory; no temp files).

## 5. Configuration

| Variable | Required | Where |
|---|---|---|
| `MODEL_API_KEY` | **yes** | `backend/.env` — Meta Model API key from `https://dev.meta.ai` |
| `VITE_GOOGLE_CLOUD_PROJECT` | only if `USE_VERTEX_FALLBACK=1` | Vertex AI project (fallback) |
| `VITE_GOOGLE_CLOUD_LOCATION` | only with `USE_VERTEX_FALLBACK` | `global` |

`.env` is gitignored; `.env.example` is the contract for required vars. No secrets are committed.

## 6. Provenance and video

* **Provenance:** every commit in this repo is dated Oct 26 – Nov 4, 2026 (hackathon window). The dev repo's broader `_DEVELOPMENT/` history is intentionally excluded from this filtered submission branch.
* **Demo video disclosure line ( §4.1):** "Pre-existing: our prompt-engineering patterns and Liquid Glass brand-kit design system. Built during Oct 26 – Nov 4: the agentic presentation pipeline, Meta Model API integration, and the polished demo experience." — tighten to match the shipped build before recording.
* **Video spec (§4.2):** 3 min hard cap (target 2:55–3:00), live run, human on camera preferred.

---

*Companion docs:* [`README.md`](README.md) (quickstart), `MUSE_CODE_CONTRACT.md` (coding agent contract, dev repo), `HACKATHON_REGULATIONS.md` (competition rules, dev repo).
