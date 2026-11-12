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

## 限定后验：2a1580e（保留以上首稿）

后验固定 `2a1580eb0a0b7423e53093680b3ff507ac21f998`，只审首稿候选之后的新增 hunk：`git diff b2a321a411f227f207c99449e8b2df06a3f20a17 2a1580eb0a0b7423e53093680b3ff507ac21f998`。原先对 b2a321a 的结论不追溯改写。197所报两P2及用户新增边界需求仅作此次范围依据，不代行 Spec 裁定。

### Standards 后验核心（少于400词）

本轮未发现有据的书面规范违反（hard：0），无新增值得整改的 Fowler 判断项（possible：0）。规范仍为前述四文件；工具覆盖项跳过。

`list-gap-projection.ts:10–53` 将例外限制在一个根列表分片之间的空段：项目合并后内容精确相等，其他兄弟必须 eq，属性只豁免 parser 派生 tightness；每个空段须绑定真实空白源行中唯一且单调的 anchor。ledger、ranges 与 links 同步迁移，没有伪正文或不可审计 trim。符合 ADR-0004 原文保真与 V1「位置依据」「原子更新」边界。

`sameListContent:82–90` 递归检查全部节点、文本及 marks，只允许列表 tight 属性差异；`source-authority.ts` 仅把该证明用于 list-join，未采用“解析成功即可接受”。`middleListExitPlan` 删除的仍是已定位的空项目行标记，附带无关文字的退出事务继续原子拒绝，符合 V1 对未知结构事务保守拒绝的规则。

`source-transaction.ts:603–610` 的标题起点入口虽先于通用多步拒绝，但必须证明完整目标 doc、owner 和选区；插入补丁局限 owner.start，空段位置与标题 caret 分开绑定，未升级为通用放行。

新增模块承载有界列表投影与其内容比较职责；12类 Fowler baseline 未见需要整改的命名、职责分散、重复分支或预设抽象。没有发现依赖或平台边界扩大。功能需求是否全部达成仍由 Spec 轴判断。

### 后验本人验证

在本工作树 ignored `artifacts/review-196/postreview-source/` 用 `git archive` 提取固定候选；仅在该冻结副本自行软链复用既有 `.tools` 与 `editor/node_modules`，无安装依赖。新增的两项本人检查仅保留在此 ignored 副本，未改候选或产品分支。

- `node editor/scripts/prepare-renderers.mjs`：退出0，既有离线资源准备成功。
- `make lint`：退出0，Swift严格格式及 `tsc --noEmit` 通过。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/list-input-runtime.test.ts src/heading-input-runtime.test.ts`：退出0，两文件111/111；包括附带无关文字的中间退出负控。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/review-196-controls.test.ts`：本人补充2/2通过，验证 tightness 的正例，以及文字、marks、非tight属性变化和 gap 缺失/边界外 anchor 的拒绝。此为有限纯模块负控，未宣称全面对抗覆盖。
- 两组测试均属 synthetic DOM/纯模块，不能代替真实 WK 或物理IME。未跑全量 editor、Native、GUI/App、安装、Keychain、物理IME、paint、VoiceOver、macOS14实机。作者1056/Native31不计为本人结果。
- `git diff --check b2a321a411f227f207c99449e8b2df06a3f20a17 2a1580eb0a0b7423e53093680b3ff507ac21f998`：退出0。完成后仅 unlink 本人软链；冻结源码、临时控制夹具和日志保留在 ignored `artifacts/review-196/`，待管理者两层备份。

本次仅追加报告与任务记录，不修产品。未验范围风险仍在；后验结论不替代整体验收。
