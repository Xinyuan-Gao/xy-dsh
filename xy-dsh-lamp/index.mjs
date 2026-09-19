import { spawn, execFileSync } from 'node:child_process'
import http from 'node:http'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'xy-dsh-lamp'

const overlayPath = fileURLToPath(new URL('./overlay.html', import.meta.url))
const hudSource = fileURLToPath(new URL('./hud.swift', import.meta.url))
const hudApp = join(homedir(), '.dsh', 'xy-dsh-lamp-hud.app')
const hudBin = join(hudApp, 'Contents', 'MacOS', 'xy-dsh-lamp-hud')
const hudPid = join(homedir(), '.dsh', 'xy-dsh-lamp-hud.pid')
const prefPath = join(homedir(), '.dsh', 'xy-dsh-lamp.json')

/** UI preferences that outlive the HUD process (language, ...). */
function readPrefs() {
  try {
    const parsed = JSON.parse(readFileSync(prefPath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writePrefs(patch) {
  try {
    writeFileSync(prefPath, `${JSON.stringify({ ...readPrefs(), ...patch }, null, 2)}\n`)
  } catch {}
}

function json(value) {
  return JSON.stringify(String(value ?? ''))
}

function notifyMac({ title, body, sound }) {
  const script = sound
    ? `display notification ${json(body)} with title ${json(title)} sound name "Glass"`
    : `display notification ${json(body)} with title ${json(title)}`
  spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref()
}

function notifyLinux({ title, body }) {
  spawn('notify-send', ['-a', 'DeepSeek Harness', title, body], { detached: true, stdio: 'ignore' }).unref()
}

function notifyWin({ title, body }) {
  const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Media.SystemSounds]::Asterisk.Play(); $w = New-Object System.Windows.Forms.NotifyIcon; $w.Icon = [System.Drawing.SystemIcons]::Information; $w.Visible = $true; $w.ShowBalloonTip(4000, '${title.replace(/'/g, "''")}', '${body.replace(/'/g, "''")}', [System.Windows.Forms.ToolTipIcon]::Info)`
  spawn('powershell', ['-NoProfile', '-Command', ps], { detached: true, stdio: 'ignore' }).unref()
}

function notify(payload, sound) {
  try {
    if (process.platform === 'darwin') notifyMac({ ...payload, sound })
    else if (process.platform === 'linux') notifyLinux(payload)
    else if (process.platform === 'win32') notifyWin(payload)
  } catch (err) {
    console.warn('[xy-dsh-lamp] notify failed', err)
  }
}

function killPid(pid, log) {
  if (!pid) return
  try {
    // 'SIGTERM', not 'TERM': Node throws ERR_UNKNOWN_SIGNAL on the short form.
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    // ESRCH just means it already went away. Anything else is real, and this
    // used to be an empty catch — which is how a one-word signal typo kept
    // killOldHud() dead for the whole life of the plugin.
    if (err?.code !== 'ESRCH') {
      log?.warn?.(`[xy-dsh-lamp] could not stop HUD pid ${pid}: ${err?.code || err}`)
    }
  }
}

function killOldHud(log) {
  try {
    killPid(Number(readFileSync(hudPid, 'utf8')), log)
  } catch {}
}

function compileHud(log) {
  mkdirSync(join(hudApp, 'Contents', 'MacOS'), { recursive: true })
  const plist = join(hudApp, 'Contents', 'Info.plist')
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>local.xy.dsh-lamp</string>
  <key>CFBundleName</key><string>DSH LAMP</string>
  <key>CFBundleExecutable</key><string>xy-dsh-lamp-hud</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`)
  const stale = !existsSync(hudBin)
    || statSync(hudSource).mtimeMs > statSync(hudBin).mtimeMs
  if (!stale) return hudBin
  log?.info?.('[xy-dsh-lamp] compiling desktop HUD')
  // Compile beside the real binary and only swap it in on success: a failed
  // build must never truncate a working binary, and must not cost us the board.
  const staged = `${hudBin}.staged`
  try {
    execFileSync('swiftc', [hudSource, '-O', '-o', staged, '-framework', 'Cocoa', '-framework', 'WebKit'], {
      timeout: 90_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    renameSync(staged, hudBin)
  } catch (err) {
    try { if (existsSync(staged)) unlinkSync(staged) } catch {}
    if (existsSync(hudBin)) {
      log?.error?.('[xy-dsh-lamp] HUD compile failed; keeping the existing binary', err)
      return hudBin
    }
    throw err
  }
  return hudBin
}

function launchDesktopHud(snapshot, log, setLang) {
  if (process.platform !== 'darwin') return () => {}
  killOldHud(log)

  const server = http.createServer((req, res) => {
    const path = (req.url || '/').split('?')[0]
    res.setHeader('Cache-Control', 'no-store')
    if (path === '/api') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(snapshot()))
      return
    }
    // The board's own language button posts here; same origin, so the page can
    // persist the choice without going through the HUD process.
    if (path === '/lang' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 32) req.destroy()
      })
      req.on('end', () => {
        const next = setLang?.(body.trim()) || 'zh'
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(next)
      })
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    try {
      res.end(readFileSync(overlayPath, 'utf8'))
    } catch (err) {
      res.statusCode = 500
      res.end(String(err))
    }
  })

  let child = null
  let stopped = false
  server.listen(0, '127.0.0.1', () => {
    if (stopped) return
    const port = server.address().port
    const page = `http://127.0.0.1:${port}/`
    try {
      const bin = compileHud(log)
      child = spawn(bin, [page], { stdio: 'ignore' })
      writeFileSync(hudPid, String(child.pid))
      child.on('exit', () => {
        try { if (String(readFileSync(hudPid, 'utf8')) === String(child.pid)) writeFileSync(hudPid, '') } catch {}
      })
      log?.info?.(`[xy-dsh-lamp] desktop HUD ${page} pid=${child.pid}`)
    } catch (err) {
      log?.error?.('[xy-dsh-lamp] HUD failed', err)
    }
  })

  return () => {
    stopped = true
    try { server.close() } catch {}
    // The pid file is the authority: `child` goes stale as soon as the HUD is
    // restarted outside the plugin (a hand-run binary, a crash + relaunch).
    killOldHud(log)
  }
}

function reasonState(kind) {
  if (kind === 'completed' || kind === 'max-tokens') return 'done'
  if (kind === 'error') return 'err'
  if (kind === 'blocked') return 'wait'
  if (kind === 'aborted') return 'idle'
  return 'done'
}

/** Which project a session belongs to: the last segment of its working directory. */
function projectName(session) {
  const cwd = session?.header?.cwd
  if (typeof cwd !== 'string') return ''
  const parts = cwd.replace(/[/\\]+$/, '').split(/[/\\]/)
  return parts[parts.length - 1] || ''
}

/** Rows shown on the board, and cells inside one row. */
const MAX_SESSIONS = 6
const MAX_CELLS = 6

/** Urgency order for rows: something broke, then something waits, then runs. */
function stateRank(state) {
  if (state === 'err') return 0
  if (state === 'wait') return 1
  if (state === 'run') return 2
  return 3
}

function rollUp(members) {
  if (members.some((a) => a.state === 'err')) return 'err'
  if (members.some((a) => a.state === 'wait')) return 'wait'
  if (members.some((a) => a.state === 'run')) return 'run'
  if (members.length > 0 && members.every((a) => a.state === 'done')) return 'done'
  return 'idle'
}

export function apply(ctx, config = {}) {
  const enabled = config.enabled !== false
  const doNotify = config.notify !== false
  const sound = config.sound !== false
  if (!enabled) return

  // Language: the board's button wins and is remembered; the plugin config is
  // only the initial default. Chinese unless something says otherwise.
  const saved = readPrefs().lang
  let lang = (saved || config.lang) === 'en' ? 'en' : 'zh'

  const agents = new Map()
  const childIndex = new Map()
  /** callIds of ask_user_question calls still waiting on the user, per session. */
  const asks = new Map()

  const upsert = (session, patch) => {
    if (!session?.id) return
    const id = String(session.id)
    const prev = agents.get(id) || {
      id,
      origin: session.header?.origin,
      parent: session.header?.parentSession ? String(session.header.parentSession) : null,
      name: projectName(session),
      code: 'ROOT',
      state: 'idle',
      waiting: false,
      approval: false,
      reason: null,
      title: '',
      startedAt: 0,
      endedAt: 0,
      seenAt: Date.now(),
    }
    if (!childIndex.has(id) && prev.origin === 'subagent') {
      const n = [...agents.values()].filter((a) => a.parent === prev.parent).length + 1
      childIndex.set(id, n)
    }
    const code = prev.origin === 'subagent' ? `A${childIndex.get(id) || 1}` : 'ROOT'
    agents.set(id, { ...prev, ...patch, code, id, seenAt: Date.now() })
  }

  /** "Waiting on the user" is either a pending approval or a pending question. */
  const refreshWaiting = (session) => {
    const id = String(session.id)
    const pending = Boolean(agents.get(id)?.approval) || (asks.get(id)?.size ?? 0) > 0
    upsert(session, { waiting: pending })
  }

  ctx.on('session/event', (session, event) => {
    if (!session) return
    const id = String(session.id)
    const type = event?.type
    if (type === 'turn/start') {
      upsert(session, {})
    }
    if (type === 'turn/end') {
      const kind = event?.data?.reason?.kind
      // The turn is over, so nothing can still be pending on it.
      asks.delete(id)
      upsert(session, { reason: kind || null, approval: false })
      refreshWaiting(session)
    }
    // A pending approval keeps the turn OPEN, so the agent still reports
    // "running" — turn/end never carries it. These two audit events are the
    // only signal that the run is actually blocked on the user.
    if (type === 'approval/asked') {
      upsert(session, { approval: true })
      refreshWaiting(session)
    }
    if (type === 'approval/decided') {
      upsert(session, { approval: false })
      refreshWaiting(session)
    }
    // ask_user_question blocks on the user too, but it hangs off the
    // user-questions waterfall hook rather than an audit event — the pending
    // tool call is what the session log actually shows.
    if (type === 'tool/call' && event?.data?.name === 'ask_user_question') {
      const set = asks.get(id) || new Set()
      set.add(String(event.data.callId))
      asks.set(id, set)
      refreshWaiting(session)
    }
    if (type === 'tool/result') {
      // The call id is nested here, unlike `tool/call` where it is top level.
      // Guessing top level made this pairing never match, so an answered
      // question kept the board on ASK for the rest of the turn.
      const callId = event?.data?.message?.source?.callId ?? event?.data?.callId
      const set = asks.get(id)
      if (callId !== undefined && set?.delete(String(callId))) refreshWaiting(session)
    }
    if (type === 'session/title' && event?.data?.title) {
      upsert(session, { title: String(event.data.title) })
    }
  })

  ctx.on('agent/status', ({ agent, status }) => {
    const session = agent?.session
    if (!session) return
    const id = String(session.id)
    const origin = session.header?.origin
    if (status === 'running') {
      upsert(session, { state: 'run', startedAt: Date.now(), endedAt: 0 })
      return
    }
    const prev = agents.get(id)
    const nextState = reasonState(prev?.reason)
    upsert(session, { state: nextState, endedAt: Date.now() })
    if (origin === 'subagent') return
    if (!doNotify) return
    if (prev?.reason === 'aborted') return
    const title = prev?.title || 'DeepSeek Harness'
    const body = nextState === 'err'
      ? `任务出错 — ${title}`
      : nextState === 'wait'
        ? `需要你处理 — ${title}`
        : `任务已完成 — ${title}`
    notify({ title: 'DSH', body }, sound)
  })

  /** How long a finished session stays on the board. */
  const RETAIN_MS = 90_000
  /** How long a finished session is still worth remembering at all. Never
      shorter than the retention above, or the board would forget a row it is
      still supposed to be drawing. */
  const forgetMs = Math.max(
    RETAIN_MS * 2,
    Number(config.forgetMs) > 0 ? Number(config.forgetMs) : 10 * 60_000,
  )

  /** Drop sessions nobody will look at again. Without this the maps grow for
      the whole life of the DSH process and every snapshot walks all of them. */
  const prune = (now) => {
    const live = new Set()
    for (const a of agents.values()) {
      if (a.state === 'run' || a.state === 'wait' || a.state === 'err') live.add(a.id)
    }
    // Never forget a parent whose subagent is still live, or the child would
    // have no row left to appear in.
    const pinned = new Set()
    for (const a of agents.values()) {
      if (a.parent && live.has(a.id)) pinned.add(a.parent)
    }
    for (const [id, a] of agents) {
      if (live.has(id) || pinned.has(id)) continue
      if (now - (a.seenAt || 0) < forgetMs) continue
      agents.delete(id)
      childIndex.delete(id)
      asks.delete(id)
    }
  }

  const snapshot = () => {
    const now = Date.now()
    prune(now)
    // Resolve the display state once, up front: a pending approval outranks the
    // "running" the agent still reports. Everything below reads `state`.
    const settled = [...agents.values()]
      .map((a) => (a.waiting && a.state === 'run' ? { ...a, state: 'wait' } : a))
    const isActive = (a) => a.state === 'run' || a.state === 'wait' || a.state === 'err'
    const activeParents = new Set(
      settled.filter(isActive).map((a) => a.parent).filter(Boolean))
    const live = settled.filter((a) => {
      if (isActive(a)) return true
      // A row must exist for any session whose subagent is still running,
      // however long the parent itself has been idle.
      if (activeParents.has(a.id)) return true
      if (a.endedAt && now - a.endedAt < RETAIN_MS) return true
      return false
    })

    // One row per root session. Picking a single "focus" root used to hide every
    // other project that had a main agent running.
    const roots = live.filter((a) => a.origin !== 'subagent')
    roots.sort((a, b) => {
      const byState = stateRank(a.state) - stateRank(b.state)
      if (byState !== 0) return byState
      return (b.endedAt || b.startedAt || 0) - (a.endedAt || a.startedAt || 0)
    })
    const shown = roots.slice(0, MAX_SESSIONS)

    const families = shown.map((root) => {
      const kids = live
        .filter((a) => a.parent === root.id)
        .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
      return { root, members: [root, ...kids].slice(0, MAX_CELLS) }
    })

    const everyMember = families.flatMap((f) => f.members)
    const running = everyMember.some((a) => a.state === 'run' || a.state === 'wait')
    const waiting = everyMember.some((a) => a.state === 'wait')
    const erred = everyMember.some((a) => a.state === 'err')
    const allDone = everyMember.length > 0 && everyMember.every((a) => a.state === 'done')

    const sessions = families.map(({ root, members }) => {
      const started = Math.min(...members.map((a) => a.startedAt || now))
      const ended = Math.max(...members.map((a) => a.endedAt || 0), 0)
      const busy = members.some((a) => a.state === 'run' || a.state === 'wait')
      return {
        id: root.id,
        name: root.name || '',
        title: root.title || '',
        state: rollUp(members),
        active: members.find((a) => a.state === 'run' || a.state === 'wait' || a.state === 'err')?.code
          || root.code,
        elapsedMs: busy
          ? now - (Number.isFinite(started) ? started : now)
          : ended && started ? Math.max(0, ended - started) : 0,
        agents: members.map((a) => ({ id: a.id, code: a.code, state: a.state })),
      }
    })

    // Total elapsed: how long the oldest still-running agent has been going.
    const busyMembers = everyMember.filter((a) => a.state === 'run' || a.state === 'wait')
    const elapsedMs = busyMembers.length
      ? now - Math.min(...busyMembers.map((a) => a.startedAt || now))
      : Math.max(0, ...sessions.map((s) => s.elapsedMs), 0)

    return {
      mode: allDone ? 'done' : everyMember.length ? 'work' : 'idle',
      mark: erred ? 'ERR' : waiting ? 'ASK' : allDone ? 'DONE' : running ? 'RUN' : 'IDLE',
      note: sessions[0]?.active || 'ROOT',
      elapsedMs,
      count: roots.length,
      sessions,
      // Kept for a page older than the sessions shape; a current page reads
      // sessions and ignores this.
      agents: everyMember.map((a) => ({ id: a.id, code: a.code, state: a.state })),
      lang,
    }
  }

  const stopHud = launchDesktopHud(snapshot, ctx.logger, (next) => {
    lang = next === 'en' ? 'en' : 'zh'
    writePrefs({ lang })
    return lang
  })
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => stopHud)
  }

  ctx.logger?.info?.('[xy-dsh-lamp] host loaded')
}
