"""Overlay rendering + interaction regression, with the DOM-diff invariant that
the blink and the tooltips depend on."""
import json, sys, threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright

OVERLAY = Path(__file__).resolve().parent.parent / "xy-dsh-lamp" / "overlay.html"
HTML = OVERLAY.read_text(encoding="utf-8")

A = lambda c, s: {"id": c, "code": c, "state": s}
def ses(name, agents, state, active="ROOT", title="", elapsed=1000):
    return {"id": name, "name": name, "title": title, "state": state,
            "active": active, "elapsedMs": elapsed, "agents": agents}
def snap(sessions, mark, elapsed=1000, lang="zh", count=None, title=""):
    return {"mode": "work", "mark": mark, "note": "ROOT", "elapsedMs": elapsed, "lang": lang,
            "title": title, "count": count if count is not None else len(sessions),
            "sessions": sessions, "agents": [a for s in sessions for a in s["agents"]]}

ONE = lambda: snap([ses("blog", [A("ROOT", "run"), A("A1", "done")], "run", title="检查显示插件", elapsed=19000)], "RUN", 19000, title="检查显示插件")
TWO = lambda: snap([ses("blog", [A("ROOT", "run"), A("A1", "wait")], "wait", active="A1"),
                    ses("project-learning", [A("ROOT", "run")], "run")], "ASK")
GROW = lambda: snap([ses("blog", [A("ROOT", "run"), A("A1", "wait"), A("A2", "run")], "run", active="A2")], "RUN")
DONE = lambda: snap([ses("blog", [A("ROOT", "done")], "done"),
                     ses("project-learning", [A("ROOT", "done")], "done")], "DONE", 8400)
LEGACY = {"mode": "work", "mark": "RUN", "note": "ROOT", "elapsedMs": 1000, "lang": "zh",
          "agents": [A("ROOT", "run"), A("A1", "done")], "title": "旧宿主"}

state = {"v": ONE()}
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("Cache-Control", "no-store")
        if self.path.startswith("/api"):
            self.send_header("Content-Type", "application/json; charset=utf-8"); self.end_headers()
            self.wfile.write(json.dumps(state["v"]).encode())
        else:
            self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers()
            self.wfile.write(HTML.encode())
    def log_message(self, *a): pass

srv = HTTPServer(("127.0.0.1", 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{port}/"

STUB = """
window.__msg = []; window.__ids = new WeakMap(); window.__n = 1;
window.webkit = { messageHandlers: {
  size: { postMessage: (m) => window.__msg.push({ ch: 'size', ...m }) },
  drag: { postMessage: (m) => window.__msg.push({ ch: 'drag', ...m }) },
  menu: { postMessage: (m) => window.__msg.push({ ch: 'menu', ...m }) } } };
window.__tag = (el) => { if (!window.__ids.has(el)) window.__ids.set(el, window.__n++); return window.__ids.get(el); };
"""


SIZE_KEYS = {"ch", "w", "h", "collapsed", "bg"}


def size_of(msg, **want):
    """Match the reported fields, and insist the key set is the expected one —
    adding a field to the report should force a deliberate edit here."""
    if msg is None or set(msg.keys()) != SIZE_KEYS:
        return False, f"keys={sorted(msg.keys()) if msg else None}"
    got = {k: msg[k] for k in want}
    return got == want, str(msg)


def collapsed_width(n):
    """One lamp per task: min-width 30, otherwise padding + lamps + gaps."""
    return 30 if n <= 1 else 12 + n * 8 + (n - 1) * 4 + 2

ok = True
def check(label, cond, extra=""):
    global ok
    ok = ok and cond
    print(("OK  " if cond else "FAIL") + f"  {label}  {extra}")

def rows(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('.row')].map(r => ({
      who: r.querySelector('.who')?.textContent ?? null,
      whoShown: r.querySelector('.who') ? getComputedStyle(r.querySelector('.who')).display !== 'none' : false,
      tip: r.querySelector('.who')?.title ?? null,
      codes: [...r.querySelectorAll('.k')].map(k => k.textContent),
      words: [...r.querySelectorAll('.v')].map(v => v.textContent.trim()),
      states: [...r.querySelectorAll('.lamp')].map(l => l.dataset.state),
      lampIds: [...r.querySelectorAll('.lamp')].map(l => window.__tag(l)),
      whoId: r.querySelector('.who') ? window.__tag(r.querySelector('.who')) : null,
    }))""")

def drags(pg): return [m for m in pg.evaluate("() => window.__msg") if m["ch"] == "drag"]
def clear(pg): pg.evaluate("() => { window.__msg.length = 0 }")

with sync_playwright() as p:
    b = p.chromium.launch()

    # --- single session
    state["v"] = ONE()
    pg = b.new_page(viewport={"width": 600, "height": 300}); pg.add_init_script(STUB)
    pg.goto(URL); pg.wait_for_timeout(600)
    r = rows(pg)
    check("one session: named project, two cells",
          len(r) == 1 and r[0]["who"] == "blog" and r[0]["whoShown"]
          and r[0]["codes"] == ["主", "子1"] and r[0]["states"] == ["run", "done"], str(r[0]))
    check("one session: header keeps the agent code", pg.locator("#note").text_content() == "主")
    check("one session: tooltip carries name + title", r[0]["tip"] == "blog · 检查显示插件", r[0]["tip"])

    # --- the DOM-diff invariant: nothing is recreated while only text changes
    pg.evaluate("() => { window.__before = [...document.querySelectorAll('.lamp,.who')].map(e => window.__tag(e)); }")
    state["v"] = snap([ses("blog", [A("ROOT", "run"), A("A1", "run")], "run", title="检查显示插件", elapsed=20000)], "RUN", 20000, title="检查显示插件")
    pg.wait_for_timeout(1500)          # several 400ms polls
    same = pg.evaluate("""() => {
      const now = [...document.querySelectorAll('.lamp,.who')].map(e => window.__tag(e));
      return JSON.stringify(now) === JSON.stringify(window.__before);
    }""")
    check("stable DOM across polls (blink + tooltip depend on this)", same)
    check("text updated in place", rows(pg)[0]["words"] == ["工作中", "工作中"], str(rows(pg)[0]["words"]))

    # --- the wait lamp actually animates
    state["v"] = TWO()
    pg.wait_for_timeout(400)
    ops = pg.evaluate("""async () => {
      const lamp = [...document.querySelectorAll('.lamp')].find(l => l.dataset.state === 'wait');
      const seen = new Set();
      for (let i = 0; i < 25; i++) { seen.add(getComputedStyle(lamp).opacity); await new Promise(r => setTimeout(r, 100)); }
      return [...seen];
    }""")
    check("wait lamp blinks (opacity varies)", len(ops) > 1, str(ops))

    # --- rows grow when a new agent appears (structure change rebuilds)
    state["v"] = GROW()
    pg.wait_for_timeout(500)
    r = rows(pg)
    check("a new agent rebuilds the row", [c for c in r[0]["codes"]] == ["主", "子1", "子2"], str(r[0]["codes"]))

    # --- language switch goes through the diff path
    pg.locator("#lang").click(); pg.wait_for_timeout(300)
    r = rows(pg)
    check("language switch relabels cells",
          r[0]["codes"] == ["ROOT", "A1", "A2"] and r[0]["words"][2] == "RUN", str(r[0]))
    pg.locator("#lang").click(); pg.wait_for_timeout(300)

    # --- two sessions
    state["v"] = TWO()
    pg.wait_for_timeout(500)
    r = rows(pg)
    check("two sessions: two labelled rows",
          len(r) == 2 and [x["who"] for x in r] == ["blog", "project-learning"], str([x["who"] for x in r]))
    check("two sessions: header shows the count", pg.locator("#note").text_content() == "2 个会话",
          pg.locator("#note").text_content())

    # --- drag / click plumbing still intact
    clear(pg)
    box = pg.locator("#head").bounding_box()
    pg.mouse.move(box["x"] + 10, box["y"] + 8); pg.mouse.down()
    for i in range(1, 3): pg.mouse.move(box["x"] + 10 + i * 20, box["y"] + 8)
    pg.mouse.up()
    msgs = drags(pg)
    d = [m["phase"] for m in msgs]
    check("drag starts with start", len(d) > 0 and d[0] == "start", repr(d))
    check("drag ends with end", len(d) > 0 and d[-1] == "end", repr(d))
    check("drag reports at least one move", d.count("move") >= 1, repr(d))
    check("drag reports nothing else", set(d) <= {"start", "move", "end"}, repr(d))
    clear(pg)
    pg.locator("#fold").click(); pg.wait_for_timeout(250)
    mini = pg.evaluate("() => window.__msg.filter(m => m.ch === 'size').at(-1)")
    ok_size, why = size_of(mini, w=collapsed_width(2), h=30, collapsed=True, bg="navy")
    check("fold collapses to one lamp per task (2 tasks)",
          drags(pg) == [] and ok_size, f"{drags(pg)} {why}")
    pg.evaluate("() => window.__lampClick()"); pg.wait_for_timeout(300)
    check("host callback expands again", pg.locator("#card").is_visible())
    pg.close()

    # --- all done with two sessions -> one line
    state["v"] = DONE()
    pg = b.new_page(viewport={"width": 600, "height": 300}); pg.add_init_script(STUB)
    pg.goto(URL); pg.wait_for_timeout(600)
    check("all done: rows hidden, one line",
          pg.locator("#rows").is_hidden() and pg.locator("#mark").text_content() == "完成"
          and pg.locator("#note").text_content() == "02/02",
          f"{pg.locator('#mark').text_content()} {pg.locator('#note').text_content()}")
    # back to work from done must re-render rows
    state["v"] = ONE(); pg.wait_for_timeout(600)
    check("done -> work rebuilds the rows", len(rows(pg)) == 1 and rows(pg)[0]["codes"] == ["主", "子1"])
    pg.close()

    # --- size payload carries the collapsed flag, and the host can restore it
    state["v"] = TWO()
    pg = b.new_page(viewport={"width": 600, "height": 300}); pg.add_init_script(STUB)
    pg.goto(URL); pg.wait_for_timeout(600)
    first = pg.evaluate("() => window.__msg.filter(m => m.ch === 'size').at(-1)")
    check("size report says expanded", first.get("collapsed") is False, str(first))
    pg.evaluate("() => window.__lampSetCollapsed(true)"); pg.wait_for_timeout(250)
    last = pg.evaluate("() => window.__msg.filter(m => m.ch === 'size').at(-1)")
    ok_size, why = size_of(last, w=collapsed_width(2), h=30, collapsed=True, bg="navy")
    check("host can restore the collapsed face", ok_size, why)
    pg.evaluate("() => window.__lampSetCollapsed(false)"); pg.wait_for_timeout(250)
    check("and expand it again", pg.locator("#card").is_visible())

    # --- the collapsed tooltip names every session, not just the first
    pg.evaluate("() => window.__lampSetCollapsed(true)"); pg.wait_for_timeout(250)
    tip = pg.locator("#mini").get_attribute("title")
    check("mini tooltip lists all sessions",
          "blog" in tip and "project-learning" in tip and "2 个会话" in tip, tip)
    pg.evaluate("() => window.__lampSetCollapsed(false)"); pg.wait_for_timeout(200)

    # --- right click defers to the host (an in-page menu would be clipped)
    clear(pg)
    pg.locator("#head").click(button="right"); pg.wait_for_timeout(200)
    check("contextmenu asks the host for a menu",
          [m["ch"] for m in pg.evaluate("() => window.__msg")].count("menu") == 1,
          str(pg.evaluate("() => window.__msg")))
    pg.close()

    # --- older host shape
    state["v"] = LEGACY
    pg = b.new_page(viewport={"width": 600, "height": 300}); pg.add_init_script(STUB)
    pg.goto(URL); pg.wait_for_timeout(600)
    r = rows(pg)
    check("legacy flat snapshot still renders unnamed",
          len(r) == 1 and not r[0]["whoShown"] and r[0]["codes"] == ["主", "子1"], str(r[0]))
    pg.close()
    b.close()

print("RESULT:", "ALL PASS" if ok else "FAILURES")
sys.exit(0 if ok else 1)
