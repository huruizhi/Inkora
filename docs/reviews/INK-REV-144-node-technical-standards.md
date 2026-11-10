# INK-REV-144 Standards 独立审查

## 摘要（400词以内）

固定受检 HEAD `99211a1b73e5872925b30196eda0c57d09180d60`，基线 `d5d434e37ed7be8f1719614a3a642c2e458a73c6`（PR88）。初始 clean，唯一受检差异为 `git diff d5d434e37ed7be8f1719614a3a642c2e458a73c6...HEAD`，非空。Standards：未证实书面硬规则偏离；2项非硬 Fowler 判断：possible Feature Envy、possible Data Clumps。它们是维护建议，不作为功能失败或规格缺漏结论。图片位置失效会丢弃未提交表单值的公共 NodeView 反例自跑成立，但基线已有重建行为，且源码草稿规则不能直接等同图片属性草稿，故不计新增硬违规。没有复用另一审查轴结论。

## 来源与范围

完整读取 AGENTS.md、GLOSSARY.md、docs/adr/0004-source-authoritative-editing.md、docs/testing.md、docs/editor-session.md、docs/save-barrier.md、docs/markdown-support.md、docs/local-images.md、docs/code-block-experience.md，以及两份规格 docs/design/node-tools-technical-navigation.md、docs/design/typora-ui-round2-plan.md。先读取来源再审产品差异。历史日志不作本人功能验证。

全仓执行 `rg --files --hidden --no-ignore -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.tools/**' | rg '(^|/)(CODING_STANDARDS|CONTRIBUTING)\.md$'`：无匹配，退出1；不存在需完整读取的这两类仓库文件。AGENTS.md 搜索仅命中根文件。

捕获 `git log d5d434e37ed7be8f1719614a3a642c2e458a73c6..HEAD --oneline` 的9提交：`99211a1 / 80a38ae / 55ee4d0 / 5fc4ee4 / 7bbb1e9 / 36a6b15 / ea04562 / 2573df3 / 9b3ab4f`。产品改动共13个 editor/src 文件，逐项检查新增/修改 hunk；不审 Spec 完整性。

## 书面规则偏离（硬）

无可确证项。这不代表所有行为通过。没有把文档要求的尚未验收场景当作代码违规，也没有重复工具已强制的格式问题。

## Fowler baseline 判断（非硬）

### S1：possible Feature Envy——runtime 承担 canonical owner 配对

新增 hunk `editor/src/editor-runtime.ts:815-829`：`parseCanonicalSource(this.session.currentRaw)`、`parsed.doc.eq(this.session.state.doc)`、`nodes.length !== parsed.opaqueSpans.length`，随后按位置返回 opaque span。方法几乎完全依赖 session 的 raw、state.doc 和解析证据，runtime 自己的数据参与很少。建议把精确 capture/validate 放到 SourceAuthoritySession 的小只读接口，runtime 消费绑定后的 target。

规则依据是固定 Fowler baseline “方法依赖别对象数据过多→移动职责”；仓库依据 `docs/editor-session.md`：“生产 runtime 的内容边界为 SourceAuthoritySession”，及 ADR-0004 的原文/派生语义/投影分工。规格 `node-tools-technical-navigation.md` 允许有必要时在 source-authority.ts 添加最小只读 capture/validate 接口；这里是可选改善，不是违反强制文件归属。现有 `source-authority.ts:616-637` 的 captureMathContent 已封装同类 provenance 读取。风险是未来 owner 规则演化需同时理解两个层；未证明现实现定位错误或性能失败。

### S2：possible Data Clumps——技术意图身份字段重复成组

新增 hunks `editor/src/editor-runtime.ts:155-160,849-855,876-882` 重复携带 `raw / revision / epoch / selection`；取消路径 `371-378` 又自行比较 raw/version/epoch。建议 runtime 私有小类型封装共同身份捕获/验证，保留各路径独有的 PM Selection、DOM 来处和 affinity 检查。

规则依据是固定 Fowler baseline “共同字段成组传递→小类型”。仓库 `GLOSSARY.md`：“位置依据……包括方向、边界归属及所依赖的文档版本”；规格要求已打开意图绑定 raw/version/epoch。现实现有这些守卫，问题只是共同字段分散维护的风险，不是缺少守卫。不要为了此建议建立泛化弹层或编辑框架。仓库规范优先；该建议没有覆盖任何既定接口要求。

其余10种 baseline（Mysterious Name、Duplicated Code、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest）未找到足够具体且可行动的独立项。没有把“文件大”或普通 DOM 导航当成气味证据。

## 有界反例与排除项

自建 `artifacts/rev-144/probe.test.ts` 通过公开 createImageNodeViews 工厂创建 NodeView，打开描述、填入 `unsaved draft`，将公开 getPos 回调返回值从1改2，再调用 update。断言旧输入不再连接且可见 DOM 不含草稿值：1 passed。它验证坏行为，绝不表示修复通过；是公共 NodeView 人工调度模型，不声称真实用户路径已复现。

对应新 hunk `image-view.ts:120-129,195-198` 在 invalidated 时清空 controls；基线 update→render 同样 replaceChildren，故这是继承风险，不是新增回归。GLOSSARY 的“源码草稿”限定源码；不能未经政策裁定外推所有图片表单。先前向父会话提出硬规则候选，核对后已明确撤回。建议父会话单独决定保留/恢复属性输入政策；本轴不转成规格缺漏判定。

## 实际命令与证据边界

- `git status --short`、`git rev-parse HEAD`：初始空输出、精确匹配受检 SHA；上述 diff/log 命令成功，差异非空。
- 仅自行创建 `.tools`、`editor/node_modules` 两个 symlink，指向主仓同名锁定目录；没有 setup/install/lock 改动。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run --root .. --config artifacts/rev-144/vitest.config.ts`：首次选错授权按钮，alt 为 null，1 failed（测试夹具错误，非产品失败）。原日志保留为 probe.log 与 probe-initial-harness-error.log。改为 `.image-edit-button` 后，probe-final.log 显示1 passed。Vite 有配置加载器未来兼容警告，不影响此次断言。
- 未跑 lint、build、全量测试、NativeReleaseCI、隐藏 WK、几何、paint、App、系统面板、XCU、物理 IME、macOS14专项。作者/root 的120/141/87/21及隐藏WK证据均非本人自跑，不能转记通过。
- probe/config/log 留在本 worktree 被忽略的 artifacts/rev-144，待父会话两层备份后回收；不覆盖旧报告、原有测试、oracle。收尾仅 unlink 本人两个 symlink。

本次只新增此报告与 docs/tasks/INK-REV-144.md；无 PR/merge/Issue/安装。
