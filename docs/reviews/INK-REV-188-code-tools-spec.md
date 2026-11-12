# INK-REV-188：代码工具 Spec 轴审查

固定产品提交：`9d9dca5b1458596aa984c07dc17c0e7e0a18b311`；基线：`1d07702e1144011803b846df1b6ac2f873ad65fc`。开始时工作树 clean，`git diff base...fixed` 非空，范围内唯一提交为 `9d9dca5 feat(code): add offline language completion and line numbers`。不随分支移动变更结论。

规格来源：原审计工作树 INK-AUDIT-179 的 `typora-homepage-requirements.md:61-63`、`typora-homepage-gap-audit.md:71-73`；正式规格 [typora-code-tools.md](../design/typora-code-tools.md)、[INK-UX-186.md](../tasks/INK-UX-186.md)。按后续正式规格接受工具栏补全位置及 Velocity 未打包边界。

## 核心结论（少于 400 词）

(a) Missing / partial：**P2：缺少规格要求的 Native 重开核对。** 规格 `docs/design/typora-code-tools.md:15` 要求“Native快照保存重开”。新增 `tests/InkoraTests/CodeToolsHostlessTests.swift:30-37` 保存后比较当前控制器快照及文件 Data，随后退出；没有建立新 InkoraDocument 并 read 来核对重开。当前验证只能证明写盘字节；应补真正的新文档读取。此项是验证缺口，不断言产品重开已损坏。

(b) Scope creep：未发现需要报告的越界行为。193 注册项、plaintext、Velocity 明示边界及保留完整 select 都有正式规格依据。

(c) Implemented wrong：**P2：旧候选可借新查询的 binding 重新生效。** 规格 `docs/design/typora-code-tools.md:8` 要求“过期/销毁…拒绝”，`:11` 要求“所有动作检查连接和存活资格”。`editor/src/code-language-picker.ts:70-76` 移除旧按钮却保留其 click 闭包；`:61` 新查询刷新共享 binding，而 `:44-51` 只检查输入框连接和当前 state，不验证按钮所属轮次/连接。本人通过真实 runtime 复现：查询 py 留下旧 Python 按钮，改查 rust 后旧按钮已断开，click 仍把 js 改为 python；先修改代码正文再查 rust，同样复活旧 Python 动作。应将候选绑定到创建它的轮次与 state，且确认动作验证候选连接。此缺陷改变源码，冻结提交不可判为完全符合规格。

## 本人执行与证据

- 仅新增报告和任务记录，未编辑产品、有效测试、依赖清单。
- 复用 INK-UX-186/editor/node_modules（实际指向主仓 editor/node_modules），本人建立软链；`node editor/scripts/prepare-renderers.mjs` 成功生成忽略的许可/渲染资源。最初误用不存在的 `.tools/editor/node_modules`，prepare 报 mermaid 缺失；纠正依赖路径后通过，未安装依赖。
- 在 editor 目录执行：`./node_modules/.bin/vitest run artifacts/INK-REV-188/spec.test.ts src/code-tools-runtime.test.ts src/code-highlighting.test.ts`。35 例中 33 通过、2 失败；2 个失败均为上述旧候选缺陷。独立反例及日志保留在忽略目录 `editor/artifacts/INK-REV-188/`，`baseline-red.log` 为冻结提交结果。
- 通过项包括既有 13 样例断言、注册项数量 193、5 个新增代表语法（Java/C++/VB.NET/VHDL/Kotlin）、v 前缀与别名、BOM/CRLF 和外围 info 空白、一次 Undo/Redo、query composition、本地显示共享与不可用存储、销毁/旧 state、正文 composition/settling、LF/CRLF 空与尾空行、源码模式往返、反向 PM 选区与代码 DOM/EditorState 身份保持。193 是注册清单数量，不表示逐语言人工验收。
- Mermaid 阅读/编辑隐藏规则和新 body 包裹经源码核对；本轴未运行真实 WK、Native、GUI/App、物理 IME、VoiceOver、安装或全量测试。作者执行记录不作为本人实跑。

剩余：候选缺陷修复与限定复验、真正重开验证；显示几何与物理输入仍受独立验收边界约束。保留 worktree 和忽略产物供双备份。

## 限定修复复验：e8e9760

本节追加，不改写上文冻结提交的发现与原始红例。固定修复为 `e8e976084170e32f2b7fd7b3d68828f4f80597ed`，其 parent 为 `9d9dca5b1458596aa984c07dc17c0e7e0a18b311`。完整新增 diff 保留在忽略产物 `editor/artifacts/INK-REV-188/limited-fix.diff`。临时按 SHA 导出 7 个产品/测试文件做定向运行，结束逐个恢复至本报告分支 HEAD；正式规格变更仅从固定 diff 读取。

本人执行命令（editor 目录）：`./node_modules/.bin/vitest run artifacts/INK-REV-188/spec.test.ts -t 'rejects a detached candidate|rejects an old candidate|limited fix'`，退出 0，**5 通过、10 跳过**。日志为 `fix-limited.log`，没有扩大到全量。原 2 个过期候选反例均由红转绿；另 3 个必要正向核对：旧按钮点击不会关闭新列表，当前 Rust 按钮仍可确认并 Undo；旧按钮重新插回 DOM 后虽连接仍被 lease 拒绝，Enter 选择当前轮次；Mermaid 可以搜索并确认。`code-language-picker.ts` 的候选 click 同时检查 `item.isConnected` 与创建时 lease 身份，旧轮次不再借新 binding 生效。原产品缺陷在此固定修复下已关闭。

Native 验证缺口经本人**静态**核对：固定 diff 在保存和精确 `Data(expected.utf8)` 对照之后新增 `InkoraDocument()`、`read(from:ofType:)`、`reopened.text == presentation(expected)`；因此已有真正新文档读取与 BOM 解码后正文对照代码。静态缺口已补齐。主代理另报告 CodeToolsHostless 3 绿及全量 1015 绿，属于外部运行信息；本人本次未运行 Native/WK，也未读取其执行日志，不将它们计入上述 5 个公共 DOM 实跑结果。

该修复也把查询 composition/100ms 静默资格通过独立 owner Set 汇报给 runtime，并由 main 原命令守卫消费；普通查询焦点参与文档 Undo/插入资格。正式规格第 11 行已追加对应约束。此处只核对新增 diff，不把候选限定复验扩张为这些主代理回归、物理 IME 或可见 paint 的验收结论。注册语法仍为 193，搜索额外提供既有 Mermaid 图表入口，不把它算成新增 highlighter 语法。

收尾：`git diff --check` 通过，临时产品导出均已恢复，本人 `editor/node_modules` 链接已 unlink；本报告和任务记录是唯一提交修改。原 `baseline-red.log`、限定绿日志、反例及 diff 均保持忽略并留在原 worktree，待双备份。
