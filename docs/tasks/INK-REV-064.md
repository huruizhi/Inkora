# INK-REV-064：本地图片 Standards 独立审查

- 分支：`task/INK-REV-064-local-images-standards`
- 基线：7d20ed4da76acc65d3e02d356fa1ea886cf4f308；被审 HEAD：056f74faf51788a05b67051ade8623be9f7ffbbf（单 commit，36 文件 +4666/-71）
- 范围：仅书面标准 + Fowler smell 静态审查；不做 Spec、不修产品、不开 PR。

## 完成内容

1. 核实两 ref、初始 clean、diff 非空、commit list 完整（仅 056f74f）。
2. 全文阅读全部书面标准；确认仓库无 CODING_STANDARDS.md / CONTRIBUTING.md（缺失已记录）。
3. 逐文件审查 diff：Swift（BridgeProtocol/EditorBridge/EditorViewController/InkoraDocument/AssetBookmarkStore/DocumentAssetBroker/LocalImageStore/LocalImageMigration）与 Web（bridge.ts/image-view.ts/editor-runtime/main/schema/markdown-codec/source-*），对照 bridge-protocol、save-barrier、V4 规格、AGENTS、markdown-support、testing。
4. 产出报告 `docs/reviews/INK-REV-064-local-images-standards.md`：硬违规 0；smell 4 项（均 judgement，含代码引用）。

## 修改文件

- docs/reviews/INK-REV-064-local-images-standards.md（新增）
- docs/tasks/INK-REV-064.md（本文件）

## 实跑 / 未跑

- 实跑：`git rev-parse`、`git status --porcelain`、`git diff`（唯一 diff 命令）、`ls`/`find`（标准文件存在性）。
- 未跑：全部测试、lint、构建（本轴仅静态证据；作者候选证据未转称己方执行）。无 GUI/网络/依赖安装。

## 未完成事项 / 风险

- 无未完成审查项。用户物理验收（真实 Sandbox 面板、拖放、IME、关闭重开）属后续集中验收，不计为违规。
- smell 仅为 judgement 建议，不阻塞合并。

## Commit

见当前分支 HEAD；已推送 origin 同名分支并核实远端 SHA 一致。
