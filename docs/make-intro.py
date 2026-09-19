#!/usr/bin/env python3
"""录一支 xy-dsh-lamp 的介绍片：把真实 overlay.html 按状态序列逐步驱动，
以固定帧率逐帧抓取（CSS 动画保持运行，不冻结），最后合成 GIF。

与 make-assets.py 的分工：那个抓 9 个静态状态点、每帧停 1.2s，用来出 PNG 插图；
这里连续录制整段状态流转（含「等你」态的闪烁），用于 README 顶部的动图。

    python3 docs/make-intro.py [webkit|chromium] [scale]
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OVERLAY = ROOT / "xy-dsh-lamp" / "overlay.html"
OUT = ROOT / "docs"
HTML = OVERLAY.read_text(encoding="utf-8")

FLAT = "#e7edf5"
FPS = 10
CANVAS_W, CANVAS_H = 560, 380

STUB = """
window.webkit = { messageHandlers: {
  size: { postMessage: () => {} },
  drag: { postMessage: () => {} } } };
"""

TITLE = "GitHub视频剪辑skill搜索"


def agent(code, state):
    return {"id": code, "code": code, "state": state}


def session(name, agents, state, active="ROOT", title="", elapsed=0):
    return {"id": name, "name": name, "title": title, "state": state,
            "active": active, "elapsedMs": elapsed, "agents": agents}


def snap(sessions, mark, elapsed, title=""):
    agents = [a for s in sessions for a in s["agents"]]
    done = sum(1 for a in agents if a["state"] == "done")
    return {"mode": "work" if agents else "idle", "mark": mark, "note": "ROOT",
            "elapsedMs": elapsed, "count": len(sessions),
            "sessions": sessions, "agents": agents,
            "doneText": f"DONE  {done:02d}/{len(agents):02d}",
            "lang": "zh", "title": title}


def S(name, specs, state, **kw):
    return session(name, [agent(c, s) for c, s in specs], state, **kw)


def state(x, hold):
    return ("state", x, hold)


def click(selector, hold):
    return ("click", selector, hold)


def call(js, hold):
    return ("eval", js, hold)


STORY = [
    state(snap([], "IDLE", 0), 1.5),
    state(snap([S("blog", [("ROOT", "run")], "run", title=TITLE, elapsed=4200)],
               "RUN", 4200, TITLE), 1.7),
    state(snap([S("blog", [("ROOT", "run"), ("A1", "run")], "run", active="A1",
                   title=TITLE, elapsed=9800)], "RUN", 9800, TITLE), 1.7),
    state(snap([S("blog", [("ROOT", "run"), ("A1", "done"), ("A2", "run")], "run",
                   active="A2", title=TITLE, elapsed=21400)],
               "RUN", 21400, TITLE), 1.7),
    # 等你：拉长，让 1s 周期的闪烁被录进去
    state(snap([S("blog", [("ROOT", "run"), ("A1", "done"), ("A2", "wait")], "wait",
                   active="A2", title=TITLE, elapsed=26800)],
               "ASK", 26800, TITLE), 2.6),
    state(snap([S("blog", [("ROOT", "run"), ("A1", "done"), ("A2", "err")], "err",
                   active="A2", title=TITLE, elapsed=30100)],
               "ERR", 30100, TITLE), 2.1),
    state(snap([S("blog", [("ROOT", "done"), ("A1", "done"), ("A2", "done")], "done",
                   title=TITLE, elapsed=34500)],
               "DONE", 34500, TITLE), 2.6),
    # 多项目并行，出错排最上面
    state(snap([
        S("blog", [("ROOT", "run"), ("A1", "wait"), ("A2", "done")], "wait",
          active="A1", title="检查 DeepSeek 显示插件问题", elapsed=26800),
        S("project-learning", [("ROOT", "run")], "run", title="重构抓取脚本", elapsed=74000),
        S("ai_yingji", [("ROOT", "run"), ("A1", "err")], "err", active="A1",
          title="家庭健康档案易读性优化", elapsed=152000),
    ], "ERR", 152000), 2.7),
    # 收起成一个灯
    click("#fold", 2.4),
    # 展开：真实 HUD 里这一步由宿主判定「这是点击不是拖动」后回调页面，
    # 所以这里也走同一个入口，而不是去点 #mini。
    call("window.__lampClick()", 1.6),
    # 切英文
    click("#lang", 2.4),
    # 切回中文
    click("#lang", 1.4),
    # 收起后六个任务就是六盏小灯 —— 展开的六会话有 289px 高，会把整条画布拉大，
    # 所以「多任务」这一格用收起态来演示，只占 82x30。
    click("#fold", 1.0),
    state(snap([
        S("blog", [("ROOT", "run"), ("A1", "run")], "run", active="A1", elapsed=12000),
        S("project-learning", [("ROOT", "run")], "run", elapsed=45000),
        S("ai_yingji", [("ROOT", "wait")], "wait", elapsed=61000),
        S("cybook", [("ROOT", "run"), ("A1", "done")], "run", elapsed=8800),
        S("hermes-pixel", [("ROOT", "done")], "done", elapsed=30000),
        S("tcagent", [("ROOT", "run"), ("A1", "run"), ("A2", "run")], "run",
          active="A2", elapsed=97000),
    ], "RUN", 97000), 2.6),
]


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

    def log_message(self, *a):
        pass


current = {"v": STORY[0][1]}


def page_css(backdrop):
    """HUD 窗口本身透明；背景色代替桌面，阴影代替 macOS 画的投影。"""
    return f"""
    html, body {{ background: {backdrop} !important; }}
    body {{ padding: 26px !important; }}
    .card, .mini {{ box-shadow: inset 0 1px 0 var(--sheen),
                    0 14px 30px rgba(16,26,48,.30) !important; }}
    """


def main(engine="webkit", scale=2):
    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"stub server 127.0.0.1:{port}")

    with sync_playwright() as p:
        browser = getattr(p, engine).launch()
        page = browser.new_page(viewport={"width": CANVAS_W, "height": CANVAS_H},
                                device_scale_factor=scale)
        page.add_init_script(STUB)
        page.goto(f"http://127.0.0.1:{port}/", wait_until="load")
        page.add_style_tag(content=page_css(FLAT))
        page.wait_for_timeout(700)

        frames, durations = [], []

        def grab():
            img = page.screenshot(animations="allow")
            frames.append(Image.open(BytesIO(img)).convert("RGB"))
            durations.append(int(1000 / FPS))

        def record(seconds):
            for _ in range(max(1, int(round(seconds * FPS)))):
                grab()

        probes = []
        for kind, arg, hold in STORY:
            if kind == "state":
                current["v"] = arg
                # Must outlast the page's 400ms /api poll, or the frames that
                # follow still show the previous state.
                page.wait_for_timeout(520)
                label = f"mark={arg['mark']} n={arg['count']}"
            elif kind == "click":
                page.eval_on_selector(arg, "el => el.click()")
                page.wait_for_timeout(200)
                label = f"点击 {arg}"
            else:
                page.evaluate(arg)
                page.wait_for_timeout(200)
                label = f"调用 {arg}"
            record(hold)
            probes.append((label, page.evaluate(
                "() => { const c=document.getElementById('card'), "
                "m=document.getElementById('mini'), l=document.getElementById('lang'); "
                "return {card:!c.hidden, mini:!m.hidden, lang:l.textContent}; }")))
        browser.close()

    print(f"\n抓到 {len(frames)} 帧 / {sum(durations)/1000:.1f}s")
    print("每步之后的真实界面状态：")
    for label, st in probes:
        print(f"  {label:22} -> 卡片={'显示' if st['card'] else '隐藏'} "
              f"小灯={'显示' if st['mini'] else '隐藏'} 语言按钮={st['lang']!r}")

    def card_box(image):
        px = image.load()
        w, h = image.size
        xs, ys = [], []
        for y in range(0, h, 3):
            for x in range(0, w, 3):
                r, g, b = px[x, y]
                if r + g + b < 330:
                    xs.append(x); ys.append(y)
        return (min(xs), min(ys), max(xs), max(ys)) if xs else None

    boxes = [b for b in (card_box(f) for f in frames) if b]
    pad = 26 * scale
    W, H = frames[0].size
    box = (max(0, min(b[0] for b in boxes) - pad),
           max(0, min(b[1] for b in boxes) - pad),
           min(W, max(b[2] for b in boxes) + pad),
           min(H, max(b[3] for b in boxes) + pad))
    print(f"画布 {box[2]-box[0]}x{box[3]-box[1]}")
    frames = [f.crop(box) for f in frames]

    base = frames[0].quantize(colors=128, method=Image.MEDIANCUT)
    rest = [f.quantize(palette=base, dither=Image.NONE) for f in frames[1:]]
    dest = OUT / "lamp-intro.gif"
    base.save(dest, save_all=True, append_images=rest, duration=durations,
              loop=0, optimize=True, disposal=2)
    print(f"lamp-intro.gif: {frames[0].width}x{frames[0].height}, "
          f"{len(frames)} 帧, {dest.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    eng = sys.argv[1] if len(sys.argv) > 1 else "webkit"
    sc = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    main(eng, sc)
