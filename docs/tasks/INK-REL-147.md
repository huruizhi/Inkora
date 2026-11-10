# INK-REL-147：Beta2 本地候选准备

固定基线 2f7a9a226769bf9d34d3266c374ecb8764f588ea。独占 project.yml build3→4、CHANGELOG、新 Beta2 说明与自身证据；不修改产品逻辑、脚本校验或旧 Beta1。

先提交版本/说明源，再执行既有 make release-dry-run、make lint test-ci。候选与原 dry-run 输出保留至管理者独立审查和双备份。精确最终 HEAD 默认 CI pending，完整 editor/Native/默认CI由管理者集中结算。

没有公开发布授权，不启动或安装 App，不执行桌面/物理专项。不将结构检查视为 Developer ID、公证、Gatekeeper 或完整体验通过。

## 实测结算

版本源码提交：`a5267f1325753842a868263ec26ae4b055f760b2`。后续证据提交只添加文档，app/editor tree 和 project.yml blob 须与该源码完全一致。

- [x] 既有 `make release-dry-run` exit 0；原始 DRY-RUN 包、SHA256SUMS、脱敏 release.log 均保留。
- [x] `make lint test-ci` exit 0（Swift/TS lint、入口、release参数/凭据/脱敏/权限、UI锁隔离测试、性能比较器测试；未执行App/UI或benchmark）。
- [x] `security find-identity -v -p codesigning` 仅汇总计数：有效身份0，Developer ID Application 0。
- [x] 去除三项发行凭据后 `make release` 返回 make 2 / 脚本78，缺身份即停止；严格策略未改。
- [x] archive/export/ZIP解出/只读挂载DMG内 App 均为 formal com.huruizhi.Inkora、0.1.0/build4、14.0；lipo 均为 x86_64 arm64。
- [x] export/ZIP/DMG 的 strict deep codesign、ad-hoc/runtime、Sandbox及既有entitlements精确比较、现有离线bundle检查均通过；三者Mach-O SHA256相同。archive 按原脚本 CODE_SIGNING_ALLOWED=NO，不冒称已验证正式签名。
- [x] 原脚本 hdiutil verify、attach -readonly -nobrowse -noautoopen / detach 成功；补充版本检查也使用相同只读挂载参数并卸载，未启动App。
- [x] 候选目录 `artifacts/release/beta2-CANDIDATE-unsigned/` 复制原始字节，分别cmp和重新SHA256；候选与原始目录的 `shasum -a 256 -c SHA256SUMS` 均通过，未重新打包。
- [x] 本地与提交证据含 PROVENANCE.json / SHA256SUMS，绑定源码和 app/editor/project 身份、资产哈希、实际工具链与执行检查。
- [ ] 精确最终HEAD默认CI：pending，管理者集中结算；完整editor/Native/默认CI未在本任务重复。
- [ ] Developer ID、公证、Gatekeeper/quarantine、干净用户、真实paint、人工VoiceOver、真实授权未验。用户取消的macOS14专项和重复物理IME未复做。

构建限制：Vite既有大chunk告警、Swift actor isolation/Any?警告、未设置App category及hdiutil弃用提示仍在原日志。Xcode有一行“command failed with exit code 0 but produced no further output / SwiftCompile arm64”诊断，但原始dry-run最终exit0、双架构与各包结构检查成功；保留这一异常，不据此虚构编译无告警或修改构建参数。

仅借用自己创建的 .tools 与 editor/node_modules symlink，结算时unlink；构建、候选、补充检查解包目录和日志保留待根独立审查和双备份。没有新tag/PR/Issue/Release/draft或公开资产，没有安装/强退/启动Inkora。

根复查后核读当前 toolbar/main，修正发行文案：统计位于标题行右上，查找替换通过快捷键/原生菜单按需进入；明确图片目标或位置失效关闭未应用输入、跨节点草稿恢复未实现。此纯文档修正不重建候选。
