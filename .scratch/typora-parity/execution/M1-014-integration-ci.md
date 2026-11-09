# INK-M1-014：写作辅助集成与默认 CI

固定基线main 36e636578798510d240b23520122c88578cf3fe5，产品最终0f17f22，集成受检SHA **6ad325b41d74f270f6b8fd20e615259982f9a4f7**。本地 `.worktrees/INK-M1-014` / task/INK-M1-014-writing-tools-integration，包含001/002纯模块、大纲/统计/标题定位、查找面板、源码/只读导航和可编辑源码原子替换。没有实验内核、依赖或Swift/Bridge协议迁移。

管理者独立19根控制、干净303项、lint/build、main dot44项TypeError=0通过；隔离com.huruizhi.Inkora.WritingToolsReview App构建/严格签名校验成功。预检exit78锁屏，真实窗口未启动；UI门槛、M0/M1状态不变。42个完成受管workspace已备份回收，当前无执行Agent；本地集成目录保留。

## 草稿与运行

- 草稿PR：[70](https://github.com/huruizhi/Inkora/pull/70)，已核实draft=true、merged=false、head=6ad325b，尚未合并。正文按pr skill格式记录范围/证据/回退及明确UI未验与受影响套件。
- GitHub连接器可建PR，但无workflow dispatch能力；使用现有已认证gh CLI执行 `gh workflow run CI --ref task/INK-M1-014-writing-tools-integration -f ui-tests=false -f full-bench=false`，成功返回运行链接。
- 默认非UI CI：[42568188093](https://github.com/huruizhi/Inkora/actions/runs/42568188093)，当前已触发，最终结论待实际检查；不把dispatch成功当作CI通过。
- 不在受检分支追加运行状态提交，以免改变受检SHA；后续结论写本记录及PR。CI不包含真实UI/完整启动基准，不能替代滚动、候选窗、键盘、VoiceOver或最低系统实机证据。
