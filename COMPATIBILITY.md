# DSH 兼容性

两个插件都在 `package.json` 的 `dsh.compatibility.dshReleases` 里**逐版本**声明与 `@deepseek-ai/dsh` 的兼容性。逐版本声明是必须的：宽泛范围不会被接受，DSH STORE 要求每个完整版本各自给出 `compatible` / `incompatible` / `unknown`。

```json
"dsh": {
  "compatibility": {
    "dshReleases": {
      "0.1.5-rc.1": "compatible",
      "0.1.5-rc.2": "compatible",
      "0.1.6-alpha.1": "unknown",
      "0.1.6-alpha.2": "compatible",
      "0.2.0-rc.2": "compatible"
    }
  }
}
```

`engines.node` 声明为 `>=22.19.0`（harness 自身的要求）。`@deepseek-ai/dsh` 作为 **optional peer** 列出，范围就是上面五个版本的精确枚举——不是替换或冒充官方包，只是声明我们验证过哪些宿主。

## 验证方式

```bash
./test/compat-releases.sh xy-dsh-lamp
./test/compat-releases.sh xy-dsh-question-nav
```

每个版本都在一个**一次性 DSH_HOME** 里跑（真实的 `~/.dsh` 全程不读不写）：

1. `npm install @deepseek-ai/dsh@<版本>` 装那个精确版本的 CLI
2. `dsh plugin --profile compat add link:<本仓库的插件目录>` — install
3. `dsh --profile compat --dump-config` — 确认 bundle 组合进生效配置，且**恰好 1 行**
4. `dsh plugin --profile compat remove <插件>` — uninstall，dump-config 回到 0 行

脚本退出码非 0 表示有版本失败，可直接接 CI。

想验的正是**本机 DSH Desktop 内置的那个运行时**（不去 npm 装同一版本）时，把 CLI 换成应用自带的即可，一次性 DSH_HOME 的用法不变：

```bash
DSH_HOME=/tmp/dsh-home-check \
  "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile compat add "link:$PWD/xy-dsh-lamp"
```

## 结果

| dsh 版本 | 声明 | install | start/compose | uninstall | 验证日期 |
|---|---|---|---|---|---|
| `0.1.5-rc.1` | compatible | ✅ | ✅ 1 行 | ✅ 0 行 | 2026-09-19 |
| `0.1.5-rc.2` | compatible | ✅ | ✅ 1 行 | ✅ 0 行 | 2026-09-19 |
| `0.1.6-alpha.1` | **unknown** | ❌ 见下 | — | — | 2026-09-19 |
| `0.1.6-alpha.2` | compatible | ✅ | ✅ 1 行 | ✅ 0 行 | 2026-09-19 |
| `0.2.0-rc.2` | compatible | ✅ | ✅ 1 行 | ✅ 0 行 | 2026-10-01 |

两个插件共用这张表 —— 检查走的是同一个脚本，结果与插件无关（`xy-dsh-question-nav` 是 2026-09-20 并入后按同一脚本复核的，逐版本结论一致）。下表是 `0.1.6-alpha.1` 的例外细节，同样对两个插件成立。

### 为什么 `0.1.6-alpha.1` 是 unknown 而不是 incompatible

**这个版本的 CLI 自己起不来，跟插件无关。** 全新安装 `@deepseek-ai/dsh@0.1.6-alpha.1` 后，`dsh plugin` 直接崩：

```
SyntaxError: The requested module '@deepseek-ai/dsh-app-boot'
  does not provide an export named 'watchUserPatches'
    at runCli (.../@deepseek-ai/dsh/lib/bin.js:156:26)
```

链条是这样的：

| 环节 | 事实 |
|---|---|
| `dsh@0.1.6-alpha.1` 声明 | `"@deepseek-ai/dsh-app-boot": "^0.1.6-alpha.1"` |
| npm 实际解析到 | `0.1.6-alpha.2`（caret 允许） |
| `dsh-app-boot@0.1.6-alpha.2` | **删掉了** `watchUserPatches` 导出 |
| `dsh-app-boot@0.1.6-alpha.1` | 还有这个导出（钉回去就好） |

把 app-boot 钉回 alpha.1，同一套检查**四步全过**：

```bash
DSH_COMPAT_EXTRA_DEP="@deepseek-ai/dsh-app-boot@0.1.6-alpha.1" \
  ./test/compat-releases.sh xy-dsh-lamp 0.1.6-alpha.1
```

所以插件本身在 alpha.1 上是好的，坏的是那个 release 的依赖范围（prerelease caret 把后续 prerelease 拉进来，而 API 已经变了）。因为**默认安装路径下任何插件都装不上**，无法在标准路径完成验证，所以标 `unknown` 而不是 `compatible`；又因为这不是插件的问题，也不写 `incompatible`。

`dsh --version` 在那个版本上是正常的（退出码 0）——只有走 profile 的命令才会加载到出问题的模块。这一点值得写清楚，免得被读成「整个 CLI 都废了」。

### `0.2.0-rc.2`：版本声明没跟上，插件被拒装

**症状和 `0.1.6-alpha.1` 完全不同：这次是插件自己声明得不够。** DSH Desktop 升到内置 `0.2.0-rc.2` 之后，两个插件都不出现，而且不是在运行时报错——`dsh plugin add` 当场拒装：

```
dsh: installation rejected: Plugin xy-dsh-lamp@0.2.0 is incompatible with dsh 0.2.0-rc.2:
peerDependencies {"@deepseek-ai/dsh":"0.1.5-rc.1 || 0.1.5-rc.2 || 0.1.6-alpha.1 || 0.1.6-alpha.2"}
dsh: nothing was installed.
```

peer 范围只枚举到 `0.1.6-alpha.2`，`0.2.0-rc.2` 不满足，安装和加载都被拦。处理方式是把这个版本加进 peer 范围，并按逐版本声明补 `compatible`；两个插件各 +1 个 patch 版本（`xy-dsh-lamp@0.2.1`、`xy-dsh-question-nav@0.1.1`）。

补声明之前先核了一遍插件真正用到的宿主 API 面，确认不是盲批：

| 用到的宿主接口 | 在 0.2.0-rc.2 里 |
|---|---|
| `ctx.on('session/event')` | 仍在（包内 62 处引用） |
| `ctx.on('agent/status')` | 仍在（8 处） |
| `ctx.logger` / `ctx.effect` | 仍在 |
| `dsh.client.inject` 的五个 `@deepseek-ai/dsh-client-ui-*` | 五个全部仍挂载 |

验证用的是**应用自带的那份 0.2.0-rc.2 运行时**（`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`）在一次性 `DSH_HOME` 里跑上面四步：两个插件都是 install ✅ → compose ✅ 1 行 → uninstall ✅ 0 行。另外用桌面档的完整 bundle 组合（`@deepseek-ai/dsh-base`、`dsh-web-app`、`dsh-better-sidebar`、`dsh-context`、`dsh-univer-office`、两个本插件）做了一次隔离复验：修复后两个插件各 1 行、没有 `skipping profile bundle` 告警。`./test/run.sh` 的 6 套插件自身测试同时全绿。

## 这不是什么

这些检查证明的是：**在五个官方 release 各自的真实 CLI 上，插件能安装、能组合进 profile 配置、能卸载**。

它们不是完整的运行时验收：灯板的窗口、通知、收起态，以及提问导航的界面，都没有在这些一次性 profile 里实际渲染过——一次性 profile 只装插件并组合配置，不会启动 GUI。灯板的运行证据来自本机 DSH Desktop 2.0.9（内置 `0.1.5-rc.1`）的日常使用，以及 `test/host.test.mjs`、`test/overlay.test.py` 那几套；提问导航的浏览器半场由 `test/question-nav.test.mjs` 按真实模块系统契约（`window.__ModuleLoader__` 工厂）装载并断言槽位注册。

`0.2.0-rc.2` 这一行同样只覆盖安装与组合。两个插件在 0.2.0-rc.2 的 GUI 里真正长出来，要重启 DSH Desktop 之后看一眼才算数；补声明前已核对过插件用到的槽位与事件在 0.2.0-rc.2 里都还在（见上表），但那是静态核对，不是渲染验收。
