# V2 冻结输入与预期

来源：仓库canonical `docs/markdown-support.md` 的SYN-D/U、FID、ENC与EOL规则，以及096公共反例。JSON是实施前独立literal预期，不由产品scanner/AST生成，不是已通过的产品结果。`oracles.sha256`绑定原始UTF-8文件（V2-009字符串内有真实BOM），后续实施不得为转绿改预期；确有规范冲突须单独说明并版本化原件。

`blockRaw`/`inlineRaw`列出文档顺序的opaque节点原始属性；不含分离的块尾EOL，不允许把行内语法所在整段作为相同范围。`edit.at`为原始字符串UTF-16偏移，预期整篇原文是独立字面量。每个动作还须验证节点类型/相邻普通正文、完整原文、保存资格、实际选区、有向历史、dirty/savepoint与源码往返；不能只比较JSON或调用扫描器。

`repairRaw`须通过公开源码草稿提交后验收；原始含混状态及修复后的Undo/Redo均要保留各自原文和保存资格。`links`用于区分较早完整外层链接与独立脚注片段，不按显示字符串猜owner。代码、转义、HTML属性/注释及front matter内部不能产生下级候选。

18项包含：096三红一绿、脚注/引用冲突、合法/非法边界、callout终止、代码与转义、HTML/comment、BOM/混合EOL、TOML合法结束与未闭合控制。表格/列表/引用容器、重复片段、部分选区、composition、图片proof、主入口及Native保存回归仍须实现任务增加公共接缝覆盖，不能称这16项等于完整canonical矩阵。

rules是覆盖规则标签（含被屏蔽的负控制），不是实际节点输出；实际opaque输出仅由blockRaw/inlineRaw声明。

完整可视删除D片段按现规范拒绝；GATE004显式源码提交保留U诊断但可保存准确原文，两项由委员会要求补入。原16例草案在evidence保留，V2-005规则编号修正也记录于设计稿。

只运行JSON解析、id唯一性、片段包含、编辑偏移与独立expectedRaw一致的标准库数据自检。首稿V2-002偏移18被数据自检拒绝，冻结前纠正为19；未把该夹具错误记为产品红例。未运行产品测试或修改旧有效fixtures。
