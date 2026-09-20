/**
 * Browser bundle for the DSH client module system.
 *
 * Registered through `window.__ModuleLoader__.load({ id, factory })` rather than
 * published as an ES module: the host serves this file as a classic script and
 * materialises the factory on first import. The wrapper is the only difference
 * from the readable source at the top of this file — the body, the stylesheet
 * and the seat registrations below are unchanged.
 */
window.__ModuleLoader__.load({
  id: 'xy-dsh-question-nav',
  factory: (require) => {
    const React = require('react');
    const module = { exports: {} };
    const exports = module.exports;
    /**
     * xy-question-nav — a DSH Web client plugin.
     *
     * What it does, in one sentence: it keeps the question you are currently on
     * visible above the composer, and lets you jump the conversation back to any
     * earlier question in one click.
     *
     * Three seats:
     *   - `conversation.input.dock`                  → the current-question strip
     *   - `conversation.session.header.utilities`     → the "问答总览" (overview) button
     *   - `shell.overlay`                             → the overview drawer
     *
     * The data comes from the Chat store through the session-scoped `useChat` hook
     * that the seat injects; navigation uses the chat flow row markers
     * (`data-chat-anchor-key` / `data-chat-turn`) inside the conversation scroll
     * container (`data-conversation-scroll`). Nothing here mutates code, files or
     * session content — "going back" only moves the conversation viewport.
     */

    /* ------------------------------------------------------------------ tokens */

    /**
     * The plugin's own accent, registered as a theme token layer rather than
     * hard-coded into the stylesheet, so it follows light/dark with the rest of
     * the app and disappears with the plugin.
     */
    const ACCENT = { light: '#0F766E', dark: '#2DD4BF' };
    const ACCENT_SOFT = { light: '#E4F4F1', dark: '#10312E' };

    /* -------------------------------------------------------------------- css */

    const CSS = `
    .dshq-strip{box-sizing:border-box;width:100%;max-width:calc(var(--dsh-chat-content-width,760px) + 32px);margin:0 auto 2px;padding:0 var(--dsh-composer-side-clearance,16px);display:flex;flex-direction:column;gap:4px;align-items:stretch;position:relative}
    .dshq-stripRow{position:relative;display:flex;align-items:center;gap:8px;overflow:hidden;border:.5px solid var(--dsw-alias-border-l1);border-left:2px solid var(--dshq-accent);border-radius:12px;background:linear-gradient(90deg, color-mix(in srgb, var(--dshq-accent) 9%, var(--dsw-alias-bg-layer-2)) 0%, var(--dsw-alias-bg-layer-2) 46%);padding:5px 8px 5px 12px;scroll-margin-top:24px;transition:border-color .15s ease, box-shadow .15s ease}
    .dshq-stripRow:hover{border-color:var(--dsw-alias-border-l2);border-left-color:var(--dshq-accent);box-shadow:0 1px 10px color-mix(in srgb, var(--dshq-accent) 14%, transparent)}
    .dshq-stripBody{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .dshq-stripText{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;white-space:pre-wrap;word-break:break-word;overflow:hidden;cursor:pointer}
    .dshq-stripText[data-collapsed=true]{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}
    .dshq-stripText[data-expanded=true]{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
    .dshq-stripNav{flex:none;display:flex;align-items:center;gap:2px}
    .dshq-icoBtn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;transition:background .15s ease, color .15s ease}
    .dshq-icoBtn:hover:not(:disabled){background:color-mix(in srgb, var(--dshq-accent) 16%, transparent);color:var(--dshq-accent)}
    .dshq-icoBtn:disabled{opacity:.35;cursor:default}
    .dshq-icoBtn[data-on=true]{background:color-mix(in srgb, var(--dshq-accent) 18%, transparent);color:var(--dshq-accent)}
    .dshq-backdrop2{position:fixed;inset:0;z-index:30}
    .dshq-menu{position:absolute;left:var(--dsh-composer-side-clearance,16px);right:var(--dsh-composer-side-clearance,16px);bottom:100%;margin-bottom:8px;max-height:min(52vh,420px);overflow-y:auto;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 -10px 36px rgba(0,0,0,.22), 0 0 0 1px color-mix(in srgb, var(--dshq-accent) 10%, transparent);padding:8px;z-index:31;display:flex;flex-direction:column;gap:2px}
    .dshq-menuHead{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 8px 8px;margin-bottom:2px;border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px;user-select:none}
    .dshq-menuHead b{color:var(--dshq-accent);font-weight:600}
    .dshq-menuRow{position:relative;display:flex;align-items:flex-start;gap:8px;width:100%;text-align:left;border:none;background:transparent;border-radius:9px;padding:7px 9px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;transition:background .12s ease, color .12s ease}
    .dshq-menuRow:hover{background:color-mix(in srgb, var(--dshq-accent) 11%, transparent);color:var(--dsw-alias-label-primary)}
    .dshq-menuRow[data-current=true]{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dshq-accent) 8%, transparent)}
    .dshq-menuRow[data-current=true]:before{content:"";position:absolute;left:1px;top:9px;bottom:9px;width:2px;border-radius:2px;background:var(--dshq-accent)}
    .dshq-menuIndex{flex:none;min-width:22px;height:18px;border-radius:6px;background:color-mix(in srgb, var(--dshq-accent) 14%, transparent);color:var(--dshq-accent);font-size:11px;font-weight:600;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}
    .dshq-menuText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dshq-menuSeen{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dshq-accent);opacity:.9;margin-top:6px}
    .dshq-menuSub{display:block;color:var(--dsw-alias-label-secondary);opacity:.68;font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
    .dshq-emptyChip{flex:none;color:var(--dsw-alias-label-secondary);opacity:.75;font-size:11px;line-height:18px;padding:6px 8px}
    .dshq-headBtn{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap;transition:background .15s ease, color .15s ease, border-color .15s ease}
    .dshq-headBtn:hover{background:color-mix(in srgb, var(--dshq-accent) 13%, transparent);color:var(--dshq-accent);border-color:color-mix(in srgb, var(--dshq-accent) 42%, transparent)}
    .dshq-headBtn[data-active=true]{background:color-mix(in srgb, var(--dshq-accent) 16%, transparent);color:var(--dshq-accent);border-color:color-mix(in srgb, var(--dshq-accent) 55%, transparent)}
    .dshq-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.18);pointer-events:auto;z-index:40}
    .dshq-panel{position:fixed;top:0;right:0;bottom:0;width:min(440px,88vw);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border-left:.5px solid var(--dsw-alias-border-l1);box-shadow:-14px 0 44px rgba(0,0,0,.2);pointer-events:auto;z-index:41}
    .dshq-panelHead{flex:none;display:flex;align-items:center;gap:8px;padding:15px 14px 11px 18px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:linear-gradient(180deg, color-mix(in srgb, var(--dshq-accent) 8%, transparent), transparent)}
    .dshq-panelTitle{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}
    .dshq-panelTitle i{color:var(--dshq-accent);font-style:normal}
    .dshq-panelList{flex:1;min-height:0;overflow-y:auto;padding:12px 12px 28px;display:flex;flex-direction:column;gap:10px}
    .dshq-card{position:relative;border:.5px solid var(--dsw-alias-border-l1);border-radius:13px;padding:10px 12px 10px 14px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:6px;cursor:pointer;overflow:hidden;transition:border-color .15s ease, box-shadow .15s ease, background .15s ease}
    .dshq-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:color-mix(in srgb, var(--dshq-accent) 35%, transparent)}
    .dshq-card:hover{border-color:color-mix(in srgb, var(--dshq-accent) 40%, var(--dsw-alias-border-l1));box-shadow:0 2px 14px color-mix(in srgb, var(--dshq-accent) 12%, transparent)}
    .dshq-card[data-active=true]{border-color:color-mix(in srgb, var(--dshq-accent) 60%, transparent)}
    .dshq-card[data-active=true]:before{background:var(--dshq-accent)}
    .dshq-cardTop{display:flex;align-items:flex-start;gap:8px}
    .dshq-index{flex:none;min-width:24px;height:20px;border-radius:7px;background:color-mix(in srgb, var(--dshq-accent) 14%, transparent);color:var(--dshq-accent);font-size:11px;font-weight:600;line-height:20px;text-align:center;font-variant-numeric:tabular-nums}
    .dshq-cardQ{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;white-space:pre-wrap;word-break:break-word}
    .dshq-cardQ[data-collapsed=true]{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .dshq-badge{flex:none;height:18px;line-height:18px;padding:0 6px;border-radius:7px;background:color-mix(in srgb, var(--dshq-accent) 12%, transparent);color:var(--dshq-accent);font-size:11px}
    .dshq-cardA{display:flex;gap:8px}
    .dshq-rail{flex:none;width:2px;border-radius:2px;background:color-mix(in srgb, var(--dshq-accent) 28%, transparent);margin:2px 0}
    .dshq-cardAText{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px;white-space:pre-wrap;word-break:break-word}
    .dshq-cardAText[data-collapsed=true]{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .dshq-cardA[data-pending=true] .dshq-cardAText{font-style:italic;opacity:.75}
    .dshq-empty{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;padding:24px 12px;text-align:center}
    .dshq-tail{display:flex;align-items:center;gap:4px;padding-left:24px;margin-top:-2px}
    .dshq-tail .dshq-icoBtn{color:var(--dshq-accent)}
    `;

    /* ---------------------------------------------------------------- styles */

    /**
     * Insert the stylesheet once, and hand `ctx.effect` a disposer that takes it
     * back out. The returned function is what makes this a valid effect: Cordis
     * runs the effect's return value on teardown, so returning the element
     * itself would fail the plugin load instead of removing the styles.
     */
    function insertStyles(css) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'xy-dsh-question-nav';
      tag.textContent = css;
      document.head.appendChild(tag);
      return function () {
        tag.remove();
      };
    }

    /* -------------------------------------------------------------- utilities */

    const EMPTY_LIST = [];
    const EMPTY_QA = { entries: EMPTY_LIST, activeTurn: null };

    /** React exposes `useSyncExternalStore` in 18+; the fallback keeps 17 alive. */
    function makeUseSyncExternalStore() {
      if (typeof React.useSyncExternalStore === 'function') return React.useSyncExternalStore;
      return function (subscribe, getSnapshot) {
        const pair = React.useState(function () {
          return { value: getSnapshot(), store: null };
        });
        const state = pair[0];
        const set = pair[1];
        if (state.store !== subscribe) {
          state.store = subscribe;
          state.value = getSnapshot();
        }
        React.useEffect(
          function () {
            const sync = function () {
              set({ value: getSnapshot(), store: subscribe });
            };
            sync();
            return subscribe(sync);
          },
          [subscribe, getSnapshot, set],
        );
        return state.value;
      };
    }

    /** A minimal external store: `read` for the snapshot, `write` to publish. */
    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        read: function () {
          return value;
        },
        write: function (next) {
          if (next === value) return;
          value = next;
          listeners.forEach(function (fn) {
            fn();
          });
        },
        subscribe: function (fn) {
          listeners.add(fn);
          return function () {
            listeners.delete(fn);
          };
        },
      };
    }

    /**
     * One conversation's data, published by the mounted strip and consumed by the
     * two seats that live outside the conversation subtree (header button and
     * drawer). The first writer owns the slot until it releases it, so a stale
     * strip from another session can never overwrite live data.
     */
    function createMirror() {
      let latest = null;
      let writer = null;
      let panelOpen = false;
      const listeners = new Set();
      const emit = function () {
        listeners.forEach(function (fn) {
          fn();
        });
      };
      return {
        write: function (source, next) {
          if (writer !== null && writer !== source) return;
          writer = source;
          latest = next;
          emit();
        },
        drop: function (source) {
          if (writer !== source) return;
          writer = null;
          latest = null;
          emit();
        },
        peek: function () {
          return latest === undefined ? null : latest;
        },
        isOpen: function () {
          return panelOpen;
        },
        open: function () {
          if (!panelOpen) {
            panelOpen = true;
            emit();
          }
        },
        close: function () {
          if (panelOpen) {
            panelOpen = false;
            emit();
          }
        },
        toggle: function () {
          panelOpen = !panelOpen;
          emit();
        },
        subscribe: function (fn) {
          listeners.add(fn);
          return function () {
            listeners.delete(fn);
          };
        },
      };
    }

    /* ------------------------------------------------------------------ plugin */

    const name = 'xy-dsh-question-nav';
    const inject = ['slots'];

    function apply(ctx) {
      const sxs = makeUseSyncExternalStore();
      const mirror = createMirror();
      const activeStore = createStore(null);
      const seenStore = createStore(null);

      const u = function (value) {
        return value === undefined || value === null ? '' : String(value);
      };

      const useMirror = function () {
        return sxs(mirror.subscribe, function () {
          return mirror;
        });
      };
      const usePanelOpen = function () {
        return sxs(mirror.subscribe, mirror.isOpen);
      };
      const useActiveTurn = function () {
        return sxs(activeStore.subscribe, activeStore.read);
      };
      const useSeen = function () {
        return sxs(seenStore.subscribe, seenStore.read);
      };

      /** Collapse whitespace so a preview stays a single line. */
      function oneLine(value, limit) {
        const text = u(value)
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length <= limit) return text;
        return text.slice(0, limit) + '…';
      }

      /** The Turn number carried by a Chat node's Location, or null. */
      function turnNumberOf(node) {
        const loc = node && node.location;
        if (!loc || (loc.kind !== 'turn' && loc.kind !== 'step')) return null;
        const turn = loc.turn && typeof loc.turn === 'object' ? loc.turn.turn : loc.turn;
        return typeof turn === 'number' && isFinite(turn) ? turn : null;
      }

      /** The text of one user-message content part list. */
      function textOfParts(parts) {
        if (!Array.isArray(parts)) return '';
        let text = '';
        for (let i = 0; i < parts.length; i += 1) {
          const part = parts[i];
          if (part && part.type === 'text' && typeof part.text === 'string') text += part.text;
        }
        return text;
      }

      /** The body text of one assistant step: text blocks only, reasoning dropped. */
      function textOfBlocks(blocks) {
        if (!Array.isArray(blocks)) return '';
        const lines = [];
        for (let i = 0; i < blocks.length; i += 1) {
          const block = blocks[i];
          if (block && block.kind === 'text' && typeof block.text === 'string' && block.text.trim() !== '') lines.push(block.text);
        }
        return lines.join('\n');
      }

      /**
       * Fold the Chat node order into one entry per question, in time order.
       * Questions are `user` / `steering` nodes; an entry's answer is the text of
       * the last `assistant-step` that follows it inside the same Turn.
       */
      function groupEntries(nodes, order) {
        const buckets = new Map();
        const sequence = [];
        for (let i = 0; i < order.length; i += 1) {
          const node = nodes.get(order[i]);
          if (!node || typeof node.kind !== 'string') continue;
          if (node.visibility !== undefined && node.visibility !== 'visible') continue;
          const turn = turnNumberOf(node);
          if (turn === null) continue;
          let bucket = buckets.get(turn);
          if (bucket === undefined) {
            bucket = { turn: turn, seq: null, questions: [] };
            buckets.set(turn, bucket);
            sequence.push(bucket);
          }
          if (node.kind === 'user' || node.kind === 'steering') {
            const text = textOfParts(node.data && node.data.content).trim();
            if (text === '') continue;
            bucket.questions.push({
              key: u(node.key) + '#' + String(bucket.questions.length),
              nodeKey: u(node.key),
              seq: typeof node.seq === 'number' ? node.seq : null,
              text: text,
              steering: node.kind === 'steering',
            });
            if (typeof node.seq === 'number' && (bucket.seq === null || node.seq < bucket.seq)) bucket.seq = node.seq;
          } else if (node.kind === 'assistant-step' && bucket.questions.length > 0) {
            const text = textOfBlocks(node.data && node.data.blocks).trim();
            if (text === '') continue;
            const last = bucket.questions[bucket.questions.length - 1];
            last.answer = text;
            last.answerNodeKey = u(node.key);
            last.running = !!(node.data && node.data.status === 'running');
          }
        }
        const out = [];
        for (let i = 0; i < sequence.length; i += 1) {
          const bucket = sequence[i];
          for (let q = 0; q < bucket.questions.length; q += 1) {
            const question = bucket.questions[q];
            out.push({
              key: question.key,
              nodeKey: question.nodeKey,
              answerNodeKey: question.answerNodeKey === undefined ? null : question.answerNodeKey,
              turn: bucket.turn,
              seq: question.seq === null ? bucket.seq : question.seq,
              index: out.length + 1,
              text: question.text,
              answer: question.answer === undefined ? '' : question.answer,
              running: question.running === true,
              steering: question.steering === true,
            });
          }
        }
        return out.length === 0 ? EMPTY_LIST : out;
      }

      /** The conversation scrollport that owns the chat flow. */
      function findScroller() {
        const direct = document.querySelector('[data-conversation-scroll]');
        if (direct !== null && typeof direct.scrollTop === 'number') return direct;
        const flow = document.querySelector('[data-chat-flow]');
        if (flow !== null) {
          const scroller = flow.closest('[data-conversation-scroll]');
          if (scroller !== null && typeof scroller.scrollTop === 'number') return scroller;
          if (flow.parentElement !== null && typeof flow.parentElement.scrollTop === 'number') return flow.parentElement;
        }
        return null;
      }

      /** Every rendered chat row, or the rows of one node kind. */
      function flowRows(kind) {
        const flow = document.querySelector('[data-chat-flow]');
        if (flow === null) return [];
        const selector =
          kind === undefined ? '[data-chat-flow-key]' : '[data-chat-flow-key][data-chat-flow-kind="' + kind + '"]';
        return Array.prototype.slice.call(flow.querySelectorAll(selector));
      }

      /** A row is navigable only when it is neither folded away nor zero-sized. */
      function rowVisible(el) {
        if (!el || el.hasAttribute('hidden')) return false;
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0;
      }

      /**
       * A question can sit inside a folded turn-process group; open that group's
       * disclosure first so the row can actually be scrolled to.
       */
      function revealRow(el) {
        if (!el || !el.hasAttribute('hidden')) return false;
        const turn = el.getAttribute('data-chat-turn');
        const rows = flowRows();
        for (let i = 0; i < rows.length; i += 1) {
          const candidate = rows[i];
          if (candidate.getAttribute('data-chat-flow-kind') !== 'turn-process') continue;
          if (candidate.getAttribute('data-chat-turn') !== turn) continue;
          const button = candidate.querySelector('button');
          if (button !== null) {
            button.click();
            return true;
          }
        }
        return false;
      }

      /**
       * Move the conversation viewport onto one question.
       *
       * Purely a view operation: it scrolls the transcript to that Turn's user row.
       * When the row is not loaded yet it asks the session for the history through
       * `loadThrough`, then keeps trying for a few frames while React renders it.
       */
      function navigateTo(nodeKey, loadThrough, seq) {
        if (typeof nodeKey !== 'string' || nodeKey === '') return;
        let frames = 0;
        let revealed = false;
        const step = function () {
          frames += 1;
          let row = null;
          try {
            row = document.querySelector('[data-chat-anchor-key="' + nodeKey + '"]');
          } catch (error) {
            row = null;
          }
          if (row === null) {
            if (frames === 1 && typeof loadThrough === 'function' && typeof seq === 'number') {
              try {
                loadThrough(seq);
              } catch (error) {
                /* history paging is best-effort: a missing row just stays put */
              }
            }
          } else if (row.hasAttribute('hidden')) {
            if (!revealed) revealed = revealRow(row);
          } else if (rowVisible(row)) {
            try {
              row.scrollIntoView({ block: 'start', behavior: 'auto' });
            } catch (error) {
              row.scrollIntoView();
            }
            return;
          }
          if (frames < 30) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
      }

      function Icon() {
        return React.createElement(
          'svg',
          { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
          React.createElement('path', {
            d: 'M2.5 3.5h11M2.5 7.5h11M2.5 11.5h7',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
          }),
        );
      }

      function IconButton(options) {
        return React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshq-icoBtn',
            title: options.label,
            'aria-label': options.label,
            'data-on': options.on === true ? 'true' : 'false',
            disabled: options.disabled === true,
            onClick: options.onClick,
          },
          React.createElement(
            'svg',
            { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
            React.createElement('path', {
              d: options.d,
              stroke: 'currentColor',
              strokeWidth: 1.4,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }),
          ),
        );
      }

      /* --------------------------------------------------------- the strip seat */

      /**
       * Subscribe to the Chat store, publish the folded entries to the mirror, and
       * keep the reader's position in the transcript (for the "already seen"
       * marker and the active-card accent) up to date while the reader scrolls.
       */
      function useQaEntries(props, source) {
        const raw = props ? props.useChat : undefined;
        const useChat =
          typeof raw === 'function'
            ? raw
            : function (selector) {
                return selector(EMPTY_QA);
              };
        const order = useChat(function (snapshot) {
          return snapshot && snapshot.order ? snapshot.order : EMPTY_LIST;
        });
        const nodes = useChat(function (snapshot) {
          return snapshot ? snapshot.nodes : null;
        });
        const activeTurn = useActiveTurn();
        const entries = React.useMemo(
          function () {
            if (nodes === null || typeof nodes.get !== 'function') return EMPTY_LIST;
            return groupEntries(nodes, order);
          },
          [nodes, order],
        );
        React.useEffect(
          function () {
            source.writeEntries(
              props === undefined ? undefined : props.sessionId,
              entries,
              props === undefined ? undefined : props.loadThrough,
            );
          },
          [entries, source, props === undefined ? undefined : props.sessionId, props === undefined ? undefined : props.loadThrough],
        );
        const firstKey = entries.length === 0 ? null : entries[0].key;
        React.useEffect(
          function () {
            const scroller = findScroller();
            if (scroller === null) return undefined;
            let scheduled = false;
            const measure = function () {
              scheduled = false;
              const rows = Array.prototype.slice.call(
                scroller.querySelectorAll(
                  '[data-chat-flow-key][data-chat-flow-kind="user"], [data-chat-flow-key][data-chat-flow-kind="steering"]',
                ),
              );
              if (rows.length === 0) return;
              const scrollerRect = scroller.getBoundingClientRect();
              const threshold = scrollerRect.top + Math.min(140, Math.max(48, scroller.clientHeight * 0.22));
              let best = null;
              for (let i = 0; i < rows.length; i += 1) {
                const row = rows[i];
                if (!rowVisible(row)) continue;
                if (row.getBoundingClientRect().top <= threshold) best = row;
                else break;
              }
              if (best === null) best = rows[0];
              const rawTurn = best.getAttribute('data-chat-turn');
              const turn = rawTurn === null ? null : Number(rawTurn);
              const value = typeof turn === 'number' && isFinite(turn) ? turn : null;
              activeStore.write(value);
              seenStore.write(value);
            };
            const onScroll = function () {
              if (scheduled) return;
              scheduled = true;
              window.requestAnimationFrame(measure);
            };
            scroller.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onScroll);
            measure();
            return function () {
              scroller.removeEventListener('scroll', onScroll);
              window.removeEventListener('resize', onScroll);
            };
          },
          [firstKey, entries.length],
        );
        React.useEffect(
          function () {
            return function () {
              source.release(props === undefined ? undefined : props.sessionId);
            };
          },
          [source, props === undefined ? undefined : props.sessionId],
        );
        return { entries: entries, activeTurn: activeTurn };
      }

      /** The always-visible current question, plus its pull-down question history. */
      function QuestionStrip(props) {
        const state = useQaEntries(props, source);
        const seen = useSeen();
        const open = usePanelOpen();
        const historyPair = React.useState(false);
        const historyOpen = historyPair[0];
        const setHistoryOpen = historyPair[1];
        const expandedPair = React.useState(false);
        const expanded = expandedPair[0];
        const setExpanded = expandedPair[1];
        const activePair = React.useState(null);
        const localActive = activePair[0];
        const setLocalActive = activePair[1];
        const entries = state.entries;
        const total = entries.length;
        const current = total === 0 ? null : entries[total - 1];
        React.useEffect(
          function () {
            if (!historyOpen) return undefined;
            const onKeyDown = function (event) {
              if (event.key === 'Escape') setHistoryOpen(false);
            };
            window.addEventListener('keydown', onKeyDown);
            return function () {
              window.removeEventListener('keydown', onKeyDown);
            };
          },
          [historyOpen],
        );
        React.useEffect(
          function () {
            if (localActive === null) return;
            const settled = activeStore.read();
            if (settled === localActive) setLocalActive(null);
          },
          [state.activeTurn, localActive],
        );
        const jump = function (entry) {
          if (typeof entry.turn === 'number') {
            setLocalActive(entry.turn);
            activeStore.write(entry.turn);
          }
          navigateTo(entry.nodeKey, props.loadThrough, entry.seq);
        };
        if (current === null) return null;
        const history = entries;
        return React.createElement(
          'div',
          { className: 'dshq-strip', 'data-dshq-strip': '', 'data-chat-turn': current.turn },
          React.createElement(
            'div',
            { className: 'dshq-stripRow' },
            React.createElement(
              'div',
              { className: 'dshq-stripBody' },
              React.createElement(
                'div',
                {
                  className: 'dshq-stripText',
                  'data-collapsed': expanded ? 'false' : 'true',
                  'data-expanded': expanded ? 'true' : 'false',
                  role: 'button',
                  tabIndex: 0,
                  title: expanded ? '点击收起' : current.text,
                  onClick: function () {
                    setExpanded(!expanded);
                  },
                  onKeyDown: function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setExpanded(!expanded);
                    }
                  },
                },
                current.text,
              ),
            ),
            React.createElement(
              'div',
              { className: 'dshq-stripNav' },
              React.createElement(IconButton, {
                label: historyOpen ? '收起历次提问' : '展开历次提问（点击可回退到那一轮）',
                d: historyOpen ? 'M3.5 10 8 5.5l4.5 4.5' : 'M3.5 6 8 10.5 12.5 6',
                on: historyOpen,
                onClick: function () {
                  setHistoryOpen(!historyOpen);
                },
              }),
              React.createElement(IconButton, {
                label: open ? '收起问答总览' : '展开问答总览',
                d: 'M2.5 3.5h11M2.5 7.5h11M2.5 11.5h7',
                on: open,
                onClick: function () {
                  mirror.toggle();
                },
              }),
            ),
          ),
          historyOpen
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement('div', {
                  className: 'dshq-backdrop2',
                  onClick: function () {
                    setHistoryOpen(false);
                  },
                }),
                React.createElement(
                  'div',
                  { className: 'dshq-menu', role: 'menu', 'data-dshq-history': '' },
                  React.createElement(
                    'div',
                    { className: 'dshq-menuHead' },
                    React.createElement('span', null, '历次提问 · 共 ', React.createElement('b', null, String(total)), ' 条'),
                    React.createElement('span', null, '点击回退到那一轮'),
                  ),
                  history.map(function (entry, position) {
                    const isCurrent = position === history.length - 1;
                    const isSeen = seen !== null && entry.turn <= seen;
                    return React.createElement(
                      'button',
                      {
                        key: entry.key,
                        type: 'button',
                        className: 'dshq-menuRow',
                        'data-query-turn': entry.turn,
                        'data-current': isCurrent ? 'true' : 'false',
                        title: entry.text,
                        onClick: function () {
                          setHistoryOpen(false);
                          jump(entry);
                        },
                      },
                      React.createElement('span', { className: 'dshq-menuIndex' }, String(entry.index)),
                      React.createElement(
                        'span',
                        { className: 'dshq-menuText' },
                        oneLine(entry.text, 70),
                        entry.answer === ''
                          ? null
                          : React.createElement('span', { className: 'dshq-menuSub' }, '答 · ' + oneLine(entry.answer, 60)),
                      ),
                      isSeen && !isCurrent ? React.createElement('span', { className: 'dshq-menuSeen', 'aria-hidden': 'true' }) : null,
                    );
                  }),
                  history.length === 0 ? React.createElement('span', { className: 'dshq-emptyChip' }, '暂无提问') : null,
                ),
              )
            : null,
        );
      }

      /* -------------------------------------------------------- the header seat */

      /** The session-header entry; its count proves the strip is publishing. */
      function HeaderButton() {
        const open = usePanelOpen();
        const state = useMirror();
        const latest = state && typeof state.peek === 'function' ? state.peek() : null;
        const total = latest === null || !Array.isArray(latest.entries) ? 0 : latest.entries.length;
        return React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshq-headBtn',
            'data-active': open ? 'true' : 'false',
            title: '问答总览：本会话每次提问与 Agent 的回答',
            'aria-expanded': open,
            onClick: function () {
              mirror.toggle();
            },
          },
          React.createElement(Icon),
          total > 0 ? '问答总览 ' + total : '问答总览',
        );
      }

      /* -------------------------------------------------------- the drawer seat */

      /** The right-hand overview: every question with its full answer. */
      function OverviewPanel() {
        const open = usePanelOpen();
        const state = useMirror();
        const activeTurn = useActiveTurn();
        const expandedPair = React.useState(null);
        const expandedKey = expandedPair[0];
        const setExpandedKey = expandedPair[1];
        const listRef = React.useRef(null);
        React.useEffect(
          function () {
            if (!open) return undefined;
            const onKeyDown = function (event) {
              if (event.key === 'Escape') mirror.close();
            };
            window.addEventListener('keydown', onKeyDown);
            return function () {
              window.removeEventListener('keydown', onKeyDown);
            };
          },
          [open],
        );
        React.useEffect(
          function () {
            if (!open) return;
            const list = listRef.current;
            if (list !== null) list.scrollTop = 0;
            const latest = mirror.peek();
            const entries = latest === null || !Array.isArray(latest.entries) ? EMPTY_LIST : latest.entries;
            if (entries.length > 0) setExpandedKey(entries[entries.length - 1].key);
          },
          [open],
        );
        if (!open) return null;
        const latest = state && typeof state.peek === 'function' ? state.peek() : null;
        const entries = latest === null || !Array.isArray(latest.entries) ? EMPTY_LIST : latest.entries;
        const renderCard = function (entry) {
          const expanded = expandedKey === entry.key;
          const longQuestion = entry.text.length > 120 || entry.text.indexOf('\n') !== -1;
          const longAnswer = entry.answer.length > 200 || entry.answer.indexOf('\n') !== -1;
          const pending = entry.answer === '';
          return React.createElement(
            'div',
            {
              key: entry.key,
              className: 'dshq-card',
              'data-active': activeTurn !== null && entry.turn === activeTurn ? 'true' : 'false',
              onClick: function () {
                setExpandedKey(expanded ? null : entry.key);
              },
            },
            React.createElement(
              'div',
              { className: 'dshq-cardTop' },
              React.createElement('span', { className: 'dshq-index' }, 'Q' + entry.index),
              React.createElement(
                'div',
                { className: 'dshq-cardQ', 'data-collapsed': !expanded && longQuestion ? 'true' : 'false' },
                entry.text,
              ),
              entry.steering ? React.createElement('span', { className: 'dshq-badge' }, '插话') : null,
            ),
            React.createElement(
              'div',
              { className: 'dshq-cardA', 'data-pending': pending ? 'true' : 'false' },
              React.createElement('span', { className: 'dshq-rail', 'aria-hidden': 'true' }),
              React.createElement(
                'div',
                { className: 'dshq-cardAText', 'data-collapsed': !expanded && longAnswer ? 'true' : 'false' },
                pending ? (entry.running ? '正在回答…' : '本轮暂无正文回答') : entry.answer,
              ),
            ),
            expanded
              ? React.createElement(
                  'div',
                  { className: 'dshq-tail' },
                  React.createElement('span', { className: 'dshq-badge' }, '第 ' + (entry.turn + 1) + ' 轮'),
                  React.createElement(IconButton, {
                    label: '跳转到这一问',
                    d: 'M3 8h9M8.5 4.5 12 8l-3.5 3.5',
                    onClick: function (event) {
                      event.stopPropagation();
                      if (latest !== null && typeof latest.jump === 'function') latest.jump(entry);
                      mirror.close();
                    },
                  }),
                )
              : null,
          );
        };
        return React.createElement(
          React.Fragment,
          null,
          React.createElement('div', {
            className: 'dshq-backdrop',
            onClick: function () {
              mirror.close();
            },
          }),
          React.createElement(
            'aside',
            { className: 'dshq-panel', role: 'dialog', 'aria-label': '问答总览', 'data-dshq-panel': '' },
            React.createElement(
              'div',
              { className: 'dshq-panelHead' },
              React.createElement(
                'span',
                { className: 'dshq-panelTitle' },
                '问答总览',
                entries.length > 0 ? React.createElement('i', null, ' · 共 ' + entries.length + ' 问') : null,
              ),
              React.createElement(IconButton, {
                label: '关闭',
                d: 'M4 4l8 8M12 4l-8 8',
                onClick: function () {
                  mirror.close();
                },
              }),
            ),
            entries.length === 0
              ? React.createElement('div', { className: 'dshq-empty' }, '本次会话还没有提问。')
              : React.createElement('div', { className: 'dshq-panelList', ref: listRef }, entries.map(renderCard)),
          ),
        );
      }

      /* ------------------------------------------------------------- publishing */

      /** What the strip hands to the two seats outside the conversation subtree. */
      const source = {
        writeEntries: function (sessionId, entries, loadThrough) {
          mirror.write(source, {
            sessionId: sessionId,
            entries: entries,
            jump: function (entry) {
              navigateTo(entry.nodeKey, loadThrough, entry.seq);
            },
          });
        },
        release: function (sessionId) {
          const latest = mirror.peek();
          if (latest === null) return;
          if (latest.sessionId === sessionId) mirror.drop(source);
        },
      };

      /* ----------------------------------------------------------- registration */

      /* Our accent layer: one layer over the active theme, both schemes, removed
         with the plugin. */
      const theme = ctx.get('theme');
      if (theme !== undefined && theme !== null) {
        theme.overrideTokens('xy-dsh-question-nav/accent', {
          '--dshq-accent': ACCENT,
          '--dshq-accent-soft': ACCENT_SOFT,
        });
      }

      ctx.effect(function () {
        return insertStyles(CSS);
      }, 'xy-dsh-question-nav: styles');

      ctx.slots.inject('conversation.input.dock', function () {
        return ctx.slots.register(
          { name: 'conversation.input.dock', id: 'xy-dsh-question-nav-current', order: -100, label: '当前提问' },
          QuestionStrip,
        );
      });

      ctx.slots.inject('conversation.session.header.utilities', function () {
        return ctx.slots.register(
          { name: 'conversation.session.header.utilities', id: 'xy-dsh-question-nav-overview', order: 20, label: '问答总览' },
          HeaderButton,
        );
      });

      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register(
          { name: 'shell.overlay', id: 'xy-dsh-question-nav-panel', order: 40, label: '问答总览' },
          OverviewPanel,
        );
      });
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
