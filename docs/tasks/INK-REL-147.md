# INK-REL-147：Beta2 本地候选准备

固定基线 2f7a9a226769bf9d34d3266c374ecb8764f588ea。独占 project.yml build3→4、CHANGELOG、新 Beta2 说明与自身证据；不修改产品逻辑、脚本校验或旧 Beta1。

先提交版本/说明源，再执行既有 make release-dry-run、make lint test-ci。候选与原 dry-run 输出保留至管理者独立审查和双备份。精确最终 HEAD 默认 CI pending，完整 editor/Native/默认CI由管理者集中结算。

没有公开发布授权，不启动或安装 App，不执行桌面/物理专项。不将结构检查视为 Developer ID、公证、Gatekeeper 或完整体验通过。
