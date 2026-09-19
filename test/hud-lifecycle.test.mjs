// HUD process lifecycle. Both of these failed silently in production before
// anything tested them:
//   - killOldHud() never killed anything: process.kill(pid, 'TERM') throws
//     ERR_UNKNOWN_SIGNAL (Node wants 'SIGTERM') and an empty catch ate it.
//   - a hud.swift that stopped compiling took the whole board down instead of
//     falling back to the binary that already worked.
//
// Runs on macOS only (the HUD is a Cocoa app) and writes nothing outside a
// temporary HOME. Needs `swiftc` for the compile half; that half is skipped
// with a notice when it is missing.
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, not URL.pathname: pathname stays percent-encoded and this
// checkout lives under a non-ASCII directory name.
const SRC = fileURLToPath(new URL('../xy-dsh-lamp', import.meta.url))
const ROOT = join(tmpdir(), 'xy-dsh-hud-test')
const HOME = join(ROOT, 'home')
const pidfile = () => join(HOME, '.dsh', 'xy-dsh-lamp-hud.pid')

let failures = 0
let skipped = 0
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}  ${extra}`)
}
const skip = (label) => { skipped += 1; console.log(`SKIP  ${label}`) }

if (process.platform !== 'darwin') {
  console.log('SKIP  the whole suite: the HUD is a macOS app')
  process.exit(0)
}

rmSync(ROOT, { recursive: true, force: true })
mkdirSync(HOME, { recursive: true })
process.env.HOME = HOME

/** Load a private copy of the plugin so a broken hud.swift never touches the repo. */
const loadCopy = async (name) => {
  const dir = join(ROOT, name)
  cpSync(SRC, dir, { recursive: true })
  return dir
}

const start = async (dir) => {
  const logs = []
  let page = null
  let pid = null
  const handlers = new Map()
  const plugin = await import(join(dir, 'index.mjs'))
  plugin.apply({
    on: (n, f) => { if (!handlers.has(n)) handlers.set(n, []); handlers.get(n).push(f) },
    effect() {},
    logger: {
      info: (m) => { logs.push(String(m)); const h = /desktop HUD (\S+) pid=(\d+)/.exec(String(m)); if (h) { page = h[1]; pid = h[2] } },
      error: (m) => logs.push(String(m)),
    },
  }, {})
  for (let i = 0; i < 120 && !page && !logs.some((m) => m.includes('compile failed')); i += 1) {
    await new Promise((r) => setTimeout(r, 100))
  }
  return { logs, page: () => page, pid: () => pid }
}

const alive = (pid) => { try { process.kill(Number(pid), 0); return true } catch { return false } }

try {
  // ---- 1. killOldHud kills exactly what the pid file names -----------------
  // The target is not our child, so a killed-but-unreaped zombie cannot make
  // this look like a survivor.
  const target = await new Promise((resolve) => {
    const d = spawn('bash', ['-c', 'sleep 300 & echo $!'], { stdio: ['ignore', 'pipe', 'ignore'] })
    d.stdout.on('data', (x) => resolve(String(x).trim()))
  })
  mkdirSync(join(HOME, '.dsh'), { recursive: true })
  writeFileSync(pidfile(), target)

  const { page, pid } = await start(await loadCopy('lamp-a'))
  await new Promise((r) => setTimeout(r, 900))
  check('killOldHud stops the process the pid file names', !alive(target), `target ${target}`)
  check('and the board still comes up', Boolean(page()), String(page()))

  if (page()) {
    const snap = await fetch(new URL('/api', page())).then((r) => r.json())
    check('the new HUD serves the board', snap.mark === 'IDLE' && Array.isArray(snap.sessions), snap.mark)
  }
  // a pid file naming something long gone must be a no-op, not a crash
  writeFileSync(pidfile(), '999999')
  const second = await start(await loadCopy('lamp-b'))
  check('a stale pid in the file is harmless', Boolean(second.page()), String(second.page()))
  if (pid()) { try { process.kill(Number(pid()), 'SIGTERM') } catch {} }
  if (second.pid()) { try { process.kill(Number(second.pid()), 'SIGTERM') } catch {} }

  // ---- 2. a broken hud.swift must not cost us the board --------------------
  let hasSwiftc = true
  try { execFileSync('swiftc', ['--version'], { stdio: 'ignore' }) } catch { hasSwiftc = false }
  if (!hasSwiftc) {
    skip('broken hud.swift falls back to the existing binary (no swiftc on PATH)')
  } else {
    // first run compiles from a good source
    const good = await loadCopy('lamp-good')
    const built = await start(good)
    check('a good source compiles and launches', Boolean(built.page()), String(built.page()))
    const binPath = join(HOME, '.dsh', 'xy-dsh-lamp-hud.app', 'Contents', 'MacOS', 'xy-dsh-lamp-hud')
    check('the binary landed where the plugin expects it', existsSync(binPath))
    if (built.pid()) { try { process.kill(Number(built.pid()), 'SIGTERM') } catch {} }

    // now break the source, newer than the binary, and run again
    const bad = await loadCopy('lamp-bad')
    appendFileSync(join(bad, 'hud.swift'), '\nthis is not swift at all\n')
    const newer = new Date(Date.now() + 2000)
    utimesSync(join(bad, 'hud.swift'), newer, newer)

    const before = readFileSync(binPath)
    const broken = await start(bad)
    check('a broken build is reported',
      broken.logs.some((m) => m.includes('compile failed')),
      broken.logs.filter((m) => m.includes('compile')).slice(0, 1).join(''))
    check('the board still launches on the kept binary', Boolean(broken.page()), String(broken.page()))
    check('the kept binary was not truncated', readFileSync(binPath).equals(before))
    check('no staged file is left behind', !existsSync(`${binPath}.staged`))
    if (broken.pid()) { try { process.kill(Number(broken.pid()), 'SIGTERM') } catch {} }
  }
} finally {
  try { execFileSync('bash', ['-c', `pkill -f "${HOME}/.dsh/xy-dsh-lamp-hud.app" || true`]) } catch {}
  rmSync(ROOT, { recursive: true, force: true })
}

console.log('RESULT:', failures === 0 ? `ALL PASS${skipped ? ` (${skipped} skipped)` : ''}` : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
