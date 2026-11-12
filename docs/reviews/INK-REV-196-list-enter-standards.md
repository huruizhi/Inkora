# INK-REV-196：列表连续回车 Standards 复核

## 固定范围

- 基线：`928929faf0a1da764415c38e241999f9287f1f83`。
- 候选：`b2a321a411f227f207c99449e8b2df06a3f20a17`。
- 唯一提交：`b2a321a fix(editor): continue empty lists before consecutive Enter exits`。
- 命令：`git diff 928929faf0a1da764415c38e241999f9287f1f83...b2a321a411f227f207c99449e8b2df06a3f20a17`。
- 独立工作树初始 clean，HEAD 为候选，merge-base 等于基线。原实现工作树后来已前移，本报告不审其后续提交。

## Standards（核心报告，少于400词）

未发现有据的书面规范违反（hard：0），未提出值得整改的 Fowler 判断项（possible：0）。这只是本次固定 diff 的 Standards 结论。

规范来源为 [AGENTS.md](../../AGENTS.md)、[GLOSSARY.md](../../GLOSSARY.md)、[ADR-0004](../adr/0004-source-authoritative-editing.md) 与 [V1规格](../design/source-authority-production-v1.md)。独立检索未找到 `CODING_STANDARDS` 或 `CONTRIBUTING`。工具已覆盖的格式、类型问题不另列。

`block-editing.ts:79–116,212–233` 的连续意图按 EditorView 存于 WeakMap，绑定已接受 doc/head，并在输入、选区变化与销毁时失效；没有写入 Markdown、保存点或历史。它符合 V1「唯一当前原文」「导航不制造历史」的边界，未增加第二份文档权威。

`source-transaction.ts:589–594` 仍采用源位置与局部补丁；BOM 留原位，续行保留引用、缩进及 EOL，未引入 trim 或整篇序列化。未发现 ADR-0004 原文保真禁令的违反。

新增 DOM/Native 回归且保留旧断言，Native 脚本计数随新增两项 26→28；没有依赖、Schema、Bridge、网络或 entitlement 变更，符合 AGENTS「不得绕过有效测试」和 V1「不扩依赖」。

已逐项考虑12类 Fowler baseline；测试中的短事件派发重复沿用现有夹具风格，尚不足以提出共享抽象建议。未将风格偏好升级为 hard。任务规格仅供定位范围，本轴不判断功能覆盖是否完整。

## 本人验证与边界

- `node editor/scripts/prepare-renderers.mjs`：退出0，仅准备既有离线 renderer 资源。
- `make lint`：退出0，Swift 严格格式与 TypeScript 检查通过。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/list-input-runtime.test.ts`：退出0，1文件90项通过；属于 **synthetic DOM**，不是实际 WK/搜狗输入证据。
- 只自行建立 `.tools`、`editor/node_modules` 软链复用既有依赖，结束时 unlink；没有安装依赖或触碰源工作树依赖。
- 日志保留在本工作树 ignored `artifacts/review-196/`，待管理者备份；无临时测试或产品修改。
- 未运行全量 editor、完整 Native、GUI/App、安装发布、Keychain、物理IME、paint、VoiceOver 或 macOS14实机。作者1043/Native28是作者结果，不属于本人验证。以上未验范围仍有风险；本报告不能替代 Spec 或物理验收。
