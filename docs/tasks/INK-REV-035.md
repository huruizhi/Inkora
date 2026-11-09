# INK-REV-035：Sandbox 图片宿主独立验收

## 完成内容

- 以固定提交 `e7930fe8caa13475b34c24969f9b7fc309123633` 独立审查 INK-PROT-032；当前 HEAD 与固定提交一致。
- 阅读 AGENTS、ADR-0003、原型 README、DIAGNOSTICS、Makefile 与全部宿主/控制程序/模型/验证脚本源码。
- 实际运行规定的 `build`、`check`、`verify`，均返回 0；`check` 实际为 16/16 纯模型断言通过。
- 用不落库的 CLI 接缝核对百分号、逐组件 symlink、SHA/MIME：确认中间组件 symlink 被安全拒绝，但被误分类为 `io-error/ENOTDIR`。
- 审查 security scope/bookmark 生命周期、token/document/epoch 隔离、路径解码、descriptor 打开、SHA/MIME、stop/cancel/generation 边界。
- 纳入管理者独立运行观察：App 进程存在但无窗口和事件日志；静态代码确认无 nib/storyboard 且未显式实例化并安装 delegate，结论为阻断。
- 未运行 `run`/`open`，未触碰桌面、面板、浏览器、输入源或用户文件；未修改生产实现、INK-PROT-032 原始证据、依赖、Issue/PR/main。

完整结论和命令证据见 [`docs/reviews/INK-REV-035-sandbox-host.md`](../reviews/INK-REV-035-sandbox-host.md)。

## 验收结果

**不通过，修复后复验。**

1. 阻断：宿主没有实例化 `AppDelegate`，真实纵向场景不可达；修复由独立 INK-PROT-037 处理。
2. 高：中间组件 symlink 返回 `ENOTDIR`，被记录为 `io-error` 而非 `symlink`。
3. 中：16 项模型的取消检查使用未接入实际 scheme handler 的 `CallbackGate`，也没有覆盖 broker generation 竞争，不能证明真实 stop/cancel/generation 边界。
4. 低：README 同时写 15 项和 16 项；实际为 16 项。

## 实际验证

- `make -C prototypes/local-assets/native-host build`：通过，rc=0。
- `make -C prototypes/local-assets/native-host check`：通过，rc=0；16/16 纯模型断言，内含 verify 通过。
- `make -C prototypes/local-assets/native-host verify`：通过，rc=0。
- 补充 Swift CLI 接缝：rc=1；6 项通过，唯一失败为中间组件 symlink 期望 `symlink`、实际 `io-error/ENOTDIR(20)`。这是预期建立的最小红例，不是构建失败。
- 未运行任何 UI 测试或启动 App 的命令。

## 修改文件

- `docs/reviews/INK-REV-035-sandbox-host.md`
- `docs/tasks/INK-REV-035.md`

## 未完成与风险

- 等 INK-PROT-037 启动修复后，由管理者持 UI 锁重做真实面板、bookmark、WK、epoch、revoke、退出重启验收。
- 原实现需要独立修复 symlink 诊断分类，并为实际 scheme handler/broker 增加可控并发接缝；035 不代改。
- 当前结果不能证明真实 OS 授权、bookmark 恢复或 WK 加载通过。

分支：`task/INK-REV-035-sandbox-host-acceptance`。
