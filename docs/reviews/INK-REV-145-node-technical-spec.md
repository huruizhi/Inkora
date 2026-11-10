# INK-REV-145：节点工具与技术导航 Spec 独立审查

## 摘要（400词以内）

固定受检 HEAD `99211a1b73e5872925b30196eda0c57d09180d60`，基线 `d5d434e37ed7be8f1719614a3a642c2e458a73c6`（PR88）。初始工作树 clean，唯一比较为 `git diff d5d434e37ed7be8f1719614a3a642c2e458a73c6...HEAD`，非空。仅审 Spec，不采纳另一轴结论。

(a) missing/partial：未发现有充分证据成立的遗漏；成功图片几何、底部许可可读与关闭仍属本人未验，不能据 DOM 绿判完整。

(b) scope creep：未发现成立项；变更保持 NodeView、独立样式、测试与协调后的 runtime/context 接缝，无 Native/Bridge/parser/ledger/依赖变化。

(c) implemented wrong：未发现成立项。自跑26个定向测试及1个公共 runtime 探针通过，支持有限行为结论，不代表全体验验收。已撤回 NodeSelection 假设未复报，也未私有注入制造反例。

## 来源与逐项核对

完整核读 AGENTS.md、GLOSSARY.md、docs/adr/0004-source-authoritative-editing.md、docs/testing.md、docs/editor-session.md、docs/save-barrier.md、docs/markdown-support.md、docs/local-images.md、docs/code-block-experience.md，以及 docs/design/node-tools-technical-navigation.md 和 docs/design/typora-ui-round2-plan.md。产品差异包含新增/修改测试，历史日志只作为作者证据索引，不逐字当功能证明。

| 实施边界原句与位置 | 源码依据 | 本人结论与限制 |
| --- | --- | --- |
| 规格41行：“许可采用现有打包许可全文的离线只读次级面板”；49行：“只在打开时填充/构建” | code-block-view.ts:81–130；code-tools.css:12–33 | 初始空pre、点击全文与关闭焦点返回的现有测试自跑通过；无fetch/iframe/新窗口。未自验真实WK底部裁切/paint，不判全部视觉要求通过。 |
| 规格41行：“图片使用稳定草稿表单、不可变expectedNode、alive/openEpoch/connected守卫及明确取消，descriptor更新不拆composition” | image-view.ts:110–142、152–190、195–289；editor-runtime.ts:741 | descriptor仅换资源区域；旧表单、销毁、source重建、取消、组合及settling定向测试自跑通过。成功解码后浮动工具见image-tools.css:1–20；DOM不能证明成功图片几何。 |
| 规格23行：“定位当前接受原文的精确范围”；25行：“取消可回可信位置，提交保留范围外字节” | editor-runtime.ts:816–859、356–390；technical-preview.ts:34–71 | canonical完整doc一致及opaqueSpans顺序配对，不按substring找首次；重复/引用容器CRLF公式、非法公式、局部apply、dirty取消与no-op清理测试自跑通过。独立probe补验CRLF多行脚注定义范围与dirty取消。 |
| 规格23行：“准确返回本次真实来处”；47行：“展示控件存活与已打开意图的有效期要区分” | editor-runtime.ts:782、832–885 | 当前控件每次按canonical重捕获；已打开返回绑定raw/version/epoch/selection和真实元素。现有第二引用/当前控件输入后可用测试及独立probe选区变化后拒绝返回均自跑通过；destroy旧按钮由现有测试覆盖。未穷举所有生命周期交错。 |
| 规格27行：“Mermaid…只有实际复现问题才修，不重写渲染器” | code-block-view.ts；technical-preview.css:44 | 差异中的hidden/可见性修正符合已有入口边界，未发现渲染器重写。未自跑异步Mermaid全回归。 |

以上“规格”均指 docs/design/node-tools-technical-navigation.md；第二轮计划第3、4项提供上位目标。未将图片资源策略、Sandbox、主题或局部TeX未做计为本切片缺陷。

## 命令及真实结果

- `git status --short`：初始空；`git rev-parse HEAD`：指定SHA。
- `git log d5d434e37ed7be8f1719614a3a642c2e458a73c6..HEAD --oneline`：9提交，依次为99211a1、80a38ae、55ee4d0、5fc4ee4、7bbb1e9、36a6b15、ea04562、2573df3、9b3ab4f。
- 上述唯一diff保存于 `artifacts/INK-REV-145/fixed.diff`，提交列表在 `commits.log`。
- 临时仅创建主仓 `.tools` 与 `editor/node_modules` symlink；未setup/install或改锁。
- `editor/node_modules/.bin/vitest run --root editor src/technical-navigation-runtime.test.ts src/image-view.test.ts src/image-settling-runtime.test.ts src/code-block-view.test.ts`：首次4套件导入失败、0测试，缺生成的 `RENDERER_NOTICES.txt`；见 `targeted.log`。不是产品行为反例。
- `node editor/scripts/prepare-renderers.mjs`：成功，使用既有脚本生成忽略资源，无依赖安装。重跑同一命令：4文件26测试通过，见 `targeted-prepared.log`。
- `editor/node_modules/.bin/vitest run --root editor --config ../artifacts/INK-REV-145/probe.config.ts`：1文件1测试通过；见 `probe.log`。probe只经公开runtime方法和DOM按钮，不使用私有注入；保留 `probe.test.ts` / config。配置加载发出未来Vite native loader兼容提示，不影响本次运行。

## 未验、风险与交付

未运行 make lint/test、构建、全量NativeReleaseCI、Native非UI、隐藏WK、App/UI、系统面板、CUA/browser/XCU、物理IME或macOS14专项。作者/root的120/141/87/21与隐藏WK证据均非本人自跑，不作为独立通过数。未验不等于失败或通过，尤其不能从本次DOM测试外推许可底部可读性、成功图片布局、Sandbox授权和实际paint。

只新增本报告及 docs/tasks/INK-REV-145.md；产品与原有测试/oracle/旧报告未改。临时probe/log保留至root双备份确认后回收；结束unlink本人两项借用链接。无PR/merge/Issue/安装。报告分支 `task/INK-REV-145-node-technical-spec`；最终commit与远端核验由任务回报记录。
