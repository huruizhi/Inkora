# INK-REL-120：私有预发布状态收口

## 范围与决定

用户确认“仅在当前私有仓库发布，暂不开放外部下载”。本任务记录实际发布结果并统一权限措辞，不创建公开下载仓库、不改变 Inkora 可见性、不重打包或替换现有资产。
分支 `task/INK-REL-120-private-preview-status`，固定基线 `90542854868b4f9ba55f37635237ae245956056b`。

## 修改文件

README、发布流程、Beta 1 说明、INK-REL-119 发布后实证及本任务记录。Release 网页正文增加同一私有权限说明，不变更标签或附件。

## 验证与证据

- GitHub 仓库 metadata：`visibility=private`。
- Release `draft=false`、`prerelease=true`，tag `v0.1.0-beta.1` 对应 `e123772e0632dec89aa8ca527f9e44669259ede8`。
- 前一任务已实际下载并校验五个附件；本次复核当前线上 metadata、资产 digest 与下载副本，检查正文权限说明一致。
- `git diff --check`，以及原 build 3 源码与本任务产品树相等检查。
- 不修改产品，未重复 Web/Native/GUI/物理 IME 测试，也不宣称这些新证据；原产品验证见 INK-UX-112/115 与 INK-REL-118。

原下载与发布回执位于主仓忽略目录 `artifacts/release/unsigned-preview/v0.1.0-beta.1/`。
本版无 Developer ID、公证或 Gatekeeper 下载首启证据，仍有已披露的最终桌面复查限制；这些不被私有预览发布解释成正式质量验收通过。

## 后续决定

用户随后明确授权“如果已经准备好了，可以把仓库改成 public”。INK-REL-121 执行公开前检查并将现有仓库改为 public，匿名仓库/Release API 和五个附件下载校验通过。
本任务的 private 状态保留为当时发布记录；当前权限以 INK-REL-121 为准，原标签、附件和未签名限制不变。
