# INK-REL-146：新版本地预览候选管理

基线c48d717（PR #89已合并、正式安装与双层回收完成）。当前GitHub唯一预发布仍为v0.1.0-beta.1，固定e123772、build3，资产2026-11-10发布；已通过实际API核对，不能把后续UI安装更新冒称公开资产已更新。

用户暂无新的优先级答复时，先按已说明推荐顺序准备新版候选。具体实施见`docs/design/preview-beta2-candidate.md`。本任务只管理本地准备、来源/版本/机器检查及最终CI，不把旧一次发布例外扩大为新版发布授权，不覆盖beta.1。

此前PR #89本地与CI811 editor/214 Native/双侧Bridge16及隐藏WK证据有精确提交边界；性能light有7项相对旧baseline的warn，未写成正式性能预算通过。真实paint、人工AX、系统授权与干净用户Gatekeeper仍无新证据，既有已取消的macOS14专项与重复物理IME不复做。整个目标保持active，不因准备候选而缩小或宣布完成。
