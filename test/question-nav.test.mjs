// Loads the plugin's browser bundle the way the DSH client module system does —
// as a classic script that registers a factory on window.__ModuleLoader__ — and
// then calls the factory and apply() against a mock Cordis context. Needs only
// Node: no browser, no DOM.
//
// Why this exists: the bundle was published as a bare ES module while the host
// serves it as a classic script, which means it never registered and the plugin
// silently did nothing; and apply() called an undefined `styles` helper, which
// threw at load. Both are invisible to reading the file and obvious to this.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const BUNDLE = new URL('../xy-dsh-question-nav/lib/client.js', import.meta.url)
const EXPECTED_ID = 'xy-dsh-question-nav'
const SEATS = [
  'conversation.input.dock',
  'conversation.session.header.utilities',
  'shell.overlay',
]

let failures = 0
const check = (label, cond, extra = '') => {
  if (!cond) failures += 1
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

// --- execute the bundle in a sandbox that captures its registration ---------
let registration = null
const headChildren = []
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(r) {
        if (registration !== null) throw new Error('registered twice')
        registration = r
      },
    },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame() {},
  },
  document: {
    head: { appendChild: (el) => headChildren.push(el) },
    createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  },
  console,
  setTimeout,
  clearTimeout,
  queueMicrotask,
}
vm.createContext(sandbox)

let evaluated = true
try {
  vm.runInContext(readFileSync(BUNDLE, 'utf8'), sandbox, { filename: 'client.js' })
} catch (error) {
  evaluated = false
  console.log('      threw:', error.message)
}
check('the bundle evaluates as a classic script', evaluated)

check('it registers with window.__ModuleLoader__', registration !== null)
if (registration === null) {
  console.log('RESULT: FAILURES')
  process.exit(1)
}
check('the registration id is the package name', registration.id === EXPECTED_ID, registration.id)
check('the registration carries a factory', typeof registration.factory === 'function')

// --- materialise the factory the way the module system does ----------------
const fakeReact = {
  createElement: (...args) => ({ type: args[0], props: args[1] || {}, children: args.slice(2) }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useMemo: (fn) => fn(),
  Fragment: 'Fragment',
}

let exported = null
let materialised = true
try {
  exported = registration.factory((specifier) => {
    if (specifier === 'react') return fakeReact
    throw new Error(`unexpected require("${specifier}")`)
  })
} catch (error) {
  materialised = false
  console.log('      threw:', error.message)
}
check('the factory materialises with only react required', materialised)

if (exported === null) {
  console.log('RESULT: FAILURES')
  process.exit(1)
}

check('the module exports a plugin face', ['name', 'inject', 'apply'].every((k) => k in exported))
check('the plugin name matches the registration id', exported?.name === EXPECTED_ID, String(exported?.name))
check('it declares the slots service', JSON.stringify(exported?.inject) === '["slots"]', JSON.stringify(exported?.inject))

// --- apply() against a mock Cordis context ---------------------------------
const seats = []
const effects = []
const themeLayers = []

const ctx = {
  slots: {
    inject: (seat, fn) => {
      seats.push(seat)
      return fn()
    },
    register: (options) => options,
  },
  get: (service) => (service === 'theme'
    ? { overrideTokens: (source, tokens) => { themeLayers.push({ source, tokens }) } }
    : undefined),
  effect: (fn, label) => {
    effects.push(label)
    const disposer = fn()
    if (disposer !== undefined && typeof disposer !== 'function') {
      throw new Error(`effect ${label} returned a non-function — Cordis rejects this`)
    }
    return disposer
  },
  logger: { info() {}, warn() {}, error() {} },
}

let returned
let applied = true
try {
  returned = exported.apply(ctx)
} catch (error) {
  applied = false
  console.log('      threw:', error.message)
}
check('apply() runs without throwing', applied)

check('apply() returns undefined', returned === undefined, `got ${typeof returned}`)
check('it registers exactly the three seats', JSON.stringify(seats) === JSON.stringify(SEATS), JSON.stringify(seats))
check('it inserts one stylesheet', headChildren.length === 1 && typeof headChildren[0].textContent === 'string'
  && headChildren[0].textContent.includes('.dshq-stripRow'), `${headChildren.length} tag(s)`)

check('it registers its own accent layer', themeLayers.length === 1
  && themeLayers[0].source === `${EXPECTED_ID}/accent`, themeLayers.map((l) => l.source).join(', ') || '(none)')

const accent = themeLayers[0]?.tokens?.['--dshq-accent']
check('the accent token is a { light, dark } pair',
  typeof accent?.light === 'string' && typeof accent?.dark === 'string',
  JSON.stringify(accent))

check('the stylesheet effect is labelled for the plugin',
  effects.some((label) => String(label).startsWith(EXPECTED_ID)),
  JSON.stringify(effects))

console.log('RESULT:', failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
