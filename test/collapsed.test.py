import json, threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright
HTML = (Path(__file__).resolve().parent.parent / "xy-dsh-lamp" / "overlay.html").read_text(encoding="utf-8")
A = lambda c, s: {"id": c, "code": c, "state": s}
def ses(n, agents, state, active="ROOT", title=""):
    return {"id": n, "name": n, "title": title, "state": state, "active": active,
            "elapsedMs": 1000, "agents": agents}
def snap(sessions, mark, count=None):
    return {"mode":"work","mark":mark,"note":"ROOT","elapsedMs":1000,"lang":"zh",
            "count": count if count is not None else len(sessions), "sessions":sessions,
            "agents":[a for s in sessions for a in s["agents"]]}
ONE = snap([ses("blog",[A("ROOT","run")],"run")], "RUN")
THREE = snap([ses("blog",[A("ROOT","run"),A("A1","wait")],"wait",active="A1"),
              ses("project-learning",[A("ROOT","run")],"run"),
              ses("ai_yingji",[A("ROOT","done")],"done")], "ASK")
SIX = snap([ses(f"p{i}",[A("ROOT","run")],"run") for i in range(6)], "RUN", count=9)
IDLE = snap([], "IDLE")
cur={"v":ONE}
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("Cache-Control","no-store")
        if self.path.startswith("/api"):
            self.send_header("Content-Type","application/json"); self.end_headers(); self.wfile.write(json.dumps(cur["v"]).encode())
        else:
            self.send_header("Content-Type","text/html; charset=utf-8"); self.end_headers(); self.wfile.write(HTML.encode())
    def log_message(self,*a): pass
srv=HTTPServer(("127.0.0.1",0),H); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
STUB="""window.__msg=[];window.webkit={messageHandlers:{
 size:{postMessage:(m)=>window.__msg.push({ch:'size',...m})},
 drag:{postMessage:(m)=>window.__msg.push({ch:'drag',...m})},
 menu:{postMessage:(m)=>window.__msg.push({ch:'menu',...m})},
 quit:{postMessage:(m)=>window.__msg.push({ch:'quit',...m})}}};"""
ok=True
def check(l,c,e=""):
    global ok; ok = ok and c
    print(("OK  " if c else "FAIL")+f"  {l}  {e}")
with sync_playwright() as p:
    b=p.chromium.launch()
    for name, s, expect in [("1 会话",ONE,1),("3 会话",THREE,3),("6 会话",SIX,6),("无会话",IDLE,1)]:
        cur["v"]=s
        pg=b.new_page(viewport={"width":700,"height":300}); pg.add_init_script(STUB)
        pg.goto(f"http://127.0.0.1:{port}/"); pg.wait_for_timeout(650)
        pg.evaluate("() => document.getElementById('fold').click()"); pg.wait_for_timeout(300)
        lamps=pg.evaluate("() => [...document.querySelectorAll('#mini .lamp')].map(l=>l.dataset.state)")
        size=pg.evaluate("() => window.__msg.filter(m=>m.ch==='size').at(-1)")
        check(f"{name}：收起后 {expect} 盏灯", len(lamps)==expect, f"lamps={lamps} size={size}")
        want_w = 30 if expect == 1 else 12 + expect * 8 + (expect - 1) * 4 + 2
        check(f"{name}：窗口宽度跟着灯数走",
              abs(size["w"] - want_w) <= 2 and size["h"] == 30, f"w={size['w']} 期望≈{want_w}")
        overflow = pg.evaluate("""() => { const m = document.getElementById('mini');
          return m.scrollWidth - m.clientWidth; }""")
        check(f"{name}：小灯没有溢出被裁", overflow <= 0, f"溢出 {overflow}px")
        if name=="3 会话":
            check("灯的顺序与行序一致（出错→等你→工作中→完成）", lamps==["wait","run","done"], str(lamps))
            # the blink must survive the 400ms poll here too
            ops=pg.evaluate("""async () => {
              const l=[...document.querySelectorAll('#mini .lamp')].find(x=>x.dataset.state==='wait');
              const s=new Set(); for(let i=0;i<22;i++){s.add(getComputedStyle(l).opacity); await new Promise(r=>setTimeout(r,100));}
              return [...s]; }""")
            check("收起态里等你灯也在闪", len(ops)>1, str(ops))
        if name=="6 会话":
            check("6 盏时提示仍列出全部会话", "p0" in pg.locator("#mini").get_attribute("title"), pg.locator("#mini").get_attribute("title")[:60])
        pg.close()

    # quit button: two clicks, and it must not start a drag
    cur["v"]=ONE
    pg=b.new_page(viewport={"width":700,"height":300}); pg.add_init_script(STUB)
    pg.goto(f"http://127.0.0.1:{port}/"); pg.wait_for_timeout(650)
    check("关闭按钮是可见的", pg.locator("#quit").is_visible(), pg.locator("#quit").text_content())
    check("默认带退出提示", pg.locator("#quit").get_attribute("title")=="退出灯板", pg.locator("#quit").get_attribute("title"))
    pg.evaluate("() => { window.__msg.length = 0 }")
    pg.locator("#quit").click(); pg.wait_for_timeout(200)
    d=[m["ch"] for m in pg.evaluate("() => window.__msg")]
    check("第一次点击不退出，进入确认态",
          "quit" not in d and pg.locator("#quit").text_content()=="确认" and pg.locator("#quit").get_attribute("data-armed")=="1",
          f"{d} {pg.locator('#quit').text_content()}")
    check("确认态不触发拖拽", "drag" not in d, str(d))
    pg.locator("#quit").click(); pg.wait_for_timeout(200)
    check("第二次点击才退出", [m["ch"] for m in pg.evaluate("() => window.__msg")].count("quit")==1,
          str(pg.evaluate("() => window.__msg")))
    # arming expires
    pg.reload(); pg.wait_for_timeout(650)
    pg.locator("#quit").click(); pg.wait_for_timeout(3200)
    check("3 秒后自动退出确认态", pg.locator("#quit").text_content()=="×", pg.locator("#quit").text_content())
    pg.locator("#quit").click(); pg.wait_for_timeout(200)
    check("过期后第一次点击不会直接退出",
          [m["ch"] for m in pg.evaluate("() => window.__msg")].count("quit")==0)
    pg.close(); b.close()
print("RESULT:", "ALL PASS" if ok else "FAILURES")
