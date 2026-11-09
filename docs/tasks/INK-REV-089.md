# INK-REV-089：owner proof Spec 独立审查记录

## 固定范围

- 受检 HEAD：`d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14`。
- 唯一基线：`2fa3a9e88e7462e3d6929625911cd39f68ce89ad`。
- 实际执行 `git diff 2fa3a9e88e7462e3d6929625911cd39f68ce89ad...HEAD`：非空，2546 行；SHA-256 为 `cf90f609aa2b533953a158255faf1d156b2d07678bb3cdfecab821c9480ae3dd`。
- 实际执行 `git log 2fa3a9e88e7462e3d6929625911cd39f68ce89ad..HEAD --oneline`：仅 `d6c159b`、`116aff7`、`a356b9c`。
- Spec source：`docs/tasks/INK-M1-083.md` 七项契约；同时静态核对指定 bridge/save/image/recovery/Markdown 文档和 083 evidence。
- 只审 083 overlay。116aff7 带入的 084/085/086 内容排除；087 已知 reference-definition 缺口不重复立项。

## 实际执行

为避免安装或 lockfile 变化，测试前仅临时链接主仓 `.tools` 与 `editor/node_modules`，测试后已 `unlink`，工作区未留下依赖或临时文件。

1. `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/source-authority-runtime.test.ts src/main.test.ts src/bridge.test.ts -t 'INK-M1-083'`
   - exit 0；1 file passed、2 skipped；3 passed、166 skipped。
2. `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/source-authority-runtime.test.ts -t 'captures canonical image owners from the accepted semantic projection'`
   - exit 0；1 passed、64 skipped。
3. `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/bridge.test.ts -t 'ownership|owner proof|image'`
   - exit 0；1 passed、13 skipped。
4. `git diff --check`
   - 完成提交前执行，结果见最终回报。

定向测试确认 canonical owner、bare-CR raw/proof、image-access proof 的作者绿例；它们没有覆盖报告中的“capability 先注册后 stale 拒绝”和“`writeRecovery` 静默 return 后 handoff”时序。

## 证据边界

- **静态确认**：沿生产调用链核对 descriptor 注册/Bridge binding、首存过滤与 rewrite 后 proof、Save As 空 owner、080 handoff、bare-CR canonical 副本；报告两项 Spec 错误。
- **借用作者证据，未复跑**：`docs/evidence/INK-M1-083.md` 记录的 `make test-editor`、`make test-bridge`、`make test-native`、`make lint`、release 与 CI 结果仅作背景，不当作本审查实跑。
- **未验证**：Native 全量、App/窗口/NSAlert/系统面板、Sandbox/bookmark、WK 图片显示、XCUITest、bench-full、真实 IME/键盘/AX、物理输入；符合用户选择“稍后”。
- 未修改产品、冻结文档、测试、依赖、lockfile、PR、Issue 或 main。

## 结论

Spec 轴发现 2 项 wrong，均需由实施任务修复；本分支只新增审查报告与任务记录。
