import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  var url: URL!
  var fails = 0
  var revealed = false

  /// Live drag gesture reported by the page. Only the host can measure it: the
  /// window follows the pointer, so the page's own coordinates barely move.
  private var dragLast: NSPoint?
  private var dragTravel: CGFloat = 0

  /// A gesture shorter than this (in points) is a click, not a drag.
  private let clickSlop: CGFloat = 4

  private let minSize = NSSize(width: 26, height: 24)
  private let maxSize = NSSize(width: 760, height: 420)

  func applicationDidFinishLaunching(_ notification: Notification) {
    guard CommandLine.arguments.count > 1, let page = URL(string: CommandLine.arguments[1]) else {
      NSApp.terminate(nil)
      return
    }
    url = page

    // Provisional size; the page reports its real content size right after load.
    let start = NSSize(width: 176, height: 65)
    let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 40, y: 40, width: 800, height: 600)
    let rect = NSRect(
      x: screen.minX + 12,
      y: screen.maxY - start.height - 12,
      width: start.width,
      height: start.height
    )

    window = NSWindow(
      contentRect: rect,
      styleMask: [.borderless],
      backing: .buffered,
      defer: false
    )
    // Transparent so the rounded card in the page is the whole window shape,
    // and the system shadow follows that shape instead of a hard rectangle.
    window.isOpaque = false
    window.backgroundColor = .clear
    window.hasShadow = true
    window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.statusWindow)))
    window.collectionBehavior = [
      .canJoinAllSpaces,
      .fullScreenAuxiliary,
      .stationary,
      .ignoresCycle,
    ]
    window.hidesOnDeactivate = false
    // AppKit's own drag machinery (performDrag / movable-by-background) does
    // nothing for this borderless transparent window, so the page drives the
    // window position instead — see the "drag" message below.
    window.isMovable = false
    window.isMovableByWindowBackground = false
    window.isReleasedWhenClosed = false
    window.title = "DSH LAMP"
    window.alphaValue = 0

    let root = NSView(frame: NSRect(origin: .zero, size: rect.size))
    root.autoresizingMask = [.width, .height]

    let config = WKWebViewConfiguration()
    config.userContentController.add(self, name: "size")
    config.userContentController.add(self, name: "drag")
    config.suppressesIncrementalRendering = true

    web = WKWebView(frame: root.bounds, configuration: config)
    web.autoresizingMask = [.width, .height]
    web.navigationDelegate = self
    web.setValue(false, forKey: "drawsBackground")
    web.load(URLRequest(url: page, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5))

    root.addSubview(web)
    window.contentView = root
    window.orderFrontRegardless()

    Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
      self?.watch()
    }
    // Never stay invisible if the page fails to report a size.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
      self?.reveal()
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    let controller = web?.configuration.userContentController
    controller?.removeScriptMessageHandler(forName: "size")
    controller?.removeScriptMessageHandler(forName: "drag")
  }

  private func reveal() {
    guard !revealed else { return }
    revealed = true
    NSAnimationContext.runAnimationGroup { ctx in
      ctx.duration = 0.12
      window.animator().alphaValue = 1
    }
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any] else { return }
    switch message.name {
    case "size": applySize(body)
    case "drag": applyDrag(body)
    default: break
    }
  }

  /// The page posts `{ w, h }` whenever its natural content size changes.
  private func applySize(_ body: [String: Any]) {
    guard let w = (body["w"] as? NSNumber)?.doubleValue,
      let h = (body["h"] as? NSNumber)?.doubleValue
    else { return }
    let width = min(max(CGFloat(w).rounded(), minSize.width), maxSize.width)
    let height = min(max(CGFloat(h).rounded(), minSize.height), maxSize.height)
    let frame = window.frame
    if abs(frame.width - width) < 0.5 && abs(frame.height - height) < 0.5 {
      reveal()
      return
    }
    // Resize keeping the TOP-LEFT corner pinned, so growing cells extend
    // rightward/downward instead of shoving the board around.
    window.setFrame(
      NSRect(x: frame.minX, y: frame.maxY - height, width: width, height: height),
      display: true
    )
    window.invalidateShadow()
    reveal()
  }

  /// The page posts `{ phase: start|move|end }` and nothing else: this WKWebView
  /// reports window.screenX/screenY as garbage, so the position comes from
  /// AppKit's own cursor reading instead. Deltas are incremental, which keeps
  /// the drag correct even when the window is resized mid-gesture (expanding the
  /// collapsed lamp changes its height, and therefore its origin).
  private func applyDrag(_ body: [String: Any]) {
    let now = NSEvent.mouseLocation
    switch body["phase"] as? String ?? "end" {
    case "start":
      dragLast = now
      dragTravel = 0
    case "move":
      guard let last = dragLast else { return }
      dragLast = now
      let dx = now.x - last.x
      let dy = now.y - last.y
      dragTravel += abs(dx) + abs(dy)
      if dx != 0 || dy != 0 {
        window.setFrameOrigin(
          NSPoint(x: window.frame.minX + dx, y: window.frame.minY + dy))
      }
    default:
      let wasClick = dragTravel < clickSlop
      dragLast = nil
      dragTravel = 0
      // A tap on the collapsed lamp expands it; a drag only moves it.
      if wasClick { web.evaluateJavaScript("window.__lampClick && window.__lampClick()") }
    }
  }

  func watch() {
    var req = URLRequest(url: url.appendingPathComponent("api"))
    req.cachePolicy = .reloadIgnoringLocalCacheData
    req.timeoutInterval = 2
    URLSession.shared.dataTask(with: req) { [weak self] _, response, error in
      let ok = error == nil && ((response as? HTTPURLResponse)?.statusCode ?? 0) < 400
      DispatchQueue.main.async {
        if ok {
          self?.fails = 0
        } else {
          self?.fails += 1
          if (self?.fails ?? 0) >= 3 {
            NSApp.terminate(nil)
          }
        }
      }
    }.resume()
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
