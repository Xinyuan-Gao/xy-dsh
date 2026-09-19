# test

```bash
./test/run.sh
```

每套都在自己的临时 HOME 里跑，**不会碰你真实的 `~/.dsh`**：不会动你正在用的 pid 文件，也不会覆盖你编好的灯板二进制。

| 套件 | 覆盖什么 | 需要 |
|---|---|---|
| `host.test.mjs` | 宿主逻辑：多会话分行、审批与提问两种「等你」、地图清理、父行钉住、语言偏好、死字段 | Node |
| `hud-lifecycle.test.mjs` | HUD 进程：`killOldHud` 真的杀掉 pid 文件指的那个进程；`hud.swift` 编不过时保留旧二进制照常起灯板 | macOS + `swiftc`（缺 `swiftc` 时跳过编译那半） |
| `overlay.test.py` | 页面：多会话渲染、**DOM diff 不变量**、等你灯真的在闪、拖拽消息序列、右键交宿主、旧宿主格式兜底 | Python + playwright + Pillow |
| `collapsed.test.py` | 收起态：一个任务一盏灯、宽度跟着灯数、等你灯在收起态也闪、关闭按钮两次点击 | 同上 |
| `backgrounds.test.py` | 背景：五种各自生效、注入即首帧、运行中切换会回报、非法值被忽略、菜单清单由页面提供 | 同上 |
| `compat-releases.sh` | 对每个官方 DSH release 在一次性 `DSH_HOME` 里跑 install → compose → uninstall | Node + npm + 网络 |

浏览器那两套的依赖：

```bash
pip install playwright pillow
python -m playwright install webkit
```

## 为什么留这些

这里每一条断言都对应一个**真的出过的问题**，而且是读代码看不出来的那种：

- 「DOM diff 不变量」——`paint()` 原来每 400ms 重建一次 `innerHTML`，被重建的元素上 CSS 动画从 0% 重来，而闪烁前 50% 正好是 `opacity: 1`，所以**等你灯永远不闪**，和工作中的灯长得一模一样。同一件事还让行标签的悬停提示永远弹不出来。断言锁的是「只改文本时元素身份不能变」。
- `killOldHud` —— `process.kill(pid, 'TERM')` 在 Node 上抛 `ERR_UNKNOWN_SIGNAL`（必须写 `'SIGTERM'`），外面套着空 `catch`，于是这个函数**从插件诞生起就没生效过**。
- 编译回退 —— 改坏一行 Swift 曾经等于灯板彻底消失，而 `execFileSync` 失败还可能截断一个本来能用的二进制。
- 收起态宽度 —— `.mini` 是固定 `width: 30px`（原本单灯设计），三盏灯直接溢出被裁。灯数对**不等于**窗口大小对，所以几何单独断言。
- 关闭按钮两次点击 —— 退出后要重启 DSH 才回来，误触的代价太大。

## 兼容性验证

`compat-releases.sh` 不是单元测试，它是 `dsh.compatibility.dshReleases` 里那些声明背后的证据：每个版本装那个精确的 CLI，装插件，确认 bundle 组合进生效配置（恰好 1 行），再卸载（回到 0 行）。全程用一个一次性 `DSH_HOME`，真实 `~/.dsh` 不读不写。

```bash
./test/compat-releases.sh xy-dsh-lamp 0.1.5-rc.2
DSH_COMPAT_EXTRA_DEP="@deepseek-ai/dsh-app-boot@0.1.6-alpha.1" \
  ./test/compat-releases.sh xy-dsh-lamp 0.1.6-alpha.1   # 钉住上游坏掉的依赖范围
```

结果与理由记在 [COMPATIBILITY.md](../COMPATIBILITY.md)。

## 运行器自己的坑

`run.sh` 判一套是否通过，看的是**退出码为 0 且输出里有 `RESULT: ALL PASS`**，两个条件都要。

一开始只看退出码。结果 Python 那几套失败时打印 `RESULT: FAILURES` **却仍然退出 0**——运行器于是报「5 套通过」，而其中一套其实是红的。这类「工具说通过、实际没过」比测试本身失败更危险，所以现在两道都查。

## 写新测试时注意

**夹具必须来自真实载荷。** 这个仓库吃过两次亏：

1. 探针里手动写了 `self.collapsed = true`，绕过了真实路径，于是「收起态存的是启动时的旧值」这个 bug 照不出来。
2. `tool/result` 的夹具写成顶层 `{ callId: 'c1' }`，而真实事件里 callId 是嵌套的 `data.message.source.callId`，于是配对永远失败、灯板误报「等你」——测试却是绿的。

要抄真实形状，从 session 日志里挖：

```bash
zstd -dc ~/.dsh/sessions/*/session-*/session.v3.jsonl.zstd | grep '"type": *"tool/result"' | head -1
```
