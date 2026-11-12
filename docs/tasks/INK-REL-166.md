# INK-REL-166：强制关闭旧 App 并部署本机 build6

用户明确要求强制关闭卡住的 Inkora 并部署新版。本任务仅本机安装，
包含 164 标题栏拖动与 165 标题末尾 Enter 两个已验证修复；保持 0.1.0，build5→6。
分支 `task/INK-REL-166-local-hotfix`，基线 main `755dc6c`；
整合提交 794f19f / 1bbc15c（本分支 537b1a4 / 59a56cb）。
本机安装源码固定 `0f43e329c7e890412ef6b5f5929203f78d6f148e`。

## 执行与保护

- 核实运行程序来自 `/Applications/Inkora.app/Contents/MacOS/Inkora`、原安装 build5。
- 强退前 ditto 备份旧 App 和恢复目录现有 20 个相关文件；不打印正文、不提交 Git。
- 按授权仅对该安装的 PID 25146 发 SIGKILL，并检查退出；未强退其他程序。
- `make build-release` 构建正式 bundle ID、0.1.0/build6，lipo 实查 arm64+x86_64。
- 新 App 复制到 /Applications 隐藏 staging，核对后将旧安装移到备份，
  staging 原位重命名为 `/Applications/Inkora.app`；失败时回退旧安装。
- 最终权限检查发现 Xcode 默认注入 get-task-allow；不是正式权限清单的一部分。
  将构建副本按源 entitlements 展开为正式 bundle ID，ad-hoc + runtime 重新签名，
  保留第一份 build6 原件，再用相同 staging/回退流程替换。
  最终 strict/deep 验签、精确 entitlements（无调试额外权限）、Hardened Runtime 均通过。
- 安装后可执行文件 SHA256 与构建副本相同，5 个 editor 资源逐项同 SHA；
  无 Sparkle 强链接，离线 bundle check 通过。
- 以安装后真实资源运行后台回归 10+1 项全部通过。
- CUA getApp 尝试打开失败：native pipe startup failed；未绕过改用其他桌面控制。
  安装已完成，自动唤起/可见实测未完成，需用户手动打开。未改用户正式文档。

## 自跑验证

- `make build-release`：exit0，含 prepare-renderers、TypeScript、Vite、Xcode Release。
- `make lint test-editor test-ci`：exit0，47 文件 **819 passed**；CI stub/脚本检查通过。
- 组合 `SidebarNavigationHostless.sh` **10/10**、`TypingHostless.sh` **1/1**。
- 安装后 `INKORA_SIDEBAR_RESOURCE_BUNDLE=/Applications/Inkora.app artifacts/INK-UX-132/navigation-tests`：10/10。
- 安装后 `INKORA_TYPING_RESOURCE_BUNDLE=/Applications/Inkora.app artifacts/INK-FIX-165/typing-tests`：1/1，
  从空文档输入 #、标题、删除、回车、正文、撤销/重做、prepareForClose 无 error。
- `codesign --verify --deep --strict`、精确 entitlements Python 比对、lipo、
  `editor-bundle-smoke.sh /Applications/Inkora.app`：通过。
- `git diff --check`：通过。未运行全量 Native/Bridge、Release 包装/公证、CI、GUI/物理键盘/IME/macOS14。
  隐藏 WK 的几何/事件交接不等于可见拖动。

## 文件、备份与交付

本任务新增产品改动只有 `project.yml` build6；其他产品文件来自上述两个修复提交。
新增本任务记录及 `docs/evidence/INK-REL-166/` 构建/检查/已安装资源测试日志与安装收据。
日志仅去行尾空格/尾空白行，原始输出保留 /tmp 和 artifacts/logs。

根项目备份：`artifacts/deployments/build6-20261112-105251/`，不依赖临时 worktree。
含强退前/后的恢复目录、旧 App 副本与旧原安装、第一份权限归一前的 build6、
exact entitlements、preflight/installation 收据。恢复内容未删除或改写；
强制关闭无法保证尚未持久化的内存输入可恢复。
安装收据：`docs/evidence/INK-REL-166/installation.json`。

现有 InkoraDocument actor/Any? 与 Vite chunk warnings 保留。
本地包仍 ad-hoc、无 Developer ID/公证；未改变 Sandbox/Library Validation。
GitHub Beta2/build5 未替换；本机 build6 不代表公开发布。未宣称已自动启动。
仅 unlink 本任务创建的两个依赖链接，保留工作树、构建和全部备份。
