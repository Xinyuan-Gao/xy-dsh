"""Background choices: injected before the page runs, switchable at runtime,
reported back to the host for persistence, and never applied when unknown."""
import json, sys, threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright
HTML = (Path(__file__).resolve().parent.parent / "xy-dsh-lamp" / "overlay.html").read_text(encoding="utf-8")
A = lambda c,s: {"id":c,"code":c,"state":s}
S = {"mode":"work","mark":"ASK","note":"A1","elapsedMs":26000,"lang":"zh","count":2,
     "sessions":[{"id":"blog","name":"blog","title":"检查显示插件","state":"wait","active":"A1","elapsedMs":26000,
                  "agents":[A("ROOT","run"),A("A1","wait")]},
                 {"id":"proj","name":"project-learning","title":"重构抓取脚本","state":"err","active":"ROOT","elapsedMs":74000,
                  "agents":[A("ROOT","err")]}],
     "agents":[A("ROOT","run"),A("A1","wait"),A("ROOT","err")]}
cur={"v":S}
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
DEFAULT_BG = "rgb(10, 14, 26)"
def bgs_differs(actual, bg):
    return actual != DEFAULT_BG if bg != "navy" else actual == DEFAULT_BG

BGS=["navy","black","slate","glass","light"]
with sync_playwright() as p:
    b=p.chromium.launch()
    # smoke: the page script must evaluate and both host hooks must exist
    pg=b.new_page(viewport={"width":700,"height":300}); pg.add_init_script(STUB + 'window.__lampInitialBg = "navy";')
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://127.0.0.1:{port}/"); pg.wait_for_timeout(700)
    check("页面脚本无异常", not errs, str(errs[:1]))
    check("两个宿主钩子都在",
          pg.evaluate("() => typeof window.__lampSetBg === 'function' && typeof window.__lampSetCollapsed === 'function' && typeof window.__lampClick === 'function'"))
    check("画面确实渲染了", pg.locator(".row").count() == 2, str(pg.locator(".row").count()))
    pg.close()

    # start with an injected non-default background
    for bg in BGS:
        pg=b.new_page(viewport={"width":700,"height":300}, device_scale_factor=2)
        pg.add_init_script(STUB + f'window.__lampInitialBg = "{bg}";')
        pg.goto(f"http://127.0.0.1:{port}/"); pg.wait_for_timeout(650)
        got=pg.evaluate("() => document.body.dataset.bg")
        rep=pg.evaluate("() => window.__msg.filter(m=>m.ch==='size').at(-1)")
        card=pg.evaluate("""() => { const c=document.getElementById('card');
          const s=getComputedStyle(c); return {bg:s.backgroundColor, ink:getComputedStyle(document.getElementById('mark')).color}; }""")
        check(f"{bg}：注入即生效（首帧就是它）", got==bg, f"data-bg={got}")
        check(f"{bg}：尺寸报告带上背景", rep and rep.get("bg")==bg, str(rep))
        check(f"{bg}：卡片背景确实变了", bgs_differs(card["bg"], bg), f"{card['bg']} ink={card['ink']}")
        pg.close()
    # switching at runtime announces itself
    pg=b.new_page(viewport={"width":700,"height":300}); pg.add_init_script(STUB + 'window.__lampInitialBg = "navy";')
    pg.goto(f"http://127.0.0.1:{port}/"); pg.wait_for_timeout(650)
    pg.evaluate("() => { window.__msg.length = 0 }")
    pg.evaluate("() => window.__lampSetBg('glass')"); pg.wait_for_timeout(250)
    rep=pg.evaluate("() => window.__msg.filter(m=>m.ch==='size').at(-1)")
    check("运行中切换会回报给宿主", rep and rep.get("bg")=="glass" and pg.evaluate("() => document.body.dataset.bg")=="glass", str(rep))
    pg.evaluate("() => window.__lampSetBg('nonsense')"); pg.wait_for_timeout(200)
    check("非法背景被忽略", pg.evaluate("() => document.body.dataset.bg")=="glass")
    check("宿主的菜单项清单由页面提供",
          pg.evaluate("() => window.__lampBackgrounds.map(b=>b[0]).join(',')")=="navy,black,slate,glass,light",
          pg.evaluate("() => JSON.stringify(window.__lampBackgrounds)"))
    pg.close(); b.close()
print("RESULT:", "ALL PASS" if ok else "FAILURES")
sys.exit(0 if ok else 1)