# INK-REV-162：Beta2 Standards 独立审查

仅新增本任务与 `docs/reviews/INK-REV-162-beta2-standards.md`；只审不修，不裁定 Spec。分支 `task/INK-REV-162-beta2-standards`，初始工作区 clean。受检 HEAD `846fd178e723378cde86f90e292943bf16152e6f`，base/merge-base `b2e0ac89e5cca13f20a8307437c1ff6c6d14e4af`；5提交为846fd17、859bcbc、ad74ad3、b15c82e、6ce04cc。审查全程产品文件固定在该 HEAD，没有读取动态根工作区产品。

## 书面源与边界

通过 `git ls-tree -r --name-only HEAD` 搜索全部文件名，另搜索 coding/standard/contributing/convention/README/ADR；CODING_STANDARDS.md、CONTRIBUTING.md 不存在。全文阅读 AGENTS.md、GLOSSARY.md、README.md、现有全部 ADR（0001/0003/0004）、docs/testing.md、docs/release.md、docs/updates.md、docs/design/secure-updates.md、docs/design/preview-beta2-candidate.md、INK-REL-160/161 task、161 README/probe/metadata 与新增 diff。既有158审查仅作记录格式参考，不把旧 findings 当新增问题。书面规则优先于 Fowler 判断，不报告工具已强制的格式规则。160及最新委派契约优先于旧禁发/缺bundle政策。

使用 code-review 技能的 Standards 判据；本次明确禁止子Agent，因此仅独立单轴审查。Fowler十二项逐项核对结果见报告。未访问外部文档或GitHub写接口，不建tag/PR/Issue/Release，不安装启动App、不用GUI/Keychain、不运行完整Native/Release/CI/WK、不安装依赖或创建工具链接。

## 本人实际命令与结果

- `git status --short`、`git rev-parse HEAD`、`git merge-base <base> <head>`、`git log --oneline <base>..<head>`：初始clean，提交/基线吻合。
- `git diff b2e0ac89e5cca13f20a8307437c1ff6c6d14e4af...846fd178e723378cde86f90e292943bf16152e6f`：33文件、1083新增/8删除；按产品、测试、发行文档、证据分块核对。唯一diff SHA256：4237b63b13ceee8fcfa4a60ac84be69586e4bd1a3c806af5fa0e8601bbba9eeb。
- `bash docs/evidence/INK-REL-161/run-policy-tests.sh > /tmp/ink-rev-162-hostless.log 2>&1`：exit0，17/17；仅独立临时SPM hostless，保留warning（fixture未声明resource），不启动产品。日志复制至ignored `artifacts/INK-REV-162/hostless.log`，临时原日志保留。
- 只读 `python3`（hashlib/json/zipfile/plistlib/subprocess）：读取指定 `/Users/rayhu/Documents/projects/Inkora/artifacts/releases/0.1.0-beta.2-build5`，逐包重算长度与SHA，与清单精确比较；ZIP 2564088字节、SHA `bb1a9537acd756891e0e6afad2b6e40afcd643d48e28951ea491051152b4033e`，DMG 3083945字节、SHA `3724e8a136c63093384a755ba2a1d09e8bd4f7ca44463bdb1f5d0fc2e617c0e5`。ZIP plist正式bundle/0.1.0/build5/14.0匹配；清单严格8字段、与固定证据原件逐字一致。历史fixture SHA匹配批准值。
- `git rev-parse <sourceCommit>:app/editor/project.yml` 分别与受检HEAD对照：source `76715e0dc3dac6e0bb1aae75b513256ad7ba7eb2` 三者一致（app `397981a710e7dbd3f88c8bcb3a3106f087141e49`、editor `7bee7c1f70c595e3cfba8dad8d149dc49dad1bcb`、project `975e008515d1faa374b1f0c97754c2b3e84684ee`）。
- `git diff --check <base>...<head>`：exit2，原始native.txt 6行尾空白；不改写原证据，不列工具强制标准发现。新增文档交付另跑 `git diff --check`。

## 证据层级与未验风险

161的lint/test-ci、有限Native12/12、manifest5/5、签名权限/离线检查为作者结果，仅引用。raw archive未签名的strict=1与bundle权限=65不是本票失败或已通过；export/ZIP/DMG通过也不代表Developer ID、公证、Gatekeeper或实际启动。未重挂载DMG、未重跑签名检查。候选SOURCE/CHECKS/receipt仍local；根负责最终公共SOURCE/五资产校验和、精确HEAD默认CI、发布及匿名下载。旧Beta1/build4必须保留。0 hard、0 judgement，不代表Spec完成度。

按授权提交并push后核对 `git ls-remote origin refs/heads/task/INK-REV-162-beta2-standards` 等于本地HEAD及clean；fullSHA由最终通知给出。worktree、ignored日志和原probe保持，等待根双备份后回收。
