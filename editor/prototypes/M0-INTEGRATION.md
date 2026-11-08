# M0 固定产物集成与验收交接

任务：INK-PROT-008。分支：`task/INK-PROT-008-m0-integration`。这是隔离原型的集成工作区，不是产品主干或最终架构采纳。

## 已接入固定产物

| 产物 | 固定来源 | 范围 |
| --- | --- | --- |
| EOL/no-op 修正版原型 | 692493508d4b5ac78f0b212045aae32a8b59b90e | fidelity/ |
| 审计后的独立样稿 | 484ee81d924efd2a1038e8421b146f4ae5d5b743 | fidelity-cases/，11 例 47 步 |
| 隔离 WKWebView 宿主 | 952d5713d2fd9c147e289382417ae1976fe964af | fidelity/native-host/ |

通过 git merge 保留来源历史，未改独立样稿的字节预期。005 保护边界、006 选区纯模块仍由独立 Agent 执行，尚未接入。

## 管理者实际检查（2026-11-08）

- 接入样稿时，fidelity/ 的 Git tree 与 6924935 相同，fidelity-cases/ 的 tree 与 484ee81 相同，汇合未修改原产物。
- `python3 editor/prototypes/fidelity-cases/verify.py`：557 项数据检查通过；只证明样稿完整性，不证明原型支持这些动作。
- 宿主接入后的构建提交为 `82731d26fd57226abc681d45dd13c8a578c86e5a`。`make -C editor/prototypes/fidelity/native-host verify`：Swift 编译、ad-hoc/Hardened Runtime 签名、codesign strict、Sandbox entitlements 与资源检查通过；Info.plist 与 manifest 均记录该提交。
- 源 HTML SHA256 为 `61281bd14ad8432e508a2cfeeabeb100cf1fcdfd386e824c41caa86b30f082e1`，CSP 副本 SHA256 为 `0d31a2dfe422f7ec45ff2152317ab41ebc9aec10ac0dd84afbe6bad3466cb4a4`，脚本字节前后一致。
- 本轮未重跑不变的 15 项原型检查/111 项生产编辑器测试；未启动 App、执行 WKWebView 运行时、真实 IME 或磁盘保存。

## 接入顺序与剩余工作

1. 005 交付后按固定提交接入，验证高级片段混排、畸形初始输入及含混缓冲完整保留与保存阻断。
2. 006 交付后先接入纯模块，再实施与 model/main 的源码往返、选区及跨模式历史集成；纯函数通过不能当作界面集成通过。
3. 用审计后样稿重放真实用户动作，记录字节、模式、选区、dirty、revision、Undo/Redo 与保存状态。旧 crossval 报告基于旧样稿，不能直接沿用为新矩阵。
4. 引用链接/图片混排、marks/attrs、结构拆分合并、混合 EOL、composition 历史分组等缺口仍需修正或比较替代架构，不能缩减 M0 判据。
5. 重建最新 HTML 后再构建宿主，核对版本与 hash，取得 UI 锁/preflight 后安排真实 WKWebView、系统中文 IME、光标选区与撤销验收。该宿主无 NSDocument，不证明生产磁盘保存。

总门槛未通过。不得据本工作区已合并、构建成功或样稿数据检查通过关闭 M0、锁定架构或宣告 M1 可交付。
