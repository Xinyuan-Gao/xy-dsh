/**
 * Host half of xy-dsh-question-nav.
 *
 * The plugin is client-only: the question strip, the overview button and the
 * drawer all live in the browser bundle. This entry exists because the Loader
 * needs a host row to mount — that row is what carries `dsh.client`, which is
 * how the client module system finds `./client` and serves it to the page.
 *
 * It deliberately has no behaviour, and `apply` must keep returning undefined:
 * Cordis executes an effect's return value, so a stray `return {}` fails the
 * whole plugin load.
 */

export const name = 'xy-dsh-question-nav'

export const inject = []

export function apply(ctx) {
  ctx.logger?.info?.('[xy-dsh-question-nav] host loaded')
}
