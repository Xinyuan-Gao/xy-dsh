// Drives the plugin host with fake sessions through an isolated HOME and reads
// back /api. Covers multi-session grouping, the two "waiting on you" signals,
// map pruning, and the language preference. Needs only Node — no browser, no
// macOS. Every fixture mirrors a real event payload; ones invented by hand are
// how a broken tool/result pairing once passed review.
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HOME = `${tmpdir()}/xy-dsh-host-test`
rmSync(HOME, { recursive: true, force: true })
process.env.HOME = HOME

const plugin = await import(new URL('../xy-dsh-lamp/index.mjs', import.meta.url))

const handlers = new Map()
let page = null
let pid = null
const ctx = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, [])
    handlers.get(name).push(fn)
  },
  effect() {},
  logger: {
    info: (m) => {
      const hit = /desktop HUD (\S+) pid=(\d+)/.exec(String(m))
      if (hit) { page = hit[1]; pid = hit[2] }
    },
    error: (m) => console.log('HOST ERROR', m),
  },
}
const emit = (name, ...args) => (handlers.get(name) || []).forEach((fn) => fn(...args))

const root = (id, cwd) => ({ id, header: { cwd } })
const child = (id, cwd, parent) => ({ id, header: { origin: 'subagent', parentSession: parent, cwd } })

let failures = 0
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}  ${extra}`)
}
const flat = (snap) => [].concat(...(snap.sessions || []).map((s) => s.agents))

try {
  plugin.apply(ctx, {})
  for (let i = 0; i < 80 && !page; i += 1) await new Promise((r) => setTimeout(r, 100))
  if (!page) throw new Error('host never started')
  const api = () => fetch(new URL('/api', page)).then((r) => r.json())

  const A = root('session-aaa', '/home/dev/projects/blog')
  const B = root('session-bbb', '/home/dev/projects/project-learning')
  const A1 = child('session-aaa-1', '/home/dev/projects/blog', 'session-aaa')

  emit('session/event', A, { type: 'turn/start' })
  emit('session/event', A, { type: 'session/title', data: { title: '检查显示插件' } })
  emit('agent/status', { agent: { session: A }, status: 'running' })
  emit('session/event', A1, { type: 'turn/start' })
  emit('agent/status', { agent: { session: A1 }, status: 'running' })
  emit('session/event', B, { type: 'turn/start' })
  emit('agent/status', { agent: { session: B }, status: 'running' })

  let snap = await api()
  check('two running roots -> two rows', (snap.sessions || []).length === 2, `${(snap.sessions || []).length}`)
  check('row names come from cwd',
    (snap.sessions || []).map((s) => s.name).sort().join(',') === 'blog,project-learning',
    (snap.sessions || []).map((s) => s.name).join(','))
  check('the blog row carries its subagent',
    snap.sessions?.find((s) => s.name === 'blog')?.agents.map((a) => a.code).join(',') === 'ROOT,A1')
  check('every running root is visible', flat(snap).filter((a) => a.state === 'run').length === 3)
  check('header reports the session count', snap.count === 2, String(snap.count))
  check('nothing is waiting yet', snap.mark === 'RUN', snap.mark)

  // --- approval: the turn stays open, so this is the only "blocked on you" signal
  emit('session/event', A, { type: 'approval/asked', data: { id: 'ap-1', toolName: 'Bash' } })
  snap = await api()
  check('approval/asked turns the root lamp into wait',
    snap.sessions?.find((s) => s.name === 'blog')?.agents[0].state === 'wait',
    JSON.stringify(snap.sessions?.find((s) => s.name === 'blog')?.agents))
  check('approval lights the ASK mark', snap.mark === 'ASK', snap.mark)
  check('the other session is unaffected',
    snap.sessions?.find((s) => s.name === 'project-learning')?.state === 'run')

  emit('session/event', A, { type: 'approval/decided', data: { id: 'ap-1', outcome: 'allow' } })
  snap = await api()
  check('approval/decided goes back to running',
    snap.sessions?.find((s) => s.name === 'blog')?.agents[0].state === 'run' && snap.mark === 'RUN',
    snap.mark)

  // a turn end must clear a wait that never got its decided event
  emit('session/event', A, { type: 'approval/asked', data: { id: 'ap-2' } })
  emit('session/event', A, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  emit('agent/status', { agent: { session: A }, status: 'idle' })
  snap = await api()
  check('turn end clears a dangling wait',
    snap.sessions?.find((s) => s.name === 'blog')?.agents[0].state === 'done',
    JSON.stringify(snap.sessions?.find((s) => s.name === 'blog')?.agents))


  // --- ask_user_question: a pending tool call is the only trace it leaves
  emit('session/event', B, { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'ask_user_question' } })
  snap = await api()
  check('ask_user_question turns the lamp into wait',
    snap.sessions?.find((s) => s.name === 'project-learning')?.agents[0].state === 'wait',
    JSON.stringify(snap.sessions?.find((s) => s.name === 'project-learning')?.agents))
  emit('session/event', B, { type: 'tool/result', data: { turn: 1, step: 1,
    message: { source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1' }] } } })
  snap = await api()
  check('answering the question clears the wait',
    snap.sessions?.find((s) => s.name === 'project-learning')?.agents[0].state === 'run', snap.mark)

  emit('session/event', B, { type: 'tool/call', data: { turn: 1, step: 3, callId: 'c9', name: 'ask_user_question' } })
  emit('session/event', B, { type: 'tool/result', data: { turn: 1, step: 3,
    message: { source: { kind: 'tool', callId: 'other' } } } })
  snap = await api()
  check('a result for a different call does not clear the wait',
    snap.sessions?.find((s) => s.name === 'project-learning')?.agents[0].state === 'wait', snap.mark)
  emit('session/event', B, { type: 'tool/result', data: { turn: 1, step: 3,
    message: { source: { kind: 'tool', callId: 'c9' } } } })
  snap = await api()
  check('the matching nested callId clears it',
    snap.sessions?.find((s) => s.name === 'project-learning')?.agents[0].state === 'run', snap.mark)

  // an unrelated tool call must not look like a wait
  emit('session/event', B, { type: 'tool/call', data: { turn: 1, step: 2, callId: 'c2', name: 'Bash' } })
  snap = await api()
  check('other tools do not raise ASK',
    snap.sessions?.find((s) => s.name === 'project-learning')?.agents[0].state === 'run', snap.mark)

  // --- a running subagent keeps its parent's row alive
  const C = root('session-ccc', '/home/dev/projects/ai_yingji')
  const C1 = child('session-ccc-1', '/home/dev/projects/ai_yingji', 'session-ccc')
  emit('session/event', C, { type: 'turn/start' })
  emit('agent/status', { agent: { session: C }, status: 'running' })
  emit('session/event', C1, { type: 'turn/start' })
  emit('agent/status', { agent: { session: C1 }, status: 'running' })
  emit('session/event', C, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  emit('agent/status', { agent: { session: C }, status: 'idle' })
  // finish every remaining subagent, so nothing is pinned any more
  emit('session/event', A1, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  emit('agent/status', { agent: { session: A1 }, status: 'idle' })
  const realNow = Date.now
  Date.now = () => realNow() + 3600_000          // fast-forward an hour
  snap = await api()
  check('an idle parent keeps its row while its subagent runs',
    snap.sessions?.some((s) => s.name === 'ai_yingji'
      && s.agents.map((a) => a.code + ':' + a.state).join(',') === 'ROOT:done,A1:run'),
    JSON.stringify(snap.sessions?.map((s) => s.name + ' ' + s.agents.map((a) => a.code + ':' + a.state).join(','))))
  check('sessions nobody will look at are forgotten',
    !snap.sessions?.some((s) => s.name === 'blog'),
    JSON.stringify(snap.sessions?.map((s) => s.name)))
  Date.now = realNow

  // --- dead fields are gone
  snap = await api()
  check('doneText is gone from the wire', !('doneText' in snap))
  check('no redundant top-level title', !('title' in snap))

  // --- language preference
  let res = await fetch(new URL('/lang', page), { method: 'POST', body: 'en' })
  check('POST /lang replies with the value', (await res.text()) === 'en')
  check('snapshot carries the new language', (await api()).lang === 'en')
  await fetch(new URL('/lang', page), { method: 'POST', body: 'klingon' })
  check('junk language falls back to zh', (await api()).lang === 'zh')
} finally {
  if (pid) { try { process.kill(Number(pid), 'TERM') } catch {} }
  rmSync(HOME, { recursive: true, force: true })
}
console.log('RESULT:', failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
