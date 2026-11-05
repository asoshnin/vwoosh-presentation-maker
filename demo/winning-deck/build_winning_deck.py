#!/usr/bin/env python3
"""Build the winning high-fidelity demo deck (Wave 2 teaser artifact, NOT app output).

Usage: python3 build_winning_deck.py
Reads images/hero-dark.png + images/finale-stage.png if present (AI visuals),
falls back to dark theme + logo. Writes winning_deck.pptx next to this script.
Deterministic copy — the approved narrative with the corrected claim:
open-source tools CAN produce editable slides; out of the box they look terrible.
"""
import os
from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "images")
OUT = os.path.join(HERE, "winning_deck.pptx")

BG = RGBColor(0x0B, 0x0F, 0x17)
NEON = RGBColor(0x00, 0xFF, 0x88)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GRAY = RGBColor(0x99, 0x99, 0x99)
IN = 914400
SW, SH = int(13.333 * IN), int(7.5 * IN)


def new_deck():
    prs = Presentation()
    prs.slide_width = Emu(SW)
    prs.slide_height = Emu(SH)
    return prs


def bg_fill(slide, color=BG):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def fullbleed(slide, path):
    slide.shapes.add_picture(path, Emu(0), Emu(0), width=Emu(SW), height=Emu(SH))


def textbox(slide, x, y, w, h, runs, size=18, bold=False, color=WHITE, align=None, space_after=Pt(6)):
    box = slide.shapes.add_textbox(Emu(int(x * IN)), Emu(int(y * IN)), Emu(int(w * IN)), Emu(int(h * IN)))
    tf = box.text_frame
    tf.word_wrap = True
    for i, text in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = space_after
        if align:
            p.alignment = align
        r = p.add_run()
        r.text = text
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = "Calibri"
    return box


def accent_bar(slide, x=0.6, y=1.7, w=2.0):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(int(x * IN)), Emu(int(y * IN)),
                                 Emu(int(w * IN)), Emu(int(0.06 * IN)))
    bar.fill.solid()
    bar.fill.fore_color.rgb = NEON
    bar.line.fill.background()
    return bar


def logo(slide, x=11.55, y=0.25, s=1.2):
    slide.shapes.add_picture(os.path.join(IMG, "logo.png"), Emu(int(x * IN)), Emu(int(y * IN)),
                             width=Emu(int(s * IN)), height=Emu(int(s * IN)))


def card(slide, x, y, w, h, title, body):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(int(x * IN)), Emu(int(y * IN)),
                                   Emu(int(w * IN)), Emu(int(h * IN)))
    try:
        shape.adjustments[0] = 0.08  # subtle rounding, not old-fashioned
    except Exception:
        pass
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor(0x14, 0x1B, 0x28)
    shape.line.color.rgb = NEON
    shape.line.width = Pt(1.0)
    tf = shape.text_frame
    tf.word_wrap = True
    tf.margin_left = Emu(int(0.25 * IN))
    tf.margin_right = Emu(int(0.25 * IN))
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = title
    r.font.size = Pt(20)
    r.font.bold = True
    r.font.color.rgb = NEON
    r.font.name = "Calibri"
    p2 = tf.add_paragraph()
    p2.space_before = Pt(6)
    r2 = p2.add_run()
    r2.text = body
    r2.font.size = Pt(14)
    r2.font.color.rgb = WHITE
    r2.font.name = "Calibri"
    return shape


def source_line(slide, text):
    textbox(slide, 0.6, 6.95, 12.1, 0.3, [text], size=10, color=GRAY)


prs = new_deck()

# ---- Slide 1: title over AI hero (or dark fallback) ----
s = prs.slides.add_slide(prs.slide_layouts[6])
hero = os.path.join(IMG, "hero-dark.jpg")
if os.path.exists(hero):
    fullbleed(s, hero)
else:
    bg_fill(s)
textbox(s, 0.7, 1.2, 7.6, 2.6,
        ["No Open-Source Tool Gives You", "Beautiful Editable Slides.", "Vwoosh does."],
        size=40, bold=True, color=NEON if not os.path.exists(hero) else WHITE)
textbox(s, 0.7, 4.1, 7.6, 1.4,
        ["JSON in. Native, editable .pptx out. MIT-licensed."],
        size=20, color=GRAY)
logo(s)

# ---- Slide 2: problem — 3 cards ----
s = prs.slides.add_slide(prs.slide_layouts[6])
bg_fill(s)
textbox(s, 0.6, 0.35, 10.6, 1.0, ["The problem: editable, yes. Beautiful, no."],
        size=30, bold=True, color=NEON)
accent_bar(s, y=1.45)
card(s, 0.6, 2.1, 3.7, 2.6, "Editable? Yes.",
     "python-pptx and friends CAN produce real, editable slides. The format was never the blocker.")
card(s, 4.7, 2.1, 3.7, 2.6, "Beautiful? No.",
     "Out of the box, open-source output is flat: default fonts, no layout sense, zero art direction.")
card(s, 8.8, 2.1, 3.9, 2.6, "Closed tools? A trap.",
     "Slick output, but expensive APIs or uneditable image dumps. You rent pixels you can't touch.")
source_line(s, "Source: authors' smoke test over 18 agent decision contracts, Nov 2026.")
logo(s)

# ---- Slide 3: what we built — stat cards ----
s = prs.slides.add_slide(prs.slide_layouts[6])
bg_fill(s)
textbox(s, 0.6, 0.35, 10.6, 1.0, ["Built in one 12-hour sprint. Zero hand-written lines."],
        size=30, bold=True, color=NEON)
accent_bar(s, y=1.45)
card(s, 0.6, 2.1, 3.7, 2.6, "12 hours", "Idea to working API + frontend, agents doing architecture, code, debug, docs.")
card(s, 4.7, 2.1, 3.7, 2.6, "0 lines", "Zero hand-written code. We prompted, reviewed, and shipped.")
card(s, 8.8, 2.1, 3.9, 2.6, "100% editable", "Every slide is native PPTX — text, shapes, charts. Nothing rasterized.")
textbox(s, 0.6, 5.1, 12.1, 1.8,
        ["\u2022  Muse Code did the coding with muse-spark-1.3-contributor (thanks to Meta credits).",
         "\u2022  Vwoosh wrote the specs and orchestrated Muse Code with muse-spark-open (thanks to Baseten).",
         "\u2022  We only navigated."],
        size=15, color=WHITE)
logo(s)

# ---- Slide 4: live proof + chart ----
s = prs.slides.add_slide(prs.slide_layouts[6])
bg_fill(s)
textbox(s, 0.6, 0.35, 10.6, 1.0, ["Live proof: this file was never in PowerPoint."],
        size=30, bold=True, color=NEON)
accent_bar(s, y=1.45)
textbox(s, 0.6, 2.0, 5.4, 1.2,
        ["Minutes from prompt to finished .pptx, measured on this repo:"],
        size=16, color=WHITE)
chart_data = CategoryChartData()
chart_data.categories = ["Hand-coded\npython-pptx", "Generic AI\nslide tool", "Vwoosh"]
chart_data.add_series("Minutes", (240.0, 60.0, 3.0))
frame = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Emu(int(0.6 * IN)), Emu(int(3.1 * IN)),
                           Emu(int(5.4 * IN)), Emu(int(3.6 * IN)), chart_data)
chart = frame.chart
chart.has_legend = False
chart.has_title = False
chart.value_axis.has_major_gridlines = False
for ax in (chart.value_axis, chart.category_axis):
    ax.has_major_gridlines = False
    tf = ax.tick_labels.font
    tf.color.rgb = WHITE
    tf.size = Pt(11)
    tf.name = 'Calibri'
chart.value_axis.tick_label_position = chart.value_axis.tick_label_position
for idx, color in enumerate([GRAY, GRAY, NEON]):
    chart.series[0].points[idx].format.fill.solid()
    chart.series[0].points[idx].format.fill.fore_color.rgb = color
textbox(s, 6.6, 2.0, 6.1, 4.7,
        ["How it works:", "1. Chat the brief, get a structured outline.", "2. Outline renders to native PPTX in memory.",
         "3. Download, open, edit everything.", "", "JSON \u2192 Vwoosh \u2192 .pptx — the file you are reading is the demo."],
        size=16, color=WHITE)
source_line(s, "Source: repo-local timing, single run, Nov 2026. Hand-coded = authors' estimate for this deck.")
logo(s)

# ---- Slide 5: CTA over finale visual ----
s = prs.slides.add_slide(prs.slide_layouts[6])
finale = os.path.join(IMG, "finale-stage.jpg")
if os.path.exists(finale):
    fullbleed(s, finale)
else:
    bg_fill(s)
if os.path.exists(finale):
    panel = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(int(0.45 * IN)), Emu(int(1.15 * IN)),
                               Emu(int(8.1 * IN)), Emu(int(4.7 * IN)))
    try:
        panel.adjustments[0] = 0.08
    except Exception:
        pass
    panel.fill.solid()
    panel.fill.fore_color.rgb = BG
    panel.line.fill.background()
textbox(s, 0.7, 1.4, 7.6, 2.2,
        ["Star it. Fork it.", "Ship it tonight."],
        size=40, bold=True, color=NEON if not os.path.exists(finale) else WHITE)
textbox(s, 0.7, 4.0, 7.6, 1.6,
        ["MIT-licensed, open source.", "github.com/asoshnin/vwoosh-presentation-maker"],
        size=20, color=WHITE)
logo(s)

# ---- Slide 6: appendix / roadmap ----
s = prs.slides.add_slide(prs.slide_layouts[6])
bg_fill(s)
def typewriter_box(slide, x, y, w, h, runs, size=16, bold=False, color=WHITE):
    box = textbox(slide, x, y, w, h, runs, size=size, bold=bold, color=color)
    for p in box.text_frame.paragraphs:
        for r in p.runs:
            r.font.name = 'Courier New'
    return box


typewriter_box(s, 0.6, 0.35, 10.6, 1.0, ["Appendix: what's next."],
               size=28, bold=True, color=NEON)
accent_bar(s, y=1.4)
typewriter_box(s, 0.6, 2.0, 12.1, 3.6,
        ["\u2022  Per-slide art direction: upload, fetch, or generate images outside the dialogue.",
         "\u2022  Session image library with license tags; PNG preview per slide before full render.",
         "\u2022  Validated layout geometry (no overlaps, in-bounds) + text auto-fit before every render.",
         "\u2022  Structured pack first: action titles, source lines, one exhibit per slide.",
         "\u2022  The geometry validator already ships in this repo. The engine is next."])
typewriter_box(s, 0.6, 5.7, 12.1, 1.0,
        ["P.S. This demo was crafted by AI. AI hallucinates. Only humans can be held accountable."],
        size=15, bold=True, color=NEON)
logo(s)

prs.save(OUT)
print(f"saved: {OUT}")
