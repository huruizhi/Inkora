# INK-FIX-165：标题末尾回车导致编辑/关闭报错

## 用户现象与复现

用户在新文档输入 `#` 准备写标题，尝试打字/回车/删除后不能继续编辑，关闭时报：
`该原生事务尚未支持（replace）；可信原文与 PM 状态保持不变`。
基线 `755dc6cf60b6d1b1b69c46df0873e9b36bfe3822`；只读核对当前进程为
`/Applications/Inkora.app/Contents/MacOS/Inkora`，安装版本 build5。
164 标题栏分支未安装，与本故障分别处理。

使用 Matt diagnosing-bugs 流程。桌面工具连接返回 native pipe startup failed，
没有尝试其他桌面控制方式，也没有启动/关闭/改写用户 App 或文档。

实际后台命令 `tests/InkoraTests/TypingHostless.sh` 用完整生产 Native（不含 AppDelegate）+
离线 bundle，在始终不可见的 NSWindow/WK 中创建空文档。公开 DOM `execCommand`
驱动浏览器原生 contenteditable 变化（非直接构造 PM 输入事务）：
`#` → 空格 → 标题 → 删除 → 回车。修前 1/1 失败，捕获错误与截图逐字相同，约 0.4 秒。

## 诊断与最小修改

首字、空格、文字及删除实际都被接受；失败在标题末尾回车。
原生 DOM 生成的 ReplaceStep 在 heading 之后插入闭合空 paragraph；
现有 splitPlan 只识别 list/paragraph，缺 heading，最终落到 unsupported replace。
拒绝产生未解决输入意图；关闭调用 prepareForClose 的安全 snapshot 时再次显示该错误。
这是复现的确定路径，不声称穷尽用户所有键盘事件。

新增 heading-end 分支：仅接受根层 heading 的折叠末尾选区；
先构造“其余文档逐字结构不变，仅在该 heading 后插入空 paragraph”的预期 PM doc，
要求与实际目标完整 eq，再按同次 canonical range.end 规划局部 EOL 插入。
原 ATX 闭合井号、setext 下划线、BOM 与原有末尾换行均留在原处；
沿用当前原文/投影/位置/历史接受流程，不取消保存、composition 或 readonly 守卫。
同样覆盖 keymap 表达的等价 heading-end Enter。未扩展标题中间拆分、容器内标题等独立路径。

## 文件

- `editor/src/source-transaction.ts`：heading-end 意图证明与最小补丁，splitPlan 增传 ranges。
- `editor/src/heading-input-runtime.test.ts`：实际捕获事务形状与 Enter keymap 双路径，
  普通/闭合 ATX/setext/BOM+CRLF，继续正文与两步 Undo/Redo 字节精确检查。
- `tests/InkoraTests/TypingHostlessTests.swift` / `TypingHostless.sh`：真实 WK 编辑与关闭快照回归。
- 本任务记录与 `docs/evidence/INK-FIX-165/`：红绿、最小事务与最终命令输出。

## 自跑验证

- 修前 hostless：1 failed，原截图错误复现；JSDOM 4/4 failed（坏路径）。
- 定向 runtime：8/8 passed（native/keymap × 4 原文）；无未解决意图，快照可用，Undo/Redo 精确。
- 最终 `make lint test-editor`：通过，47 文件 **819/819 passed**；包含 prepare-renderers、tsc、Vite。
- 最终 `tests/InkoraTests/TypingHostless.sh`：**1/1 passed**，真实 WK 从空文档输入标题、删除、回车、
  正文、Cmd-Z/Shift-Cmd-Z（DOM 键事件）、各阶段 Native snapshot、prepareForClose 无 error。
- `git diff --check`：通过；生产/测试 `[DEBUG-165]` 临时日志与 console handler 已移除。

早期新增 Swift 夹具未格式化导致 lint 失败，格式化后最终通过；另一次把 document.text
（保存时才更新的 Native 缓存）误当每次关闭快照后的当前原文，断言失败。
删除该错误夹具断言，保留实际 requestSnapshot 字节断言与关闭回调检查，失败日志单独存档。
WebKit 成功路径不是物理键盘/IME/VoiceOver/macOS14 或可见 UI 验收；
没有运行全量 Native/Bridge/Release/CI，也没有发布、替换安装或强制退出用户 App。
原编译 InkoraDocument actor/Any? warnings 保留；存档日志仅去行尾空格和文件尾空白行，
原件 `artifacts/INK-FIX-165/regression.raw.txt` 保留。

## 交付

分支 `task/INK-FIX-165-heading-input`，最终 commit 以回报为准。
代码修复不表示当前 GitHub/安装版自动更新；当前 build5 仍需后续打包交付。
工作树、原始证据保留；只 unlink 本任务创建的依赖链接，不删除共享目录。
