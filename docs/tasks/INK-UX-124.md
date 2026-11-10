# INK-UX-124：集成安静顶栏并完成阅读宽度实机对照

## 范围与基线

用户在INK-UX-123交付后要求继续。本轮先按仓库手动CI规则集成首片，再实际对照760/900px；默认宽度待用户选择，不自行采用推荐选项。任务工作树`.worktrees/INK-UX-124`，分支`task/INK-UX-124-reading-width-comparison`，初始基线`6c5b749ca560a0064fb08ade472e3915a0ea1302`。

## 实际进展

- 按Matt PR流程创建[PR #84](https://github.com/huruizhi/Inkora/pull/84)，覆盖INK-UX-122对照规划及INK-UX-123实现/两轴复核；没有新增生产改动。
- fetch后确认`origin/main=3e26211713ff0f78f0e90286a6125ce613b3e442`且为PR HEAD祖先，工作树clean；默认CI以精确HEAD`6c5b749…`手动触发，UI/full-bench均false。
- [CI 42799664771](https://github.com/huruizhi/Inkora/actions/runs/42799664771)首轮在checkout失败：HTTP2 framing与github.com:443连接失败，尚未执行setup/lint/产品测试。不把网络失败算产品结果；没有为了合并绕过门禁。只重跑失败作业，第二轮checkout/setup/lint已恢复通过，后续结算另记。
- 初次desktop预检exit78（锁屏）。用户明确解锁后，重新持UI锁并预检通过；本轮GUI只操作自有示例和隔离构建，不要求输入法配合。
- `make build APP_BUNDLE_IDENTIFIER=com.huruizhi.Inkora.UITesting`：exit0，保留既有actor/chunk警告。仅借用主仓锁定`.tools`/`editor/node_modules` symlink，没有安装或修改依赖。
- CUA启动任务构建的独立UITesting App，打开自有fixture，使用标准窗口zoom动作；同一窗口/文档/文首/浅色/侧栏关闭，依次选择两档。三张原始截图均JPEG/3718×2100，哈希清单3/3通过。
- 实际桌面快捷键⌘⌥⇧2→源码并聚焦、⌘⌥⇧1→可视并聚焦、⌘⇧O→展开/收起大纲均有AX结果。没有输入或提交正文；未把CUA系统按键称为物理中文IME验证。
- 结束时自有fixture SHA仍为`90885c3f…6293`。留下900px只读对照窗口供用户查看，UI锁已释放。`/Applications/Inkora.app`未替换，用户其他文档未编辑。

## 修改文件与证据

- `.scratch/typora-ui-round3/README.md`：方法、来源、结果、局限。
- `.scratch/typora-ui-round3/fixtures/Reading-Width.md`、`reference.png`：既有自有示例的逐字节副本。
- `.scratch/typora-ui-round3/screenshots/*.jpg`、`SCREENSHOTS.json`、`SCREENSHOTS.sha256`：760/900px及900px大纲展开的原始截图和校验。
- 本任务记录。此阶段没有修改产品默认宽度、源码或既有冻结材料。

## 观察与未验

900px首段从3行变2行，首屏能看到完整表头；760px扫读跨度更短。字号/行高/垂直间距没有变化，不把折行减少当作间距优化；本轮不是重新与Typora同主题/同缩放的像素比较。具体图与说明见[阅读对照](../../.scratch/typora-ui-round3/README.md)。

尚未进行物理IME、系统图片面板、所有菜单/多窗口路由、深色/窄窗和最低系统实机验收。默认宽度的选择问题已提供两图向用户提出，未收到答复前仍为760px。合并与最终CI状态、提交/远端一致性在结算时追加。


## 集成结算

- CI [42799664771 attempt 2](https://github.com/huruizhi/Inkora/actions/runs/42799664771/attempts/2)最终success：checkout/setup/lint/non-UI/Release离线资源检查/轻量bench均通过；XCUITest、UI启动与full-bench按默认输入跳过。首轮网络失败完整保留，没有绕过或取消门禁。
- [PR #84](https://github.com/huruizhi/Inkora/pull/84)已在精确HEAD`6c5b749ca560a0064fb08ade472e3915a0ea1302`核对后合并，merge SHA `ecfe2d96ab3368610a9af4eabbb1f98e057ed697`。本地main已fast-forward并与origin一致；本任务分支随后rebase到该main。
- 本轮隔离构建与实机操作基于6c5b749，合并树与其一致；没有为了截图改产品配置。两档截图3/3哈希校验、原始尺寸及fixture未变均已核对。
- CI执行全量门禁，主会话未另重复同一全量测试；本轮自跑为隔离Debug构建、desktop预检/CUA只读观察、图片/fixture哈希与文档检查。UI锁结束后已释放。
- 当前仍未选择新默认；生产保持760px，仅当前隔离对照窗口临时选900px。没有替换安装版或发布新包。下一步依用户阅读偏好决定默认，再继续局部标题/段落节奏调整。

任务内借用symlink在交付前移除，真实依赖目录未动；三张原始截图、fixture和任务文档提交到本分支。最终分支/commit和远端一致性在交付回复说明，证据不冒充main中的产品变更。
