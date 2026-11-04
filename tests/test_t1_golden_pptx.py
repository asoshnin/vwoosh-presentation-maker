"""Sprint 02 (P0-5) T1 — golden PPTX structural test (pytest).

Generates a deck via the live backend (POST /api/generate-presentation, no LLM
involved) from tests/fixtures/golden_outline.json, opens it with python-pptx,
and asserts STRUCTURE only: slide count, per-slide title, bullet presence,
logo picture. Never byte-compares (.pptx embeds timestamps/ids).
"""

import json
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

ROOT = Path(__file__).resolve().parent.parent
BACKEND_URL = "http://127.0.0.1:3002"


def _wait_for_health(proc: subprocess.Popen, timeout_s: float = 30.0) -> None:
    deadline = time.time() + timeout_s
    last_err = "not attempted"
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"backend exited early (code {proc.returncode})")
        try:
            with urllib.request.urlopen(f"{BACKEND_URL}/healthz", timeout=2) as res:
                if res.status == 200:
                    return
                last_err = f"HTTP {res.status}"
        except Exception as exc:  # noqa: BLE001 - boot polling
            last_err = str(exc)
        time.sleep(0.2)
    raise RuntimeError(f"backend not healthy within {timeout_s}s ({last_err})")


@pytest.fixture(scope="module")
def backend():
    proc = subprocess.Popen(
        ["node", "backend/auth-server.js"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_for_health(proc)
        yield BACKEND_URL
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)


def _load_fixtures():
    outline = json.loads((ROOT / "tests/fixtures/golden_outline.json").read_text())
    brandkits = json.loads((ROOT / "tests/fixtures/golden_brandkits.json").read_text())
    return outline, brandkits


def _generate(base_url: str, outline: dict, brand_kit: dict) -> bytes:
    payload = json.dumps({"outline": outline, "brandKit": brand_kit}).encode()
    req = urllib.request.Request(
        f"{base_url}/api/generate-presentation",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        assert res.status == 200, f"expected 200, got {res.status}"
        ctype = res.headers.get("Content-Type", "")
        assert "presentationml.presentation" in ctype, f"unexpected content-type: {ctype}"
        return res.read()


def _text_shapes(slide):
    return [s for s in slide.shapes if s.has_text_frame]


def test_golden_pptx_structure_plain_brandkit(backend, tmp_path):
    """Slide count + per-slide title + bullets from the golden outline."""
    outline, brandkits = _load_fixtures()
    blob = _generate(backend, outline, brandkits["plain"])
    assert len(blob) > 1024, "empty-looking pptx payload"

    pptx_path = tmp_path / "golden-plain.pptx"
    pptx_path.write_bytes(blob)
    prs = Presentation(str(pptx_path))

    # 1. slide count matches the outline
    assert len(prs.slides) == len(outline["slides"]), (
        f"expected {len(outline['slides'])} slides, got {len(prs.slides)}"
    )

    for i, slide_data in enumerate(outline["slides"]):
        slide = prs.slides[i]
        texts = [s.text for s in _text_shapes(slide)]

        # 2. a title shape carries the outline title
        assert any(slide_data["title"] in t for t in texts), (
            f"slide {i}: title {slide_data['title']!r} not found in {texts!r}"
        )

        # 3. a bullet shape carries every content line with >=1 paragraph
        lines = [ln.strip() for ln in slide_data["content"].split("\n") if ln.strip()]
        assert lines, f"slide {i}: fixture content is empty"
        bullet_shapes = [s for s in _text_shapes(slide) if all(ln in s.text for ln in lines)]
        assert bullet_shapes, f"slide {i}: no shape contains all content lines {lines!r}"
        paras = [p for p in bullet_shapes[0].text_frame.paragraphs if p.text.strip()]
        assert len(paras) >= 1, f"slide {i}: bullet shape has no paragraphs"


def test_golden_pptx_logo_brandkit_embeds_picture(backend, tmp_path):
    """With brandKit.logo set, each slide carries a picture shape."""
    outline, brandkits = _load_fixtures()
    blob = _generate(backend, outline, brandkits["pngLogo"])

    pptx_path = tmp_path / "golden-logo.pptx"
    pptx_path.write_bytes(blob)
    prs = Presentation(str(pptx_path))

    assert len(prs.slides) == len(outline["slides"])
    for i, slide in enumerate(prs.slides):
        pics = [s for s in slide.shapes if s.shape_type == MSO_SHAPE_TYPE.PICTURE]
        assert len(pics) >= 1, f"slide {i}: expected >=1 picture with logo brandKit"
