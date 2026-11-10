# INK-UX-142：节点工具契约 A

固定基线 `9b3ab4f7b219fe3e52a6b577213c6d8332b4cf7c`；分支 `task/INK-UX-142-node-tools`。

## 第一阶段结论

自跑证据见 [WK 日志](../evidence/INK-UX-142/wk-probe.log) 与 [非组合输入日志](../evidence/INK-UX-142/wk-plain.log)。生产文件未改；79 项现行定向测试通过（code-block-view、source-authority-runtime）。

许可：code-block-view.ts:79 创建 target=_blank anchor；不可见 WK 点击调用返回 nil 的 UIDelegate 一次，没有显示许可，原文不变。Native 策略与 createWebViewWith 的生产事实由根管理者核读；本 harness 仅复用 nil 行为，不声称直接实例化该 controller。CSP connect-src/frame-src none，资源 handler 提供本地 notices；因此优先 Vite ?raw 打包全文并在 Web 内显示只读次级区域，中文 AX、关闭/Esc 返回 trigger。不得 fetch/iframe/改 Native。

图片：image-view.ts:93 update 与 :116 render 会 replaceChildren，:190 submit 用可变 this.node。真实生产 broker 注册 PNG、校验 SHA，经生产 scheme handler 解码 naturalWidth/Height=1；900×600 WK 中描述按钮 46.796875×23，tabIndex=0、DOM focus 成功。此为 1px 图片有限几何，不能推论常规尺寸图片的布局质量。

descriptor 刷新最小反例：打开描述并输入→刷新 descriptor→原输入 detached，焦点丢失，新表单值退回旧。组合输入版本的 submit 被当前 runtime composition guard 拦截；非组合输入新进程中，旧 detached form 的 submit 实际写入 raw、dirty=true 且 canUndo=true。此为公开 DOM 可调用反例，不是物理用户可点击 detached 元素的声明。

假设优先级：1. 稳定表单 DOM 可避免刷新丢草稿；2. immutable expectedNode、alive/openEpoch/isConnected 可拒绝旧 handler；3. runtime eq 守卫存在，但当前 this.node 读取不能表达打开时意图。选择/跨 load/destroy 的完整边界仍需定向验证。

## 已批准实施归属

根于第一阶段后批准 code-block-view.ts/image-view.ts、对应测试、独立 CSS；另批准 context-tools.ts 最小 image 识别和焦点入口。runtime 由 B 独占，任何必要接口先经根协调。许可保留生产 notices 全文，以生成后的 ?raw 为唯一来源。图片稳定草稿、composition 守卫、显式取消、迟到 handler 失效；不改 URI、资源与保存策略。

## 证据层级与命令

harness 是不可见 NSWindow/WK（window.isVisible=false），生产 runtime/NodeView/style、原生产 broker/scheme handler；仅 LocalImageError 名称 shim，无 mock 文件读取。PNG 从明确临时目录注册 capability，不是 Native descriptor ACK、Sandbox 授权、paint、物理键盘/IME 或 macOS14 验收。许可 UIDelegate 仅重现根已核读的 nil 行为。首次 swift 编译因 shim 缺 unsupportedFormat 失败，补齐后编译与运行成功，未改产品。

- `.tools/node_modules/.bin/pnpm --dir editor exec vite build --config artifacts/INK-UX-142/vite.config.ts`
- `swiftc -parse-as-library artifacts/INK-UX-142/main.swift app/Sources/DocumentAssetBroker.swift app/Sources/EditorResourceSchemeHandler.swift -o artifacts/INK-UX-142/probe`
- `artifacts/INK-UX-142/probe` 与 `artifacts/INK-UX-142/probe --plain`
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/code-block-view.test.ts src/source-authority-runtime.test.ts`：2 文件、79 测试通过。

临时完整产物保留在 artifacts/INK-UX-142 与 editor/artifacts/INK-UX-142；源码快照见 evidence。借用依赖 symlink，未安装/改 lock；根双层备份前不回收。
