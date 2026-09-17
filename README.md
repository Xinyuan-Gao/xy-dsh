# xy-dsh

自己用的 [DeepSeek Harness](https://github.com/deepseek-ai) 插件集合。

| 插件 | 做什么 | 状态 |
|---|---|---|
| [xy-dsh-lamp](./xy-dsh-lamp) | macOS 系统级置顶灯板。每个 Agent 一盏灯，全绿后收成一行 `完成 04/04`。整块可拖、可收起成一个灯、中英可切。 | 日常在用 |
| [xy-dsh-context](./xy-dsh-context) | 会话级 Context Lens。在输入区上方显示 Turns / Steps / Cache hit / Output。 | 原型，没长期用 |

## 安装

`dsh plugin add` 会把参数原样透传给 profile 目录里的 `pnpm add`，所以可以直接从 GitHub 装。pnpm 用 `#path:` 片段指定仓库里的子目录：

```bash
# 灯板（macOS 置顶窗）
dsh plugin --profile desktop add "github:Xinyuan-Gao/xy-dsh#path:xy-dsh-lamp"

# Context Lens
dsh plugin --profile web add "github:Xinyuan-Gao/xy-dsh#path:xy-dsh-context"
```

装完重启 DSH Desktop，或重启 `dsh web`。要更新就重新执行一遍同样的命令。

想改代码的话，改成在本地 clone 后用 `link:` 装一份可编辑的：

```bash
git clone https://github.com/Xinyuan-Gao/xy-dsh.git
cd xy-dsh
dsh plugin --profile desktop add link:"$PWD/xy-dsh-lamp"
```

`xy-dsh-lamp` 的灯板是一个独立编译出来的 macOS HUD：第一次加载时宿主会用 `swiftc` 把 `hud.swift` 编到 `~/.dsh/xy-dsh-lamp-hud.app`，所以机器上要有 Xcode Command Line Tools。没有 `swiftc` 时灯板不会出现，插件的系统通知部分照常工作；非 macOS 平台也不会拉 HUD。

## License

MIT
