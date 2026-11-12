# INK-FIX-190：标题光标、原生中文候选与列表连续输入

用户在本机build10报告：输入#光标显示在前，中文首字母重复；随后补充列表无法回车或删除、单独减号不应先变列表、空格后才转换。
固定基线3dac317feef5c3850c245c3b1ba634cfad6a58eb（与build10仅版本及安装文档差异）。
独立分支task/INK-FIX-190-heading-ime-caret；不占正式文档，不自动替换当前运行App。

## 规格与路径

- 标题输入态保留灰色原始前缀；为空内容保留独立前缀宽度，回车仍按174规格呈现标题。
- 原生WK NSTextInputClient.setMarkedText连续d→du，再insertText确认读，不得产生ddu或残留拼音。
- 普通段落、裸#、完成分隔空格的一级/二级标题与列表均验证；取消、一次Undo/Redo与原字节保留。
- 在可视连续输入中，单独的-、+、*保持文字，输入空格才成列表；打开已有Markdown仍按正式解析，不改文件语法。
- 列表回车继续项目；空项目回车/退格能退出；普通删除、任务复选框、源码范围/历史仍有效。
- 只修已证明的原文位置与呈现，不放宽未知事务或组合输入跨owner拒绝规则。

公开参考[Typora Markdown Reference](https://support.typora.io/Markdown-Reference/#lists)规定标记加空格的列表写法；触发时点以用户截图为直接要求。
无Typora源码访问，不将公开行为描述成其内部实现。未做物理输入法/VoiceOver/paint/macOS14实机验收。

## 实际反馈

新增真实原生文本输入接口回路，普通段落du、标题ddu→d读稳定成立；不同于既有手工CompositionEvent夹具。
trace显示首个d触发有界语义重投影，移除原先被留在正文的标题分隔空格，Native候选范围失效。
提前将空ATX分隔空格归回前缀的单变量候选修复ddu；扩大确认测试后继续发现收尾路径，尚在收敛，不能提前宣告通过。

空标题初始DOM Range/Native firstRect在不可见窗口返回全零，初始光标几何断言为无效夹具，已保留probe日志并改为独立前缀留宽布局检查。
该检查不证明物理光标绘制；没有把全零矩形误称产品坐标。新增directedSelection断言初次错用anchor/head字段，已修为公开selectionAnchor/selectionHead，不删有效断言。

列表公共runtime先红：单独-已是UL；支持文字前缀投影后InputRule转换暴露旧边界anchor仍绑新空label。
根据同次empty-list-item插入span收回旧已消费前缀边界，任务复选框与连续Enter/Backspace回归恢复；仍保留负控制。
完整结果、文件与实际命令在固定交付后追加。所有原始输出保留ignored artifacts/INK-FIX-190与/tmp对应日志，不清历史失败。

## 候选方案结算与最终回归

单纯将灰标记绝对定位/移出文本流，会令原生deleteCompositionText删掉整个heading外壳，形成不支持的整块replace；该候选放弃，未放宽replace接受规则。
最终使用PM正式Decoration.widget(side:-1)承载不可编辑且aria-hidden的空span，灰标记仅由span伪元素显示，无正文Text/复制污染；光标由PM明确放到widget之后。保留输入期正文大小与回车渲染。没有运行期测量或硬编码前缀宽度。

扩大Native用例覆盖普通段落、裸#、#空格、##双空格、列表；真实原生setMarkedText d→du、insertText读后一次Undo/Redo精确还原。新h2测试初版选择器仅覆盖h1，改为实际h1/h2/p；不将null选择器当产品缺陷。
25项Native/WK候选全部通过，125项定向DOM通过。恢复代码块既有position:relative（局部CSS探索时误删，最终diff只含标题标记样式）。正式全量检查及固定commit另记。

## 固定产品与本地检查

产品c22e6841a3b5c69197a0556cfe457bd3dcdbb081。最终 `make lint test-editor test-ci` 退出0：
55文件1029项通过，TypeScript/Vite与Swift严格格式、CI脚本回归通过，仅保留已有chunk/Swift隔离警告。
`INKORA_WRITING_ARTIFACTS_DIR=artifacts/INK-FIX-190/final tests/InkoraTests/WritingInteractionHostless.sh`
最终25/25、0失败，原22项全保留，新增灰标记后真实DOM选区/不可编辑装饰，原生d→du→读含五场景和Undo/Redo，列表空格触发/连续Enter与Backspace。

修改文件：heading-entry及CSS、source-authority有界字节/前缀位置证明；两既有runtime测试文件、既有Native写作测试和脚本计数，任务与同域证据。无依赖/Schema/Bridge/Native产品/用户文档/输入法设置变更。

JSON evidence无损保留终端输出与SHA256；所有红例、夹具错误、放弃方案和中间产物另留ignored目录，不删有效断言。
独立双轴审查和最终精确HEAD CI后续记录。用户已请求本机修复路径，先等保存退出与最终验证才替换。
截至此记录本机仍build10，未宣告安装完成。物理搜狗输入、可见paint、VoiceOver、macOS14实机未验；原生接口回路不等同物理IME操作。
