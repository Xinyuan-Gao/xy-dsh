# xy-dsh-context

DeepSeek Harness 的会话级 Context Lens。读取 `sessionStats` 与 `tokenUsage` 两个 projection，把当前会话的用量显示出来。

## 显示什么

| 指标 | 来源 |
|---|---|
| `TURNS` | `sessionStats.turns` |
| `STEPS` | `sessionStats.steps` |
| `CACHE HIT` | `cacheReadTokens / (uncachedInputTokens + cacheReadTokens + cacheWriteTokens)` |
| `OUTPUT` | `tokenUsage.outputTokens` |

面板底部还有一行明细：`input · cacheRead · cacheWrite`。

## 挂在哪

客户端注册了三个插槽，都是只读展示，不写会话状态：

| 插槽 | 内容 |
|---|---|
| `conversation.input.dock` | 输入区上方的完整面板（Turns / Steps / Cache hit / Output） |
| `conversation.session.header.actions` | 标题栏的 `Context +/−` 按钮，点开是同一个面板 |
| `sidebar.footer.action` | 侧栏底部的说明卡片 |

## 安装

属于 [xy-dsh](../) 集合。直接装：

```bash
dsh plugin --profile web add "github:Xinyuan-Gao/xy-dsh#path:xy-dsh-context"
```

要改代码就先 clone，再用 `link:` 装：

```bash
git clone https://github.com/Xinyuan-Gao/xy-dsh.git
cd xy-dsh
dsh plugin --profile web add link:"$PWD/xy-dsh-context"
```

然后重启 DSH Desktop，或重启 `dsh web`。

## 状态

原型。projection 名（`sessionStats`、`tokenUsage`）和字段名、以及三个插槽名都对着 DSH 2.0.9 的包核过，但本机没在 desktop profile 里长期用它，实际观感没有验证过。
