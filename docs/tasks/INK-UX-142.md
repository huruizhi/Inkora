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

## 实施结果

许可改为中文 AX 的「许可…」次级按钮，语言 select 保持原实例和主层级。仅打开时把生成的生产 `RENDERER_NOTICES.txt?raw` 全文放入原生 Web dialog，关闭清空；完整字节由定向测试读取生成文件逐字比对。prepare-renderers 原先已在 build 的 tsc/vite 之前生成 notices，未新增副本或生成器。无 fetch/iframe/新窗口/CSP/Native 修改。top-layer 避免编辑区底部裁切；关闭/Esc 返回原 trigger，正文和历史不变。

图片分离资源区域与稳定表单区域；descriptor 更新保留同 URL img 与草稿 DOM。实际解码完成才隐藏阅读态描述入口；图片选择、邻接光标派生装饰或工具 focus 显示入口，Option+F10 可进入、Esc 返回正文。描述表单使用原生 manual popover 并按 viewport 有界定位（不支持时保留普通表单），显隐不占正文流；失败授权/定位继续明显可达。表单持有 immutable expectedNode、位置、选区和 intent epoch；取消、节点变更、destroy 使旧 handler 失效；descriptor 刷新不销毁 composition 中的输入。明确取消/Esc 不写历史；composition 中不消费取消/Esc，也不提交正文，原 composition 事件继续冒泡。

新增可选第四参数 `createImageNodeViews(..., isComposing?)`，用于开/提交/取消/Esc 的全局资格守卫。**A 分支没有修改 runtime；根已安排 B 在组合分支传入 `() => this.session.composing || view.composing`。A 的测试只证明当前默认 view.composing 与本地 guard，不宣称尚未接线的完整 session settling 边界通过。**

修改文件：code-block-view.ts / 对应测试 / code-tools.css；image-view.ts / 新增 image-view.test.ts / image-tools.css；context-tools.ts 的 image 派生装饰和焦点入口；本任务文档及独立 evidence。未改资源 URI、owner golden、保存策略、writing-surface/style.css、Native/Bridge 或 B 文件。

## 实跑验证与限制

- 许可 RED：license-red.log；稳定图片草稿 RED：image-red.log；图片 F10 RED：image-keyboard-red.log。均先出现真实失败，再有修复绿；没有把缺陷断言成功作为修复通过。
- 最终定向命令：`.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/code-block-view.test.ts src/image-view.test.ts src/source-authority-runtime.test.ts src/context-tools.test.ts`：4 文件、87 测试通过。
- `.tools/node_modules/.bin/pnpm --dir editor build`：prepare-renderers、tsc、Vite 全部通过；仅现有类型的 >500KB chunk 提醒。未运行 make setup/install、全量 make test、NativeReleaseCI。
- 测试包含：普通/组合输入 descriptor 刷新保留 input/focus/draft；组合输入 apply/cancel/Esc 不消费，end 后 100ms 恢复稳定资格并可提交；取消不改变 raw/status/selection；detached、changed-node、destroy、源码模式重建同 raw 的旧表单拒绝；成功应用单 Undo/Redo 保留 BOM/CRLF/邻文。真实选区改变的旧意图拒绝使用隐藏 WK 公共 navigateRawRange 验证（JSDOM 不提供所需 Range 几何，未用假几何替代）。
- after-main.swift/after-probe.ts 为最终隐藏 WK harness 快照。完整生产 style、writing-surface、code-highlighting 和新增同域样式；320×180 PNG 用真实 broker + scheme handler，naturalWidth/Height=320/180。
- `wk-after-wide.log`（900×600）与 `wk-after-narrow.log`（360×600）：成功态 idle controls hidden；图片前公共 navigateRawRange + F10 consumed=true，focus=image-edit-button。form 分别 x53.19..468.63/y232..267 与 x24..311.75/y258.09..293.09，完整在 viewport 内；打开前后下一 code 块 y 分别保持258.59/315.28，无正文位移。
- 同两日志：code 块 margin-top=800px 并 scrollIntoView(end)，底部许可 dialog 分别为 x90/y75/720×450 与 x24/y75/312×450；关闭按钮位于 viewport 内；Esc closed/returned/unchanged 全 true。209228 个 JS 字符对应生成文件 209271 字节；不截断全文。
- `wk-after-composition.log`：刷新后 detached=false/value保留/focusLost=false，组合输入提交未写 raw；missing「定位…」与 denied「授权…」均 visible、tabIndex=0。此为 DOM 可调用入口，不是 Sandbox 授权成功声明。

剩余：B 的 runtime 回调接线与组合验证；根两轴审查、双层备份后再回收临时产物。风险/未验：无物理 IME、VoiceOver、屏幕 paint、macOS14、系统授权面板验收；popover/dialog 的当前系统真实 WK 证据不外推最低系统。组合输入事件会继续进入现有全局 session，此边界没有绕过。
