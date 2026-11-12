# INK-REL-189：本机安装表格与代码工具 build10

用户授权本机安装。基线 3dac317feef5c3850c245c3b1ba634cfad6a58eb；
分支 task/INK-REL-189-local-code-table-preview。产品仅 project.yml build9→10，
marketing 0.1.0 不变，包含已合并表格与代码工具，无新依赖。

使用 make build-release 构建，按源 entitlements 作 ad-hoc/runtime 签名，
核对双架构、版本、离线资源、精确权限和签名。旧版私有 ZIP 备份后，
只有真实进程退出才 staging 原位替换，绝不强退或丢弃用户文档。
安装后使用真实 App 资源执行代码与表格 Native/WK 专项；正常启动仅证明
进程启动，不冒称物理 IME、VoiceOver、可见绘制或 macOS14 实机验收。
只本机部署，不发布 GitHub Release、tag、feed，不改变公证或 Keychain。
完成后保留工作树和压缩回退，仅解除本次借用依赖链接。
