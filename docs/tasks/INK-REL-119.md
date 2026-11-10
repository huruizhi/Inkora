# INK-REL-119：发布 GitHub 未签名预览版

## 授权与范围

用户于 2026-11-10 明确选择“现在发布 GitHub 未签名预览版”，取代此前仅准备候选的阶段限制。
独立分支 `task/INK-REL-119-unsigned-preview`，基线 `3a68e0750d9e8d3b4afd85b12cdb71a60cf82513`。
仅同步分发文档、准备并发布预览资产；不改产品实现、依赖、签名脚本，不重复物理 IME 或 macOS 14 验收。

## 固定输入与准备检查

- App 0.1.0 / build 3，原始构建源码 `bd45d4bd4bb62e9cc5ae4d8891664de5b6183cc4`，原候选检查见 INK-REL-118。
- 原 ZIP SHA256 `1eefe39701165fe63d26b0fb5aa77212e97e83a5f1b9e634ccf125ca793836c6`。
- 原 DMG SHA256 `8b35253dd40aa3f6de9e02cb5d79f07ab0e1cd1c3597e5d78ac188fd5cfd9b66`。
- 本次 `gh auth status` 通过；发布前远端没有已有 Release 或 tag，无需覆盖资产。
- 本次原候选 `shasum -a 256 -c SHA256SUMS` 两包均通过。

## 修改文件

README、CHANGELOG、ADR-0001、`docs/release.md`、Beta 1 发行说明及本任务记录。
它们将正式签名分发和本次用户授权的未签名预览分开，删除“本轮仅本地候选”的过期状态；严格正式发布脚本保持原样。

## 发布与验证方法

以 `v0.1.0-beta.1` 建立 draft prerelease，上传名称带 `unsigned-universal` 的原 ZIP/DMG、SHA256SUMS、provenance 和样例包。
检查 draft 资产后公开预发布；发布后读取 Release API，核对 tag 的精确 commit、prerelease/draft 状态、资产名称及 SHA256，并从公开下载链接实际下载两包复验。
发布回执保存在忽略的 `artifacts/release/unsigned-preview/`，避免修改已发布标签或产生循环自引用 commit。

## 证据层级与未执行项

本任务没有产品代码修改，不重复原 Web 777/Native 182 测试；原证据只作引用。
本次执行文档 diff 检查、产品树相等检查、ZIP 解压签名/架构/资源检查、DMG 完整性、资产上传/公开下载校验。
没有 Developer ID、公证、Gatekeeper 下载首启、GUI/物理 IME 或 macOS 14 新证据；本版本仅为明确标注限制的预览版，不宣称上述门槛通过。

## 发布后实证与权限决定

上述“公开下载”是发布前验证计划，实际未通过匿名访问验证，不能作为匿名可下载的通过声明。
GitHub Release `v0.1.0-beta.1` 已于 `2026-11-10T02:46:38Z` 发布，`draft=false`、`prerelease=true`；标签固定为 `e123772e0632dec89aa8ca527f9e44669259ede8`。
仓库实际为 private，匿名下载返回 404；有仓库权限的 `gh release download` 下载五个附件成功，均与上传前字节及 GitHub digest 相同，下载目录内的 `shasum -a 256 -c SHA256SUMS` 四项通过。
用户随后明确选择“仅在当前私有仓库发布，暂不开放外部下载”。因此当前发布符合决定，不再把匿名访问作为本版待办；不修改仓库权限，不新建公开下载仓库。
范围与状态更正在 INK-REL-120 同步，原标签和已发布附件均不变。
