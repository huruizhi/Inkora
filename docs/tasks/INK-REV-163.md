# INK-REV-163：Beta2 Spec 独立审查

只审不修；仅新增本任务及 `docs/reviews/INK-REV-163-beta2-spec.md`。分支 `task/INK-REV-163-beta2-spec`。初始clean，HEAD=846fd178e723378cde86f90e292943bf16152e6f；base及merge-base=b2e0ac89e5cca13f20a8307437c1ff6c6d14e4af。`git diff b2e0ac89e5cca13f20a8307437c1ff6c6d14e4af...846fd178e723378cde86f90e292943bf16152e6f` 非空，五提交846fd17/859bcbc/ad74ad3/b15c82e/6ce04cc；未审动态root。

已全文阅读AGENTS/GLOSSARY、全部三份ADR、release/updates、160/161任务与发行说明，检查161证据和产品差异。授权以160及本次消息为准，不将旧禁止发布规则当作本版阻塞。

本人实际执行与结果：

- `git status --short`、`git rev-parse HEAD`、`git merge-base <base> <HEAD>`、固定三点diff/stat/log：初始clean、身份及唯一非空diff正确。
- `git diff --exit-code 76715e0dc3dac6e0bb1aae75b513256ad7ba7eb2 846fd17 -- app editor project.yml config`：exit0；git rev-parse两端app/editor/project对象一致，与SOURCE相符。
- `bash docs/evidence/INK-REL-161/run-policy-tests.sh`：exit0，17/17；原日志保留ignored `artifacts/INK-REV-163/hostless.log`。
- 只读Python hashlib/json/zipfile/plistlib probe：候选路径 `/Users/rayhu/Documents/projects/Inkora/artifacts/releases/0.1.0-beta.2-build5` 两包长度及完整SHA与manifest/指派一致；manifest与固定HEAD证据同字节且8字段；ZIP bundle/版本/build/最低系统正确；历史fixture SHA一致。
- `swiftc app/Sources/ReleaseLookup.swift app/Sources/UpdatePolicy.swift docs/evidence/INK-REL-161/consume-manifest.swift -o artifacts/INK-REV-163/consumer` 并以候选PROVENANCE执行：exit0，build5。

结论见审查文档：1项P3文档歧义，无发现产品或包阻塞。不改包/PROVENANCE/SOURCE，不上传CHECKS/receipt，不动Beta1/build4，不安装启动App，不运行GUI/Keychain，不新建Agent。完整Native/Release/CI、实际发布和公开复验未由本人执行；作者结果仅引用。根仍须结算默认门禁、最终公共SOURCE与五资产上传复验及双备份；保留本worktree和ignored probe供备份回收。未运行make全套，因本轴仅文档且禁止重复完整门禁。
