# DSH 兼容性

三个插件都在 `package.json` 的 `dsh.compatibility.dshReleases` 里**逐版本**声明与 `@deepseek-ai/dsh` 的兼容性。逐版本声明是必须的：宽泛范围不会被接受，DSH STORE 要求每个完整版本各自给出 `compatible` / `incompatible` / `unknown`。

```json
"dsh": {
  "compatibility": {
    "dshReleases": {
      "0.1.5-rc.1": "compatible",
      "0.1.5-rc.2": "compatible",
      "0.1.6-alpha.1": "unknown",
      "0.1.6-alpha.2": "compatible"
    }
  }
}
```

`engines.node` 声明为 `>=22.19.0`（harness 自身的要求）。`@deepseek-ai/dsh` 作为 **optional peer** 列出，范围就是上面四个版本的精确枚举——不是替换或冒充官方包，只是声明我们验证过哪些宿主。

## 验证方式

```bash
./test/compat-releases.sh xy-dsh-lamp
./test/compat-releases.sh xy-dsh-context
./test/compat-releases.sh xy-dsh-question-nav
```

每个版本都在一个**一次性 DSH_HOME** 里跑（真实的 `~/.dsh` 全程不读不写）：

1. `npm install @deepseek-ai/dsh@<版本>` 装那个精确版本的 CLI
2. `dsh plugin --profile compat add link:<本仓库的插件目录>` — install
3. `dsh --profile compat --dump-config` — 确认 bundle 组合进生效配置，且**恰好 1 行**
4. `dsh plugin --profile compat remove <插件>` — uninstall，dump-config 回到 0 行

脚本退出码非 0 表示有版本失败，可直接接 CI。

## 结果

| dsh 版本 | 声明 | install | start/compose | uninstall | 验证日期 |
|---|---|---|---|---|---|
| `0.1.5-rc.1` | compatible | ✅ | ✅ 1 行 | ✅ 0 行 | 2026-09-19 |
| `0.1.5-rc.2` | compatible | ✅ | ✅ 1 行 | ✅ 0 行 | 2026-09-19 |
| `0.1.6-alpha.1` | **unknown** | ❌ 见下 | — | — | 2026-09-19 |
| `0.1.6-alpha.2` | compatible | ✅ | ✅ 1 行 | ✅ 0 行 | 2026-09-19 |

三个插件共用这张表 —— 检查走的是同一个脚本，结果与插件无关（`xy-dsh-question-nav` 是 2026-09-20 并入后按同一脚本复核的，逐版本结论一致）。下表是 `0.1.6-alpha.1` 的例外细节，同样对三个插件成立。

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

## 这不是什么

这些检查证明的是：**在四个官方 release 各自的真实 CLI 上，插件能安装、能组合进 profile 配置、能卸载**。

它们不是完整的运行时验收：灯板的窗口、通知、收起态，以及 Context Lens、提问导航的界面，都没有在这些一次性 profile 里实际渲染过——一次性 profile 只装插件并组合配置，不会启动 GUI。灯板的运行证据来自本机 DSH Desktop 2.0.9（内置 `0.1.5-rc.1`）的日常使用，以及 `test/host.test.mjs`、`test/overlay.test.py` 那几套；提问导航的浏览器半场由 `test/question-nav.test.mjs` 按真实模块系统契约（`window.__ModuleLoader__` 工厂）装载并断言槽位注册。
