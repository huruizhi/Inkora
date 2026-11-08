# M0 固定产物集成与验收交接

任务：INK-PROT-008。分支：`task/INK-PROT-008-m0-integration`。这是隔离原型的集成工作区，不是产品主干或最终架构采纳。

## 已接入固定产物

| 产物 | 固定来源 | 范围 |
| --- | --- | --- |
| EOL/no-op 修正版原型 | 692493508d4b5ac78f0b212045aae32a8b59b90e | fidelity/ |
| 审计后的独立样稿 | 484ee81d924efd2a1038e8421b146f4ae5d5b743 | fidelity-cases/，11 例 47 步 |
| 隔离 WKWebView 宿主 | 952d5713d2fd9c147e289382417ae1976fe964af | fidelity/native-host/ |
| 保护边界与含混缓冲 | 6b0c33e43a0f40603faf6c06937d99c98b6be57b | fidelity/ |
| 双向选区纯模块 | 598312093ffef5413ae0a45c36ce24008c94b50e | fidelity/ 三个新增文件 |

通过 git merge 保留来源历史，未改独立样稿的字节预期。005/006 已接入，006 尚未与界面接线；原执行 Agent 均已归档，工作区保留。

## 管理者实际检查（2026-11-08）

- 接入样稿时，fidelity/ 的 Git tree 与 6924935 相同，fidelity-cases/ 的 tree 与 484ee81 相同，汇合未修改原产物。
- `python3 editor/prototypes/fidelity-cases/verify.py`：557 项数据检查通过；只证明样稿完整性，不证明原型支持这些动作。
- 宿主接入后的构建提交为 `82731d26fd57226abc681d45dd13c8a578c86e5a`。`make -C editor/prototypes/fidelity/native-host verify`：Swift 编译、ad-hoc/Hardened Runtime 签名、codesign strict、Sandbox entitlements 与资源检查通过；Info.plist 与 manifest 均记录该提交。
- 源 HTML SHA256 为 `61281bd14ad8432e508a2cfeeabeb100cf1fcdfd386e824c41caa86b30f082e1`，CSP 副本 SHA256 为 `0d31a2dfe422f7ec45ff2152317ab41ebc9aec10ac0dd84afbe6bad3466cb4a4`，脚本字节前后一致。
- 本轮未重跑不变的 15 项原型检查/111 项生产编辑器测试；未启动 App、执行 WKWebView 运行时、真实 IME 或磁盘保存。

后续接入 005/006 后，管理者实际复跑：原型构建/严格类型与21项检查通过；以本工作区审计后样稿运行crossval，02/10三条变体的字节与状态检查通过；selection-check 15项通过。09目前crossval只证明字节，选区接线尚未完成。06/11的旧driver仍使用审计前动作，不能作为审计后矩阵的结论；03仍无法载入，05仍失败。

接入后重新构建宿主，`make ... verify` exit 0，Info/manifest基线均为 `7fe11b36c0981f2d57d9866320702a966c47866a`；源HTML SHA为 `488084aefabf4c4ae082daefe1d2ad2d339541edcc5617ed5b4ee25363a2a4b4`，副本SHA为 `17ce89bca22c690030fb5239234609846346bcbf4a11d666b0cc098776a48198`，脚本字节相同。以上替代首轮82731d2的旧资源构建记录，仍未运行App。

## 接入顺序与剩余工作

1. 005 已接入并复跑02/10。仍有行内公式/普通文本两个美元符号被过度保守阻断的问题；本次局部门槛通过不表示通用语法边界完成。
2. 006 已接入并复跑15项模块检查。010负责与 model/main 的源码往返、选区及跨模式历史集成；映射失败必须保留草稿/可信选区，不采用006文档中“失败重置”的建议。
3. 用审计后样稿重放真实用户动作，记录字节、模式、选区、dirty、revision、Undo/Redo 与保存状态。旧 crossval 报告基于旧样稿，不能直接沿用为新矩阵。
4. 引用链接/图片混排、marks/attrs、结构拆分合并、混合 EOL、composition 历史分组等缺口仍需修正或比较替代架构，不能缩减 M0 判据。
5. 重建最新 HTML 后再构建宿主，核对版本与 hash，取得 UI 锁/preflight 后安排真实 WKWebView、系统中文 IME、光标选区与撤销验收。该宿主无 NSDocument，不证明生产磁盘保存。

009从集成提交7c497a7独立修正引用链接/图片混排；010从7fe11b3集成选区。两者可能在model/main交叠，接收时需按语义处理冲突并复跑组合场景，不能直接覆盖一方。

总门槛未通过。不得据本工作区已合并、构建成功或样稿数据检查通过关闭 M0、锁定架构或宣告 M1 可交付。
