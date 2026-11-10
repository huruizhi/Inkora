# INK-REL-121：公开现有 Inkora 仓库

## 范围与授权

用户明确授权“如果已经准备好了，可以把仓库改成 public”。此次变更取代先前暂不开放外部下载的决定，直接公开 `huruizhi/Inkora`，不创建第二个下载仓库。
分支 `task/INK-REL-121-public-repository`，固定基线 `03fc8844aa31783c8e5c08b46e62d12003d0a65d`。
只修改仓库可见性及权限文档；不改变产品、标签、安装包字节或既有未签名/未公证声明，不自动添加开源许可证。

## 公开前检查

- 仓库元数据为 private，当前身份具有 admin 权限，main 工作区干净。
- 获取远端分支后，扫描可达 Git 对象及 commit message：5,584 个对象中的 2,497 个 blob，共 40,389,286 字节；检查常见 GitHub/AWS/API/Slack 凭据、私钥与带密码 URL 模式，未发现命中；未发现敏感凭据文件名。
- GitHub Issue/PR 正文 82 条；Issue/PR review/commit comment 三类均为 0，使用同一模式检查未命中。
- CI 仅 `workflow_dispatch`，`contents: read`，不添加外部 PR 自动执行或更改 self-hosted runner 策略。
- 以上为模式扫描，不是完整安全审计；扫描未输出疑似凭据值，也未改写历史。

## 可见性与验证

现有连接器不提供可见性写入，使用已登录本机 `gh repo edit huruizhi/Inkora --visibility public --accept-visibility-change-consequences`，exit 0。
公开后通过无认证 HTTP 请求核对仓库 `visibility=public/private=false`、Release `draft=false/prerelease=true`，并实际匿名下载全部五个附件。
ZIP、DMG、样例、provenance 和清单的下载字节均与原上传副本及 GitHub digest 相同；下载目录执行 `shasum -a 256 -c SHA256SUMS` 四项通过。
`v0.1.0-beta.1` 仍指向 `e123772e0632dec89aa8ca527f9e44669259ede8`，App 仍为 0.1.0 / build 3。

## 修改与门禁

README、发布流程、Beta 1 说明、INK-REL-120 后续决定及本记录；Release 网页正文同步 public 状态。
运行 `git diff --check`、产品树与原 build 3 源码相等检查；文档分支按仓库规则触发默认非 UI CI，结果在 PR 与本地回执结算。
没有产品实现变化，不新增镜像测试或重复物理 IME/macOS 14 验收；未执行或冒称 Developer ID、公证、Gatekeeper 首启和最终桌面视觉验证。

扫描、匿名 API、下载和发布状态回执位于主仓忽略目录 `artifacts/release/public-visibility/`。
