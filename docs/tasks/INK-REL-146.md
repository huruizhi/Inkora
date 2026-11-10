# INK-REL-146：新版本地预览候选管理

基线c48d717（PR #89已合并、正式安装与双层回收完成）。当前GitHub唯一预发布仍为v0.1.0-beta.1，固定e123772、build3，资产2026-11-10发布；已通过实际API核对，不能把后续UI安装更新冒称公开资产已更新。

用户暂无新的优先级答复时，先按已说明推荐顺序准备新版候选。具体实施见`docs/design/preview-beta2-candidate.md`。本任务只管理本地准备、来源/版本/机器检查及最终CI，不把旧一次发布例外扩大为新版发布授权，不覆盖beta.1。

此前PR #89本地与CI811 editor/214 Native/双侧Bridge16及隐藏WK证据有精确提交边界；性能light有7项相对旧baseline的warn，未写成正式性能预算通过。真实paint、人工AX、系统授权与干净用户Gatekeeper仍无新证据，既有已取消的macOS14专项与重复物理IME不复做。整个目标保持active，不因准备候选而缩小或宣布完成。

## 固定交付与独立机器核对

147先固定版本源码a5267f1325753842a868263ec26ae4b055f760b2，再运行原有dry-run；最终8f6f635仅增加证据和修正文案，app/editor/project三路径身份保持。管理者按固定三提交接入为e91bb4f、2abe54d、1e7c838；元数据候选head为1e7c8389191addf53fc7fe6e89e105dbf8be8fcb。已协调修正历史底栏/右上查找文案，当前标题行只含按需统计与侧栏开关，不把旧布局当新事实。

管理者实际复制同字节候选到本工作树artifacts/candidate，校验两包SHA256/长度、当前app/editor/project Git身份，解出ZIP并只读无浏览/noautoopen挂载DMG，分别核对0.1.0/build4、formal id/14.0、arm64+x86_64、二进制哈希、strict deep codesign、ad-hoc/runtime、精确entitlement与离线bundle。全部通过且DMG已卸载；没有启动App、安装、公证、UI/物理测试。临时脚本/命令日志在artifacts，脚本及JSON机器结果副本在docs/evidence/INK-REL-146，明确区别147作者的archive验证与根的ZIP/DMG独立核对。

新独立148 Standards/149 Spec从固定1e7c838出发，基线c48d717；尚未返回前不填通过。候选包字节固定后不重复打包；后续文档与CI须通过三路径身份关联，精确最终HEAD默认CI仍待管理者执行。现有beta.1资产与正式安装均未改变。
