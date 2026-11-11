# INK-REV-159：更新 Spec 独立审查

分支 `task/INK-REV-159-updates-spec`。仅新增本任务与 `docs/reviews/INK-REV-159-updates-spec.md`，无实现修复。报告核心少于400词。

## 固定输入与标准

初始 `git status --short` 空；`git rev-parse HEAD` 为 fe9fa20af585232c1948da556d267c0a35db56b9；`git merge-base cf889ab1f9671bd90fb2820883c907edc3fa92fa fe9fa20af585232c1948da556d267c0a35db56b9` 返回 cf889ab1f9671bd90fb2820883c907edc3fa92fa。

唯一受检 diff：

```sh
git diff cf889ab1f9671bd90fb2820883c907edc3fa92fa...fe9fa20af585232c1948da556d267c0a35db56b9
```

非空：76 files，3505 insertions，52 deletions；完整原件 `artifacts/INK-REV-159/fixed.diff`。`git log --oneline base..HEAD` 核对以下十二提交（从新到旧）：fe9fa20、e76b66b、59bbd5b、bb89972、b890ece、170bf92、d801e85、d838870、5e21856、60dfa95、4c6c570、b206f19，与任务清单逐项一致。

全文阅读 AGENTS.md、GLOSSARY.md、docs/adr/{0001-tech-stack,0003-project-and-bridge,0004-source-authoritative-editing}.md、docs/design/secure-updates.md、docs/updates.md、docs/release.md、docs/tasks/INK-UPD-155/156/157.md。本轴以用户委派与 secure-updates 最新明确授权为准；作者 task/evidence 只界定实现和证明，不充当 spec。

文件名搜索 `rg --files --hidden` 配合 `coding.?standards|contributing|agents.md`，仅有根 AGENTS.md；无 CODING_STANDARDS/CONTRIBUTING。内容搜索 `rg -n -i 'coding standards|contributing|编码规范|代码规范|协作规范' --glob '*.md' --glob '!docs/evidence/**'`，README 指回 AGENTS，其余历史审查不作为本次规范。未审查其他动态根工作区。

实际读取 [Issue31](https://github.com/huruizhi/Inkora/issues/31)：目标为直接分发签名可控更新；验收覆盖可信签名、通道恢复、旧安装保护、凭据隔离。没有提交 Issue/PR。

## 覆盖与证据层级

| 契约 | 静态核对与结论 |
| --- | --- |
| Native 菜单、只读结果 | AppDelegate configureUpdates、UpdateMenuController、ReleaseLookup；Debug/测试资格阻断，预览只读，查询中防重入。冲突 legacy 见 finding。历史 Beta1 不支持属批准边界。 |
| 默认行为与通道 | UpdatePreferences 默认检查/下载开启，UpdateService 立即 apply；beta 包含默认，stable 空额外集合。session/pending 均锁通道，无安装中的旧意图切换。关闭设置影响后续调度，进行中由 SDK 标准 UI 管理。 |
| 失败与代际 | UpdateInstallationState UUID、归属、prepared 三重限制；3000/3001/3002 仅解本次未准备锁；旧token不清新token；跨进程/未知延期锁直到host build达到pending，属根批准。静态读测试，未转称自跑。 |
| SDK语义 | 只读固定 `/tmp/inkora-sparkle-2.10.0/Sparkle.framework/Versions/B/Headers/SPUUpdaterDelegate.h`：didDownload、willInstallOnQuit、didAbort、didFinish及 SPUUpdater 属性；返回false保留官方退出安装调度，未自制安装器。 |
| 共享退出 | AppDelegate → DocumentTerminationReview → TerminationReviewGate；依次prepareForClose、reviewUnsavedDocuments、成功才finishRecovery/reply，一次进行中守卫。InkoraDocument既有snapshot屏障仍使用，composition/sourceDraft由既有编辑器屏障负责。作者离屏WK与原生review布尔注入只是引用，不是本票物理IME或保存面板实测。 |
| Distribution与旧安装 | project.yml精确2.10.0和锁定revision；普通target无SDK依赖，正式独立target与签名guard，release.sh正式archive选择Distribution；未降低LV/Sandbox/runtime。预览不下载应用包，未触碰安装。 |
| manifest producer/consumer | manifest.py从ZIP和实际资产重算，新schema字段与客户端兼容；tag/channel/bundle/Int64/URL绑定。严格生成器不弥补客户端legacy冲突缺口。 |
| 签验工具与配置 | staging.py固定官方tool SHA，archive/feed签验、CryptoKit公钥复验包、每次撤旧receipt；sign-nested内向外，主App最后；Info缺生产key不启动SDK，正式凭据门槛保留。未进行生产key操作或发布。 |

## 本票实际运行：有限公共解析探针

所有探针文件/二进制/log保留 ignored `artifacts/INK-REV-159/`，`git check-ignore artifacts/INK-REV-159/probe.swift` 确认忽略。不安装依赖、不创建工具链接、不改SDK缓存。

```sh
swiftc -swift-version 6 -parse-as-library app/Sources/UpdatePolicy.swift app/Sources/ReleaseLookup.swift artifacts/INK-REV-159/probe.swift -o artifacts/INK-REV-159/probe > artifacts/INK-REV-159/compile.log 2>&1
artifacts/INK-REV-159/probe > artifacts/INK-REV-159/probe.log
```

编译与执行exit0。源文件在上述目录：main创建checks.export/zip.versions均为正式bundle/build3，分别附加空字段、顶层other.app/build999、schema数值42，调用真实 `ReleaseLookup.build`，结果：

```text
control: ACCEPT build=3
conflicting bundle/build: ACCEPT build=3
invalid schema: ACCEPT build=3
```

对照合法legacy被接受符合预期；后两项确认fail-closed缺口。此为真实解析公共接缝，不是网络/安装测试。未运行完整make lint/test、Native/Release/CI、AppDelegate、可见窗口/面板、CUA/browser/XCU、物理IME/mac14或实际安装，避免与根串行门禁竞争。没有删除、绕过或修改有效测试及冻结证据。

## 交付与剩余风险

结果：a无新增确定缺项；b无越界；c一项P2，详报告。生产签名、公证、公钥/feed激活、完整分发同Team加载、真实退出保存/取消及安装/恢复仍未验；本次未将作者/root证据当独立通过。原始probe与worktree均保留待根两层备份回收，不自行删除。

最终提交、push及 `git ls-remote` / clean结果在交付消息中提供，避免自引用commit。交付前执行 `git diff --check`，只提交两份指定中文文档。

## Post-fix 限定复验（只追加）

起始审查分支 HEAD a2a0d9c04a86b178b2afdceb794f4618b558d9d8，status clean；两个原文文件均与该提交逐字比对后才追加。固定产品0993c323ba299d1561de6f4a8d15b683e7635ced，相对fe9fa20的产品修改只有ReleaseLookup.swift与同域tests，其余为文档/审查记录。`git diff 27420b261f5db3e975ace4e961484ce2faec0bed 0993c323ba299d1561de6f4a8d15b683e7635ced -- app/Sources/ReleaseLookup.swift tests/InkoraTests/ReleaseLookupTests.swift` 输出空，确认修复等价。

固定提取与本票实际命令（均在本worktree，未访问动态root）：

```sh
git show 0993c323ba299d1561de6f4a8d15b683e7635ced:app/Sources/ReleaseLookup.swift > artifacts/INK-REV-159/ReleaseLookup-postfix.swift
git show 0993c323ba299d1561de6f4a8d15b683e7635ced:app/Sources/UpdatePolicy.swift > artifacts/INK-REV-159/UpdatePolicy-postfix.swift
swiftc -swift-version 6 -parse-as-library artifacts/INK-REV-159/UpdatePolicy-postfix.swift artifacts/INK-REV-159/ReleaseLookup-postfix.swift artifacts/INK-REV-159/probe.swift -o artifacts/INK-REV-159/probe-postfix > artifacts/INK-REV-159/compile-postfix.log 2>&1
artifacts/INK-REV-159/probe-postfix > artifacts/INK-REV-159/probe-postfix.log
swiftc -swift-version 6 -parse-as-library artifacts/INK-REV-159/UpdatePolicy-postfix.swift artifacts/INK-REV-159/ReleaseLookup-postfix.swift artifacts/INK-REV-159/boundary-postfix.swift -o artifacts/INK-REV-159/boundary-postfix > artifacts/INK-REV-159/compile-boundary-postfix.log 2>&1
artifacts/INK-REV-159/boundary-postfix > artifacts/INK-REV-159/boundary-postfix.log
```

两次编译与执行均exit0，编译日志空。原probe.swift逐字复用，原日志/二进制未覆盖；补充boundary-postfix.swift通过precondition断言5组实际结果。

```text
control: ACCEPT build=3
conflicting bundle/build: REJECT
invalid schema: REJECT
additional malformed versions: REJECT PASS
actual Bool true: ACCEPT PASS
numeric prerelease 1: REJECT PASS
new schema control: ACCEPT PASS
new schema channel conflict: REJECT PASS
```

静态核对新diff：存在schema必须进入严格新schema校验，不再因类型错误降级；legacy顶层公开/plist别名与checks对照，包含类型/null、tag/channel和Bool；additional check自身须对象，存在versions必须严格一致。新schema原结构/Int64/bundle/tag/channel/asset校验保持。原P2关闭；本次限定复验无同域新增finding。a/b结论与批准例外不变。

作者hostless15项仅外部证据，本票不转称自跑。未扩大至完整Native/Release/CI、GUI、网络或实际安装，无生产key/feed动作。所有raw固定副本/探针/log保留ignored artifacts/INK-REV-159，等待根两层备份；worktree不回收。仅追加本票两文档，未改实现/测试/冻结证据。提交后远端SHA与clean实查见交付消息。
