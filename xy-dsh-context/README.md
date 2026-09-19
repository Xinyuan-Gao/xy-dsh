# xy-dsh-context

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)
[![DSH](https://img.shields.io/badge/dsh-0.1.5--rc.1%20%7C%200.1.5--rc.2%20%7C%200.1.6--alpha.2-blue.svg)](../COMPATIBILITY.md)
[![Status](https://img.shields.io/badge/status-prototype-orange.svg)](#状态)

**会话级 Context Lens。** 读取 `sessionStats` 与 `tokenUsage` 两个 projection，把当前会话的用量显示出来。

> **状态：原型。** 见文末[状态](#状态)一节——插槽名、projection 名和字段名都对着 DSH 2.0.9 的包核过，但**没有实际渲染验证过**。

## 装

需要 Node ≥ 22.19.0：

```bash
dsh plugin --profile web add "github:Xinyuan-Gao/xy-dsh#path:xy-dsh-context"
```

装完重启 DSH Desktop，或重启 `dsh web`。

想改代码就 clone 下来用 `link:` 装一份可编辑的：

```bash
git clone https://github.com/Xinyuan-Gao/xy-dsh.git
cd xy-dsh
dsh plugin --profile web add link:"$PWD/xy-dsh-context"
```

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

## 状态

原型，没在 desktop profile 里长期用过，所以**实际观感没有验证过**：

| 项 | 状态 |
|---|---|
| projection 名（`sessionStats`、`tokenUsage`）与字段名 | ✅ 对着 DSH 2.0.9 的包核过 |
| 三个插槽名 | ✅ 对着 `dsh-client-modules` 与 UI 包核过 |
| 界面实际渲染 | ❌ 没见过 |
| 兼容性声明与安装证据 | ✅ 见 [COMPATIBILITY.md](../COMPATIBILITY.md) |

欢迎提 issue 告诉我它长什么样。

# License

MIT
