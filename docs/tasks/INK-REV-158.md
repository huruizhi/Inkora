# INK-REV-158：可信更新 Standards 独立审查

## 范围与快照

只审不修，分支 `task/INK-REV-158-updates-standards`。仅新增本 task 与 `docs/reviews/INK-REV-158-updates-standards.md`。无子 Agent，无产品、测试、冻结证据修改；无 PR/Issue/merge/tag/Release/生产 Keychain 操作。

初始 `git status --porcelain` 输出为空；`git rev-parse HEAD` 为 `fe9fa20af585232c1948da556d267c0a35db56b9`；`git merge-base cf889ab1f9671bd90fb2820883c907edc3fa92fa fe9fa20af585232c1948da556d267c0a35db56b9` 返回该 base。非空 diff 为76文件、3505新增、52删除。唯一受检 diff：

```sh
git diff cf889ab1f9671bd90fb2820883c907edc3fa92fa...fe9fa20af585232c1948da556d267c0a35db56b9
```

原件保留 `artifacts/INK-REV-158/fixed.diff`（ignored）。通过 `git log --oneline cf889ab1f9671bd90fb2820883c907edc3fa92fa..fe9fa20af585232c1948da556d267c0a35db56b9` 核对十二提交：

```
fe9fa20 docs(updates): fix review snapshot and preserve raw tool help
e76b66b fix(updater): release only failed unprepared update intents
59bbd5b docs(updater): normalize evidence whitespace and retain raw copies
bb89972 feat(updater): add guarded native update checks and Sparkle distribution
b890ece fix(release): archive the Sparkle distribution scheme
170bf92 docs(updates): record independent manifest validation
d801e85 feat(updates): validate local release provenance manifests
d838870 docs(updates): record independent staging and legacy checks
5e21856 feat(updates): stage signed appcasts with fail-closed validation
60dfa95 docs(updates): fix build paths and release metadata contract
4c6c570 docs(updates): record delegated work and signing prerequisites
b206f19 docs(updates): define secure native update implementation
```

## 书面源与审查方式

全文读取固定快照 AGENTS.md、GLOSSARY.md、docs/adr/0001-tech-stack.md、0003-project-and-bridge.md、0004-source-authoritative-editing.md、docs/bridge-protocol.md、docs/testing.md、docs/release.md、docs/updates.md、docs/design/secure-updates.md。补读 docs/save-barrier.md、docs/recovery.md、docs/offline-editor-host.md。使用 `git show fe9fa20:<path>` 固定规范来源；初始文件读取时 HEAD 与固定值一致。未审动态根工作区文件。

标准源搜索：`rg --files -g '*.md' -g '*CONTRIBUTING*' -g '*STANDARDS*' -g 'AGENTS.md' -g '*GLOSSARY*' -g '*lint*'`；再对 Markdown 搜索 `编码规范|代码规范|命名规范|Coding Standards|CONTRIBUTING|必须|不得`（排除 task/evidence/review/fixture噪音），最后 `git ls-tree -r --name-only fe9fa20` 按 AGENTS/CODING_STANDARDS/CONTRIBUTING/style/lint 名称复核。未找到 CODING_STANDARDS 或 CONTRIBUTING 文件；非本次变化领域的表格、搜索等规格不作为新规则强加到更新模块。

按 code-review skill 的 Standards baseline 审查；本票明确禁止子 Agent，未执行其双轴委派，不混 Spec 结论。十二项覆盖：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。仅两项建议见报告；SDK adapter 和独立状态机的职责隔离有明确契约需求，不以 Middle Man 或 Speculative Generality 报错。跨语言 manifest 合同同步本身也不自动视为违规。

## 独立验证及证据层级

实跑命令（exit 0）：

```sh
python3 -m unittest discover -s tests/updates -p test_manifest.py > artifacts/INK-REV-158/manifest.log 2>&1
python3 tests/ci/release-scheme-smoke.py > artifacts/INK-REV-158/scheme.log 2>&1
```

前者5测试通过；后者2测试通过，仅复制脚本与 stub 命令，未真实调用 Xcode/Keychain/签名。原始日志保留上述 ignored 路径；未安装依赖、未建工具软链。静态读取固定 SDK `/tmp/inkora-sparkle-2.10.0/Sparkle.framework/Versions/B/Headers/SUErrors.h:54–56`：SUUnarchivingError=3000、SUSignatureError=3001、SUValidationError=3002；未凭记忆猜 API，也未修改缓存。

报告中共享关闭路径、默认不链SDK及正式scheme为静态代码审查结论；本票未运行这些路径。docs/tasks/INK-UPD-155/156/157 和 evidence 中的 Native/WK/SDK加载/签验结果均是根或作者历史证据，未转称本票实跑。没有新增 probe，固定diff与本票日志保留供根两层备份；不自行删除 worktree/raw。

## 交付与限制

结果：0项书面硬违规、2项低优先级 possible smell，未修代码。UI 未验证；涉及 DocumentOpenUITests、AcceptanceUITests、Release 启动烟测的菜单、退出审阅与保存/取消/恢复场景应在获准发布验收时集中确认。本票未运行全量 lint/Native/Release/CI、不启动 AppDelegate/App/窗口，不执行真实安装/重启、物理IME或macOS14专项。正式同Team签名/嵌入、生产信任激活与安装行为仍无本票验证，不能从工具测试推出上线可用。

最终文档提交 fullSHA、push/远端核对和 clean 结果由交付消息记录，避免文档自引用提交哈希。完整测试门禁仍由根串行执行。
