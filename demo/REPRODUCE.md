# Reproduce the demo deck — content edition

Paste the prompt below into the app chat (`http://localhost:3001`), then
**Step 1: Generate outline → Step 2: Generate presentation**.
You will get the same 6 slides, same titles, same bullets as the closing
teaser (`winning-deck/winning_deck.pptx`) — rendered in the engine's default
styling (title + bullets + logo). The teaser's art direction (cards, chart,
full-bleed AI visuals, typewriter appendix) is the manual/template layer
previewed in Act 5, reproducible via `build_winning_deck.py`.

## The prompt (verbatim)

> Create a 6-slide pitch deck for Vwoosh, an open-source engine that turns structured JSON into truly editable PPTX. Audience: hackathon judges. Tone: direct, no hype. Use these exact slide titles and keep each slide content close to the given points:
>
> Slide 1 title: No Open-Source Tool Gives You Beautiful Editable Slides. Vwoosh does. Points: JSON in. Native, editable .pptx out. MIT-licensed.
>
> Slide 2 title: The problem: editable, yes. Beautiful, no. Points: python-pptx and friends CAN produce real, editable slides, the format was never the blocker; Out of the box, open-source output is flat: default fonts, no layout sense, zero art direction; Slick output, but expensive APIs or uneditable image dumps. You rent pixels you can touch.
>
> Slide 3 title: Built in one 12-hour sprint. Zero hand-written lines. Points: 12 hours from idea to working API plus frontend with agents doing architecture, code, debug, docs; Zero hand-written code, we prompted, reviewed, shipped; Every slide is native PPTX, text, shapes, charts, nothing rasterized; Muse Code did the coding with muse-spark-1.3-contributor thanks to Meta credits; Vwoosh wrote specs and orchestrated Muse Code with muse-spark-open thanks to Baseten; We only navigated.
>
> Slide 4 title: Live proof: this file was never in PowerPoint. Points: Prompt to finished pptx in minutes: hand-coded python-pptx 240, generic AI slide tool 60, Vwoosh 3; Chat the brief, get a structured outline; Outline renders to native PPTX in memory; Download, open, edit everything.
>
> Slide 5 title: Star it. Fork it. Ship it tonight. Points: MIT-licensed, open source; github.com/asoshnin/vwoosh-presentation-maker.
>
> Slide 6 title: Appendix: what is next. Points: Per-slide art direction with uploaded, fetched or generated images; Session image library with license tags and PNG preview per slide; Validated layout geometry plus text auto-fit before every render; Structured pack first: action titles, source lines, one exhibit per slide; P.S. This demo was crafted by AI. AI hallucinates. Only humans can be held accountable.

## Verified 2026-11-05

Run through `/api/generate-outline` with `muse-spark-1.3`: all 6 titles verbatim,
all bullet sets preserved (56–417 chars/slide). No follow-up prompts needed —
one shot. Model output varies slightly run to run; titles are stable, bullet
wording may paraphrase.
