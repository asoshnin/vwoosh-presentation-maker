# Winning Deck — Runbook (record-night edition)

## The two artifacts
- **Act 3 (live):** generate in the app with Prompt A below → proves live generation.
- **Act 5 (teaser):** `winning_deck.pptx` in this folder → proves where the template engine goes.
  Frame on camera: *"and this is where the template engine takes it next — same repo, same JSON."*

## Prompt A — paste into the app chat (one shot, no follow-ups)
> Create a 6-slide pitch deck for Vwoosh, our open-source engine that turns structured
> JSON into truly editable PPTX. Audience: hackathon judges. Tone: direct, no hype.
>
> Slide 1: The problem — open-source tools like python-pptx CAN produce editable
> slides, but out of the box the output is flat and ugly; nothing gives you quality
> design for free.
> Slide 2: What we built — a working API + frontend in a 12-hour sprint with Muse
> Code, zero hand-written code.
> Slide 3: Live proof — this very deck was generated as JSON and rendered to native
> editable PPTX, no PowerPoint involved.
> Slide 4: Powered by Meta's Muse models for structure and copy.
> Slide 5: MIT-licensed, star and fork it today at
> github.com/asoshnin/vwoosh-presentation-maker.
> Slide 6: Roadmap — a template engine with per-slide art direction is next; the
> validated layout geometry is already in the repo.

Then: Generate outline → glance (one factual fix max, else accept) → Generate presentation → open in PowerPoint.

## Actions (camera order)
1. Screen-record the app: paste Prompt A → outline → generate → download.
2. Open the downloaded file in PowerPoint — scroll all 6 slides on camera.
3. Open `winning_deck.pptx` — scroll all 6 slides: *"the template-engine preview."*
4. Talking head (30 s): who, what, MIT link in description.

## Rebuilding this teaser
`python3 build_winning_deck.py` — picks up `images/hero-dark.png` + `images/finale-stage.png`
automatically when present, re-saves `winning_deck.pptx`. Deterministic copy, no API calls.

## Rules tonight
- Key never on screen (lives in `backend/.env`, UI never shows it).
- Backup footage disclosed if used, never presented as live.
- Edit lock 00:30 → upload 01:00 → submit before 03:00 CET.
