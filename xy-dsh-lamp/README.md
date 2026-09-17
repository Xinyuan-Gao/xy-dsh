# xy-dsh-lamp

DeepSeek Harness 终端灯板。Host 会拉起一条 **系统级置顶窗**：浮在所有 App、所有工作台之上，不嵌在 DSH 窗口里。每个 Agent 一盏灯，全绿后收成 `完成  04/04`。根 Agent 结束时发系统通知。

macOS 用独立 HUD（`canJoinAllSpaces`）。DSH 退出后灯板会自己关掉。界面里不挂任何卡片。

## 语言

**默认中文。** 标题栏那个 `中` / `EN` 按钮切换语言，点一下立刻换。选择会写到 `~/.dsh/xy-dsh-lamp.json`，重启 DSH 后仍然生效（改 `index.mjs` 这类宿主代码需要重启 DSH 才会加载，只改页面不用）。

| 状态 | 中文 | English |
|---|---|---|
| 待命 | 待命 | IDLE |
| 工作中 | 工作中 | RUN |
| 等你 | 等你 | ASK |
| 出错 | 出错 | ERR |
| 完成 | 完成 | DONE（灯格里是 OK） |

Agent 代号在中文下也会跟着变：`ROOT` → `主`，`A1` / `A2` → `子1` / `子2`。这只是显示，宿主内部仍然用 `ROOT` / `A1`。

首次安装的默认语言由配置里的 `lang` 决定（见文末），一旦用按钮切过，按钮的选择优先。

## 移动

**整块灯板都能拖**（鼠标是抓手），标题栏右侧的 `中` / `EN` 和 `−` 两个按钮除外。位置不会跨重启保留。

AppKit 自带的拖拽（`performDrag`、`isMovableByWindowBackground`）对「无边框 + 透明」窗口完全不生效——四种组合都实测过，一律直接返回。而这个 WKWebView 的 `window.screenX/screenY` 返回的是垃圾值（实测 `0` / 屏幕高度），页面也报不出屏幕坐标。所以拖动是这样做的：页面只负责在 `pointerdown / pointermove / pointerup` 时报「指针动了」，宿主用 `NSEvent.mouseLocation` 读真实光标位置，按增量搬窗口。

增量是逐次累加的，所以拖动中途窗口尺寸变化（agent 数量变了、或收起态展开）也不会错位。

「点击」还是「拖动」由宿主判定：整段手势位移小于 4pt 算点击。收起态的小灯被点击就展开，被拖动就只移位、不展开。

## 版面

窗口是**透明圆角窗**，尺寸跟着内容走：页面量出自己的自然尺寸后回报给 HUD，窗口按这个尺寸调整，左上角固定不动。

| 状态 | 尺寸（中文 / 英文） |
|---|---|
| 待命（无 Agent） | 188×65 / 213×65 |
| 1 个 Agent | 199×65 / 206×65 |
| 满 6 个 Agent | 344×65 / 338×65 |
| 全部完成 | 211×29 / 219×29（收成一行 `完成  02/02`） |
| 收起 | 30×30（两种语言相同） |

尺寸是 WKWebView 里实测的；中文字宽所以 6 灯时比英文略宽一点。

标题栏右侧的 `−` 把灯板**收起成一个灯**：一个圆角小方块，里面一盏灯表示整体状态，鼠标悬停显示 `状态 用时 · 会话标题`。点这个小方块展开，拖它则只移位。收起状态不跨重启保留。

灯色（灯板与收起态一致）：

| 灯 | 状态 |
|---|---|
| 灰 | 待命 |
| 琥珀 | 工作中 |
| 琥珀闪 | 等你（提问 / 审批） |
| 红 | 出错 |
| 绿 | 完成 |

一盏灯出错时，标题栏的 `工作中 / 等你` 会变成红色的 `出错`，但其余灯照常显示各自的进度。

## 安装

属于 [xy-dsh](../) 集合。直接装：

```bash
dsh plugin --profile desktop add "github:Xinyuan-Gao/xy-dsh#path:xy-dsh-lamp"
dsh plugin --profile web add "github:Xinyuan-Gao/xy-dsh#path:xy-dsh-lamp"
```

要改代码就先 clone，再用 `link:` 装：

```bash
git clone https://github.com/Xinyuan-Gao/xy-dsh.git
cd xy-dsh
dsh plugin --profile desktop add link:"$PWD/xy-dsh-lamp"
```

然后重启 DSH Desktop，或重启 `dsh web`。

灯板是独立编译出来的 macOS HUD：首次加载时宿主用 `swiftc` 把 `hud.swift` 编到 `~/.dsh/xy-dsh-lamp-hud.app`，所以机器上要有 Xcode Command Line Tools。改了 `hud.swift` 之后重启 DSH，`compileHud` 会比较 mtime 自动重编。

## 配置

`~/.dsh/profiles/<profile>/cordis.patch.yml`：

```yaml
- id: xy-dsh-lamp
  name: xy-dsh-lamp
  config:
    enabled: true
    notify: true
    sound: true
    lang: zh      # zh | en，只决定首次安装的默认语言
```
