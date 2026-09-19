#!/usr/bin/env python3
"""Regenerate the README images from the real overlay.html.

Every image in this directory is rendered from xy-dsh-lamp/overlay.html by a
real browser engine in front of a controlled backdrop — nothing is hand-drawn
and nothing is a screen recording, so no desktop content can leak in and the
result is reproducible.

    pip install playwright pillow
    python -m playwright install webkit
    python docs/make-assets.py            # or: chromium
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OVERLAY = ROOT / "xy-dsh-lamp" / "overlay.html"
OUT = ROOT / "docs"

HTML = OVERLAY.read_text(encoding="utf-8")

GRADIENT = "linear-gradient(163deg, #dde6f3 0%, #eef3fa 46%, #d8e1ee 100%)"
FLAT = "#e7edf5"           # flat keeps the GIF palette small
BACKDROP_RGB = (231, 237, 245)
CANVAS_W, CANVAS_H = 392, 140   # animation canvas: widest frame + padding + shadow room


def agent(code, state):
    return {"id": code, "code": code, "state": state}


def session(name, agents, state, active="ROOT", title="", elapsed=0):
    return {"id": name, "name": name, "title": title, "state": state,
            "active": active, "elapsedMs": elapsed, "agents": agents}


def snap(sessions, mark, elapsed, lang="zh", count=None, title=""):
    return {"mode": "work", "mark": mark, "note": "ROOT", "elapsedMs": elapsed, "lang": lang,
            "title": title, "count": count if count is not None else len(sessions),
            "sessions": sessions,
            "agents": [a for s in sessions for a in s["agents"]]}


TITLE = "检查 DeepSeek 显示插件问题"

# The animation: one session from idle to done, then collapsed to a single lamp.
STORY = [
    (snap([], "IDLE", 0, title=TITLE), 900),
    (snap([session("blog", [agent("ROOT", "run")], "run", title=TITLE, elapsed=4200)], "RUN", 4200, title=TITLE), 900),
    (snap([session("blog", [agent("ROOT", "run"), agent("A1", "run")], "run", active="A1", title=TITLE, elapsed=9800)], "RUN", 9800, title=TITLE), 1000),
    (snap([session("blog", [agent("ROOT", "run"), agent("A1", "done"), agent("A2", "run")], "run", active="A2", title=TITLE, elapsed=21400)], "RUN", 21400, title=TITLE), 1000),
    (snap([session("blog", [agent("ROOT", "run"), agent("A1", "done"), agent("A2", "wait")], "wait", active="A2", title=TITLE, elapsed=26800)], "ASK", 26800, title=TITLE), 1300),
    (snap([session("blog", [agent("ROOT", "run"), agent("A1", "done"), agent("A2", "err")], "err", active="A2", title=TITLE, elapsed=30100)], "ERR", 30100, title=TITLE), 1300),
    (snap([session("blog", [agent("ROOT", "done"), agent("A1", "done"), agent("A2", "done")], "done", title=TITLE, elapsed=34500)], "DONE", 34500, title=TITLE), 3400),
    (snap([], "IDLE", 0, title=TITLE), 1200),
]

# Several projects with a main agent each — the case a single-focus board missed.
SESSIONS = snap([
    session("blog", [agent("ROOT", "run"), agent("A1", "wait"), agent("A2", "done")], "wait",
            active="A1", title="检查 DeepSeek 显示插件问题", elapsed=26800),
    session("project-learning", [agent("ROOT", "run")], "run",
            title="重构抓取脚本", elapsed=74000),
    session("ai_yingji", [agent("ROOT", "run"), agent("A1", "err")], "err",
            active="A1", title="家庭健康档案易读性优化", elapsed=152000),
], "ERR", 152000)

current = {"v": STORY[0][0]}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Cache-Control", "no-store")
        if self.path.startswith("/api"):
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(current["v"]).encode())
        else:
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode())

    def log_message(self, *args):
        pass


STUB = """
window.webkit = { messageHandlers: {
  size: { postMessage: () => {} },
  drag: { postMessage: () => {} } } };
"""


def page_css(backdrop):
    # The HUD window itself is transparent; here the backdrop stands in for the
    # desktop, and the drop shadow stands in for the one macOS draws.
    return f"""
    html, body {{ background: {backdrop} !important; }}
    body {{ padding: 26px !important; }}
    .card, .mini {{ box-shadow: inset 0 1px 0 var(--sheen), 0 14px 30px rgba(16,26,48,.30) !important; }}
    """


def shoot(page, path, canvas=None, collapse=False):
    page.set_viewport_size(canvas or {"width": 560, "height": 360})
    page.wait_for_timeout(500)
    if collapse:
        page.evaluate("() => document.getElementById('fold').click()")
        page.wait_for_timeout(300)
    page.screenshot(path=str(path))


def card_box(image):
    """Bounding box of the near-black board, ignoring the soft shadow."""
    px = image.load()
    w, h = image.size
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if r + g + b < 330:
                xs.append(x)
                ys.append(y)
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def trim(src, dest, pad=30):
    image = Image.open(src).convert("RGB")
    box = card_box(image)
    if box is None:
        image.save(dest)
        return image
    w, h = image.size
    cropped = image.crop((max(0, box[0] - pad), max(0, box[1] - pad),
                          min(w, box[2] + pad), min(h, box[3] + pad)))
    cropped.save(dest)
    print(f"  {Path(dest).name}: {cropped.width}x{cropped.height}")
    return cropped


def new_page(browser, engine, scale, backdrop):
    page = browser.new_page(viewport={"width": 560, "height": 360}, device_scale_factor=scale)
    page.add_init_script(STUB)
    page.goto(url)
    page.wait_for_timeout(600)
    page.add_style_tag(content=page_css(backdrop))
    return page


# A pretend desktop behind the board, so the translucent option is visible.
DESKTOP = ("repeating-linear-gradient(115deg,#2d4a63 0 42px,#33536e 42px 84px),"
           "radial-gradient(600px 300px at 20% 10%, #4f7fa8, transparent 70%)")

BACKGROUNDS = ["navy", "black", "slate", "glass", "light"]


def shoot_backgrounds(browser, scale):
    """One sheet with every background choice, over a stand-in desktop."""
    tiles = []
    for bg in BACKGROUNDS:
        page = browser.new_page(viewport={"width": 420, "height": 150}, device_scale_factor=scale)
        page.add_init_script(STUB + f'window.__lampInitialBg = "{bg}";')
        page.goto(url)
        page.wait_for_timeout(650)
        page.add_style_tag(content=(
            f"html,body{{background:{DESKTOP} !important}}"
            "body{padding:20px !important}"
            ".card,.mini{box-shadow:inset 0 1px 0 var(--sheen),0 14px 28px rgba(0,0,0,.45) !important}"))
        page.wait_for_timeout(250)
        tmp = Path(f"/tmp/xy-dsh-bg-{bg}.png")
        page.screenshot(path=str(tmp))
        page.close()
        tiles.append(Image.open(tmp).convert("RGB"))

    def crop(image, pad=26):
        px = image.load()
        xs, ys = [], []
        for y in range(0, image.height, 2):
            for x in range(0, image.width, 2):
                r, g, b = px[x, y]
                if r + g + b < 300:            # the board, not the desktop backdrop
                    xs.append(x)
                    ys.append(y)
        if not xs:
            return image
        return image.crop((max(0, min(xs) - pad), max(0, min(ys) - pad),
                           min(image.width, max(xs) + pad), min(image.height, max(ys) + pad)))

    tiles = [crop(t) for t in tiles]
    w = max(t.width for t in tiles)
    h = max(t.height for t in tiles)
    cols = 2
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w + (cols + 1) * 10, rows * h + (rows + 1) * 10), (40, 58, 76))
    for i, tile in enumerate(tiles):
        r, c = divmod(i, cols)
        sheet.paste(tile, (10 + c * (w + 10), 10 + r * (h + 10)))
    sheet.save(OUT / "lamp-backgrounds.png")
    print(f"  lamp-backgrounds.png: {sheet.width}x{sheet.height}")


def main(engine, scale):
    global url
    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}/"

    with sync_playwright() as p:
        browser = getattr(p, engine).launch()

        page = new_page(browser, engine, scale, GRADIENT)
        current["v"] = SESSIONS
        tmp = Path("/tmp/xy-dsh-sessions.png")
        shoot(page, tmp)
        trim(tmp, OUT / "lamp-sessions.png", pad=30)
        page.close()

        shots = []
        for lang in ("zh", "en"):
            page = new_page(browser, engine, scale, GRADIENT)
            current["v"] = {**SESSIONS, "lang": lang}
            tmp = Path(f"/tmp/xy-dsh-lang-{lang}.png")
            shoot(page, tmp)
            shots.append(trim(tmp, tmp, pad=30))
            page.close()
        gap = 18 * scale
        combo = Image.new("RGB", (max(i.width for i in shots),
                                  sum(i.height for i in shots) + gap), BACKDROP_RGB)
        y = 0
        for image in shots:
            combo.paste(image, (0, y))
            y += image.height + gap
        combo.save(OUT / "lamp-lang.png")
        print(f"  lamp-lang.png: {combo.width}x{combo.height}")

        current["v"] = SESSIONS
        shoot_backgrounds(browser, scale)

        page = new_page(browser, engine, scale, FLAT)
        frames, durations = [], []
        for i, (state, duration) in enumerate(STORY):
            current["v"] = state
            tmp = Path(f"/tmp/xy-dsh-frame-{i}.png")
            shoot(page, tmp, canvas={"width": CANVAS_W, "height": CANVAS_H})
            frames.append(Image.open(tmp).convert("RGB"))
            durations.append(duration)
        current["v"] = STORY[0][0]
        tmp = Path("/tmp/xy-dsh-frame-mini.png")
        shoot(page, tmp, canvas={"width": CANVAS_W, "height": CANVAS_H}, collapse=True)
        frames.insert(-1, Image.open(tmp).convert("RGB"))
        durations.insert(-1, 1800)
        page.close()
        browser.close()

    # Crop every frame to the union of the board boxes: the board is pinned to
    # the top-left like the real window, so one fixed rect fits them all.
    boxes = [b for b in (card_box(f) for f in frames) if b]
    pad = 30 * scale
    w, h = frames[0].size
    box = (max(0, min(b[0] for b in boxes) - pad), max(0, min(b[1] for b in boxes) - pad),
           min(w, max(b[2] for b in boxes) + pad), min(h, max(b[3] for b in boxes) + pad))
    frames = [f.crop(box) for f in frames]
    print(f"  gif canvas: {box[2] - box[0]}x{box[3] - box[1]}")

    base = frames[0].quantize(colors=128, method=Image.MEDIANCUT)
    rest = [f.quantize(palette=base, dither=Image.NONE) for f in frames[1:]]
    base.save(OUT / "lamp.gif", save_all=True, append_images=rest,
              duration=durations, loop=0, optimize=True, disposal=2)
    print(f"  lamp.gif: {frames[0].width}x{frames[0].height}, {len(frames)} frames")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "webkit",
         int(sys.argv[2]) if len(sys.argv) > 2 else 2)
