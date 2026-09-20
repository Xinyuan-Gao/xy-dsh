/**
 * Build the preview pages used for the README screenshots.
 *
 * The point of this script: it does NOT re-type the stylesheet. It imports the
 * real plugin module, runs `apply()` against a mock Cordis context, and takes
 * the CSS string the plugin would have inserted — so a preview always shows
 * exactly the styles the plugin ships. The only thing reproduced by hand is the
 * host chrome around it (sidebar / header / message list), which belongs to DSH
 * rather than to this plugin.
 *
 * Usage: node tools/build-previews.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'previews');

/* ------------------------------------------------ 1. capture the real CSS */

/**
 * Read the stylesheet straight out of the plugin source, so the preview can
 * never drift from what the plugin actually inserts.
 */
async function readPluginCss() {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(join(root, 'lib', 'client.js'), 'utf8');
  const match = source.match(/const CSS = `([\s\S]*?)`;\n/);
  if (match === null) throw new Error('preview: CSS template not found in lib/client.js');
  // The stylesheet sits inside the module factory, so the template carries that
  // nesting's indentation. Strip the common prefix so the preview shows the
  // stylesheet as written rather than as indented.
  const lines = match[1].split('\n');
  const indents = lines.filter((line) => line.trim() !== '').map((line) => line.match(/^ */)[0].length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(common)).join('\n');
}

const pluginCss = await readPluginCss();
if (!pluginCss.includes('.dshq-stripRow')) {
  throw new Error('preview: captured stylesheet looks wrong');
}

/* ------------------------------------------------------- 2. theme tokens */

const SANS = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;

const THEMES = {
  light: {
    '--dsw-alias-bg-base': '#FFFFFF',
    '--dsw-alias-bg-layer-1': '#FFFFFF',
    '--dsw-alias-bg-layer-2': '#F5F6F7',
    '--dsw-alias-bg-overlay': '#FFFFFF',
    '--dsw-alias-border-l1': '#E6E8EB',
    '--dsw-alias-border-l2': '#D3D7DD',
    '--dsw-alias-label-primary': '#1B1E23',
    '--dsw-alias-label-secondary': '#5C6470',
    '--dsw-alias-brand-primary': '#3355FF',
    '--dsw-specific-sidebar-fill': '#FAFAFB',
    '--dshq-accent': '#0F766E',
    '--dshq-accent-soft': '#E4F4F1',
    '--frame': '#EDEFF2',
    '--msg-user': '#EFF1F4',
    '--code': '#F4F5F7',
  },
  dark: {
    '--dsw-alias-bg-base': '#17181B',
    '--dsw-alias-bg-layer-1': '#1D1F23',
    '--dsw-alias-bg-layer-2': '#24262B',
    '--dsw-alias-bg-overlay': '#212327',
    '--dsw-alias-border-l1': '#2E3136',
    '--dsw-alias-border-l2': '#3C4046',
    '--dsw-alias-label-primary': '#E8EAED',
    '--dsw-alias-label-secondary': '#9AA1AC',
    '--dsw-alias-brand-primary': '#7B93FF',
    '--dsw-specific-sidebar-fill': '#1B1C20',
    '--dshq-accent': '#2DD4BF',
    '--dshq-accent-soft': '#10312E',
    '--frame': '#101113',
    '--msg-user': '#26282D',
    '--code': '#202226',
  },
};

/* ------------------------------------------------- 3. host chrome + data */

const questions = [
  ['不是横着，而是当前只展示这个问题的 query，然后可以点开一个拉取的列表', '改成默认只展示当前一条提问，点右侧箭头向上拉出历次提问列表；点其中任意一条把对话视图回退到那一轮。回退只移动视口，不动代码、文件和会话内容。'],
  ['我想要做一个 deepseek harness 插件，针对对话界面，让每次提问吸顶', '已定义 qnav-1 并挂到三个槽位：输入框上方常驻当前提问、页头新增「问答总览」按钮、右侧问答抽屉。数据取自会话级 useChat 快照，按轮次把 user / steering 节点与 assistant-step 文本配对。'],
  ['这版成片 1920×1080 / 60fps / 79 秒，旁白落点逐段核对过了', '79 秒的成片配 60fps 时间轴，旁白每句都落在对应镜头上，没有一句拖到下一段。真正要改的是第二段配音语速，我按镜头长度压过语速，听着偏快。'],
  ['录音棚那边说今晚能出母版，字幕文件我明天上午给你', '收到。母版出来先别急着自己压，等字幕对轴确认后再走一次封装，避免音画偏移被二次编码放大。'],
];

const answers = questions.map((q) => q[1]);

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svg(path, size) {
  const s = size || 13;
  return `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const ICON_LIST = 'M2.5 3.5h11M2.5 7.5h11M2.5 11.5h7';
const ICON_CHEVRON = 'M3.5 6 8 10.5 12.5 6';
const ICON_CHEVRON_UP = 'M3.5 10 8 5.5l4.5 4.5';
const ICON_CLOSE = 'M4 4l8 8M12 4l-8 8';
const ICON_GO = 'M3 8h9M8.5 4.5 12 8l-3.5 3.5';

function header(theme) {
  return `
  <header class="cr-header">
    <div class="cr-titleRow">
      <div class="cr-crumbs">
        <span class="cr-crumb">blog</span><span class="cr-sep">/</span><span class="cr-crumb cr-current">配音语速与字幕对轴</span>
      </div>
      <div class="cr-utils">
        <span class="cr-util">${svg('M8 3v10M3 8h10', 13)}</span>
        <span class="cr-util">${svg('M8 4v5l3 2M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z', 13)}</span>
        <button class="dshq-headBtn" data-active="false">${svg(ICON_LIST, 13)}问答总览 4</button>
        <span class="cr-util">${svg('M3 3h10v8H3zM6 13h4', 13)}</span>
      </div>
    </div>
    <div class="cr-tabs"><span class="cr-tab cr-tabActive">对话</span><span class="cr-tab">轨迹</span><span class="cr-tab">上下文</span></div>
  </header>`;
}

function transcript(theme) {
  return questions
    .map(
      (q, i) => `
    <div class="cr-turn">
      <div class="cr-user">${esc(q[0])}</div>
      <div class="cr-assistant"><span class="cr-avatar">DS</span><div class="cr-md">${esc(answers[i])}</div></div>
    </div>`,
    )
    .join('');
}

function strip(theme, opts) {
  const withMenu = opts.withMenu === true;
  const withDrawer = opts.withDrawer === true;
  const current = questions[questions.length - 1][0];

  const menu = withMenu
    ? `
      <div class="dshq-menu" role="menu"${opts.menuInline === true ? ' style="position:relative;bottom:auto;margin-bottom:8px"' : ''}>
        <div class="dshq-menuHead"><span>历次提问 · 共 <b>4</b> 条</span><span>点击回退到那一轮</span></div>
        ${questions
          .map((q, i) => {
            const isCurrent = i === questions.length - 1;
            const isSeen = i < questions.length - 1;
            return `
        <button class="dshq-menuRow" data-current="${isCurrent}">
          <span class="dshq-menuIndex">${i + 1}</span>
          <span class="dshq-menuText">${esc(q[0].slice(0, 70))}
            <span class="dshq-menuSub">答 · ${esc(q[1].slice(0, 60))}</span>
          </span>
          ${isSeen && !isCurrent ? '<span class="dshq-menuSeen"></span>' : ''}
        </button>`;
          })
          .join('')}
      </div>`
    : '';

  const drawer = withDrawer
    ? `
  <div class="dshq-backdrop"></div>
  <aside class="dshq-panel" role="dialog" aria-label="问答总览">
    <div class="dshq-panelHead">
      <span class="dshq-panelTitle">问答总览<i> · 共 4 问</i></span>
      <button class="dshq-icoBtn">${svg(ICON_CLOSE, 13)}</button>
    </div>
    <div class="dshq-panelList">
      ${questions
        .map((q, i) => {
          const active = i === 1;
          const expanded = i === questions.length - 1;
          return `
      <div class="dshq-card" data-active="${active}">
        <div class="dshq-cardTop">
          <span class="dshq-index">Q${i + 1}</span>
          <div class="dshq-cardQ" data-collapsed="${!expanded}">${esc(q[0])}</div>
        </div>
        <div class="dshq-cardA" data-pending="false">
          <span class="dshq-rail"></span>
          <div class="dshq-cardAText" data-collapsed="${!expanded}">${esc(q[1])}</div>
        </div>
        ${
          expanded
            ? `<div class="dshq-tail"><span class="dshq-badge">第 ${i + 1} 轮</span><button class="dshq-icoBtn">${svg(ICON_GO, 13)}</button></div>`
            : ''
        }
      </div>`;
        })
        .join('')}
    </div>
  </aside>`
    : '';

  return `
    <div class="dshq-strip" data-chat-turn="3">
      ${menu}
      <div class="dshq-stripRow">
        <div class="dshq-stripBody">
          <div class="dshq-stripText" data-collapsed="true" data-expanded="false" role="button">${esc(current)}</div>
        </div>
        <div class="dshq-stripNav">
          <button class="dshq-icoBtn" data-on="${withMenu}">${svg(withMenu ? ICON_CHEVRON_UP : ICON_CHEVRON, 13)}</button>
          <button class="dshq-icoBtn" data-on="${withDrawer}">${svg(ICON_LIST, 13)}</button>
        </div>
      </div>
    </div>
    ${drawer}`;
}

function page(themeName, opts) {
  const tokens = THEMES[themeName];
  const tokenCss = Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `<!doctype html>
<html lang="zh-CN" data-theme="${themeName}">
<head>
<meta charset="utf-8" />
<title>xy-question-nav preview (${themeName})</title>
<style>
:root{
${tokenCss}
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--frame);color:var(--dsw-alias-label-primary);font-family:${SANS};-webkit-font-smoothing:antialiased}
.frame{display:flex;height:100vh;padding:10px;gap:10px}
.side{width:212px;flex:none;background:var(--dsw-specific-sidebar-fill);border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 10px;display:flex;flex-direction:column;gap:6px}
.side .brand{font-size:13px;font-weight:600;padding:4px 8px 10px}
.side .row{font-size:12.5px;color:var(--dsw-alias-label-secondary);padding:6px 8px;border-radius:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.side .row.on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.main{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden}
.cr-header{flex:none;border-bottom:.5px solid var(--dsw-alias-border-l1);padding:10px 22px 0 18px}
.cr-titleRow{display:flex;align-items:center;min-height:30px;gap:10px}
.cr-crumbs{flex:1;min-width:0;display:flex;align-items:center;gap:4px;font-size:14px;line-height:20px;overflow:hidden;white-space:nowrap}
.cr-crumb{color:var(--dsw-alias-label-secondary);padding:4px 8px}
.cr-sep{color:var(--dsw-alias-label-secondary);opacity:.6}
.cr-current{color:var(--dsw-alias-label-primary);font-weight:500}
.cr-utils{flex:none;display:flex;align-items:center;gap:8px}
.cr-util{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;color:var(--dsw-alias-label-secondary);border:.5px solid transparent}
.cr-tabs{display:flex;gap:32px;margin-top:10px;padding-left:6px}
.cr-tab{font-size:13px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-secondary);padding-bottom:9px;position:relative}
.cr-tabActive{color:var(--dsw-alias-brand-primary)}
.cr-tabActive:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}
.cr-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:16px 0 0}
.cr-transcript{flex:1;min-height:0;overflow:hidden;padding:0 28px;display:flex;flex-direction:column;gap:16px}
.cr-turn{display:flex;flex-direction:column;gap:8px}
.cr-user{align-self:flex-end;max-width:64%;background:var(--msg-user);border-radius:12px;padding:8px 12px;font-size:13px;line-height:20px}
.cr-assistant{display:flex;gap:8px;max-width:78%}
.cr-avatar{flex:none;width:22px;height:22px;border-radius:6px;background:var(--code);color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center}
.cr-md{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);opacity:.92}
.cr-composer{flex:none;padding:10px 28px 20px;display:flex;flex-direction:column;gap:8px}
.cr-card{border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:10px 12px;color:var(--dsw-alias-label-secondary);font-size:13px;display:flex;align-items:center;justify-content:space-between}
.cr-send{width:26px;height:26px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center}
${pluginCss}
</style>
</head>
<body>
<div class="frame">
  <div class="side">
    <div class="brand">DeepSeek Harness</div>
    <div class="row on">blog</div>
    <div class="row">配音语速与字幕对轴</div>
    <div class="row">xy-question-nav 设计</div>
    <div class="row">母版封装流程</div>
  </div>
  <div class="main">
    ${header(themeName)}
    <div class="cr-body">
      <div class="cr-transcript">${transcript(themeName)}</div>
      <div class="cr-composer">
        ${strip(themeName, opts)}
        <div class="cr-card"><span>随便问点什么…</span><span class="cr-send">${svg('M3 8h9M8.5 4.5 12 8l-3.5 3.5', 13)}</span></div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}


/* ------------------------------------------- 4b. tight crops for the README */

function tokenBlock(themeName) {
  return Object.entries(THEMES[themeName])
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

function cropPage(themeName, opts) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="${themeName}">
<head><meta charset="utf-8" />
<style>
:root{
${tokenBlock(themeName)}
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:${SANS};-webkit-font-smoothing:antialiased;padding:${opts.menuRoom === true ? '384px' : '18px'} 22px 22px}
.host{display:flex;flex-direction:column;gap:10px}
.hostCard{border:.5px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:10px 12px;color:var(--dsw-alias-label-secondary);font-size:13px;display:flex;align-items:center;justify-content:space-between}
.headBar{display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:2px 0 4px}
${pluginCss}
</style></head>
<body>
${
  opts.bar === true
    ? `<div class="host"><div class="hostCard" style="justify-content:flex-end;gap:8px;border:none;background:transparent;padding:0">
        <span class="crUtil" style="display:inline-flex;width:26px;height:26px;border-radius:8px;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)">${svg('M8 3v10M3 8h10', 13)}</span>
        <span class="crUtil" style="display:inline-flex;width:26px;height:26px;border-radius:8px;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)">${svg('M8 4v5l3 2M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z', 13)}</span>
        <button class="dshq-headBtn" data-active="${opts.active === true}">${svg(ICON_LIST, 13)}问答总览 4</button>
        <span class="crUtil" style="display:inline-flex;width:26px;height:26px;border-radius:8px;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)">${svg('M3 3h10v8H3zM6 13h4', 13)}</span>
      </div></div>`
    : `<div class="host">${strip(themeName, opts)}<div class="hostCard"><span>随便问点什么…</span><span>→</span></div></div>`
}
</body></html>`;
}

await mkdir(out, { recursive: true });
const variants = [
  ['light', 'strip', { withMenu: false, withDrawer: false }],
  ['light', 'history', { withMenu: true, withDrawer: false }],
  ['light', 'drawer', { withMenu: false, withDrawer: true }],
  ['dark', 'strip', { withMenu: false, withDrawer: false }],
  ['dark', 'history', { withMenu: true, withDrawer: false }],
  ['dark', 'drawer', { withMenu: false, withDrawer: true }],
];

for (const [themeName, kind, opts] of variants) {
  const file = join(out, `${themeName}-${kind}.html`);
  await writeFile(file, page(themeName, opts), 'utf8');
  console.log('wrote', file);
}

const crops = [
  ['light', 'crop-strip', { withMenu: false, withDrawer: false }],
  ['dark', 'crop-strip', { withMenu: false, withDrawer: false }],
  ['light', 'crop-history', { withMenu: true, withDrawer: false, menuInline: true }],
  ['dark', 'crop-history', { withMenu: true, withDrawer: false, menuInline: true }],
  ['light', 'crop-button', { bar: true, active: false }],
  ['light', 'crop-button-active', { bar: true, active: true }],
];
for (const [themeName, kind, opts] of crops) {
  const file = join(out, `${kind}-${themeName}.html`);
  await writeFile(file, cropPage(themeName, opts), 'utf8');
  console.log('wrote', file);
}
