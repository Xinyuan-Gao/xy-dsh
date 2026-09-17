window.__ModuleLoader__.load({
  id: 'xy-dsh-context',
  factory: (require) => {
    const module = { exports: {} }
    const { jsx: h, jsxs: hs } = require('react/jsx-runtime')
    const React = require('react')

    const e = (type, props, ...children) => {
      const p = props || {}
      if (children.length === 0) return h(type, p)
      if (children.length === 1) return h(type, { ...p, children: children[0] })
      return hs(type, { ...p, children })
    }

    const fmtTok = (n) => {
      const v = Number(n) || 0
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
      if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
      return String(Math.round(v))
    }

    const readUsage = (raw) => {
      const src = raw && typeof raw === 'object' ? raw : {}
      const totals = src.totals && typeof src.totals === 'object' ? src.totals : src
      return {
        input: Number(totals.uncachedInputTokens ?? totals.inputTokens ?? 0) || 0,
        output: Number(totals.outputTokens ?? 0) || 0,
        cacheRead: Number(totals.cacheReadTokens ?? 0) || 0,
        cacheWrite: Number(totals.cacheWriteTokens ?? 0) || 0,
      }
    }

    const readStats = (raw) => {
      const src = raw && typeof raw === 'object' ? raw : {}
      return {
        turns: Number(src.turns ?? 0) || 0,
        steps: Number(src.steps ?? 0) || 0,
      }
    }

    function useLens(props) {
      const empty = { turns: 0, steps: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, running: false, bound: false }
      try {
        if (typeof props?.useProjection === 'function') {
          const stats = readStats(props.useProjection('sessionStats'))
          const usage = readUsage(props.useProjection('tokenUsage'))
          const running = typeof props.useSession === 'function'
            ? Boolean(props.useSession((session) => session?.running))
            : false
          return { ...stats, ...usage, running, bound: true }
        }
      } catch {
        return empty
      }
      return empty
    }

    function Metric({ label, value, hint }) {
      return e('div', {
        style: {
          flex: '1 1 0',
          minWidth: 92,
          padding: '10px 12px',
          borderRadius: 10,
          background: '#f5f8ff',
          border: '1px solid #dbe4f5',
        },
      },
        e('div', { style: { fontSize: 11, color: '#6b7c99', letterSpacing: 0.4 } }, label),
        e('div', { style: { fontSize: 22, fontWeight: 650, color: '#1c2740', marginTop: 4, lineHeight: 1.1 } }, value),
        hint ? e('div', { style: { fontSize: 11, color: '#7d8aa3', marginTop: 4 } }, hint) : null,
      )
    }

    function LensPanel(props) {
      const data = useLens(props)
      const billed = data.input + data.cacheRead + data.cacheWrite
      const hit = billed > 0 ? data.cacheRead / billed : 0
      const status = data.running ? 'Running' : 'Done'
      const statusColor = data.running ? '#0f8a4b' : '#3558d4'

      return e('div', {
        'data-xy-dsh-context': 'lens',
        style: {
          margin: '0 0 10px',
          padding: 12,
          borderRadius: 14,
          border: '1px solid #c9d7ef',
          background: 'linear-gradient(180deg, #fbfdff 0%, #f3f7ff 100%)',
          boxShadow: '0 8px 24px rgba(40, 70, 130, 0.08)',
          color: '#1c2740',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        },
      },
        e('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 8,
          },
        },
          e('div', { style: { fontSize: 13, fontWeight: 700, letterSpacing: 0.6, color: '#23466b' } }, 'XY CONTEXT LENS'),
          e('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
            },
          },
            e('span', {
              style: {
                padding: '2px 8px',
                borderRadius: 999,
                background: data.running ? '#e6f7ed' : '#eaf0ff',
                color: statusColor,
                fontWeight: 650,
              },
            }, status),
            e('span', { style: { color: '#7d8aa3' } }, 'v0.1'),
          ),
        ),
        e('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          e(Metric, { label: 'TURNS', value: String(data.turns) }),
          e(Metric, { label: 'STEPS', value: String(data.steps) }),
          e(Metric, { label: 'CACHE HIT', value: `${Math.round(hit * 100)}%`, hint: data.bound ? 'cacheRead / billed input' : '等待 projection' }),
          e(Metric, { label: 'OUTPUT', value: fmtTok(data.output) }),
        ),
        e('div', {
          style: {
            marginTop: 10,
            fontSize: 12,
            color: '#5d6d86',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          },
        },
          e('span', null, `input ${fmtTok(data.input)} · cacheRead ${fmtTok(data.cacheRead)} · cacheWrite ${fmtTok(data.cacheWrite)}`),
          e('span', null, 'sessionStats + tokenUsage'),
        ),
      )
    }

    function SidebarCard() {
      return e('div', {
        'data-xy-dsh-context': 'sidebar',
        style: {
          margin: '8px 12px',
          padding: '10px 12px',
          border: '1px solid #c9d7ef',
          borderRadius: 10,
          background: '#f7fbff',
          color: '#23466b',
          fontSize: 12,
          lineHeight: 1.5,
        },
      },
        e('strong', { style: { display: 'block', marginBottom: 4, letterSpacing: 0.4 } }, 'XY DSH CONTEXT'),
        e('span', { style: { display: 'block' } }, 'Context Lens · Live session stats'),
        e('span', { style: { display: 'block', color: '#64809c' } }, 'sessionStats + tokenUsage'),
      )
    }

    function HeaderAction(props) {
      const [open, setOpen] = React.useState(false)
      return e('div', { style: { position: 'relative' } },
        e('button', {
          type: 'button',
          'data-xy-dsh-context': 'header-btn',
          onClick: () => setOpen((v) => !v),
          style: {
            height: 28,
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid #c9d7ef',
            background: '#eef4ff',
            color: '#23466b',
            fontSize: 12,
            fontWeight: 650,
            cursor: 'pointer',
          },
        }, open ? 'Context −' : 'Context +'),
        open
          ? e('div', {
            style: {
              position: 'absolute',
              right: 0,
              top: 36,
              width: 420,
              zIndex: 40,
            },
          }, e(LensPanel, props))
          : null,
      )
    }

    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'xy-dsh-context-sidebar',
        order: 900,
      }, SidebarCard))

      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'xy-dsh-context-dock',
        order: 20,
      }, LensPanel))

      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'xy-dsh-context',
        order: 80,
      }, HeaderAction))
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
