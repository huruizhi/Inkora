# INK-FIX-209 列表之后空段落退格与关闭

分支：`task/INK-FIX-209-list-gap-backspace`。基线：`ffacfbff386377b317348b572ff3073521a0e67e`，初始工作树clean。用户报告build16空列表后空行退格不删行，关闭报“事务 PM 6/from 映射失败：PM 6 没有可审计文本锚点”；确认由“- 空格”建列表后回车、退格产生。保留当前用户窗口，不强退、不访问用户正文，不绕过保存/关闭守卫。

## 反馈与诊断

命令：`.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/list-empty-backspace-runtime.test.ts`。最初打开“- ”回车两次再退格只重现原文字节未减少，未得到精确错误，不据此下结论；扩展16组按键矩阵，3次回车+1次退格精确得到用户PM6报错，4次回车为同类PM8；新3项回归在未修改产品时全部RED，含实际逐字输入“- ”与BOM/CRLF对照。初始矩阵/缩减/红日志保留ignored artifacts/INK-FIX-209。

在用户可见说明后验证三项假设：①结构边界误作文本端点获得支持：实际删除步骤是6..8，目标只少一个空段落，文本插入锚点为3、7、9，无PM6文本锚点；②缓存未更新不获支持：清理缓存重建的完整context逐字等同，raw长度和docSize匹配；③删除跨入列表不获支持：捕获目标doc完整保留原列表。额外回归揭示空段落旧anchor被映射到结构边界，随后CRLF删除重证失败，属于同一位置生命周期缺口。

## 实现范围

新增empty-paragraph-edit模块封装列表后EOF空段落的共享Backspace操作、局部换行补丁、完整目标doc/Selection证明与绑定落点。删除已被替代的键盘EOF分支及旧planner元数据分支；在projection-sync捷径之前证明并删除一个可视空段落对应的两个EOL，不把结构端点交给文本映射，也不全篇重序列化。保留原有末尾EOL和BOM。accept仅在有绑定的新插入点且同事务确实跨越被删空段落时退休该空段落旧anchor，不放宽其他语法affinity、含文字锚点或拒绝/回滚保护。

新增公开runtime连续旅程覆盖逐行退格、最终移除列表标记、继续输入、UndoRedo、保存资格、其他列表标记、先前格式内容、完整Selection及混入文字的拒绝。Native新增真实WK/Bridge/NSDocument Save As/字节/prepareForClose用例，原35项保留，计数36。DOM输入不是物理输入法证据。首轮Native新夹具将BOM直接当Bridge文本，实际document codec会另存BOM，已限定移除新夹具的该误断言，BOM保真仍由runtime用例检查；原失败日志完整保留。旧资源运行另出现既有标题fixture定位失败，尚未将该次整体运行记为只有目标用例失败。普通字符模拟的历史粒度与composition不同，初期两字符Undo oracle失配已保存，改用单字符X验证删除后的精确插入落点，未删除有效产品断言。

无新依赖、Schema/Bridge/Native产品变更或权限调整；版本预备build17。当前仅定向134项通过，完整回归、旧/新真实资源Native差分、构建与实际发行/安装仍待结算；不得宣告已交付。


## 同类边界检查与范围收敛

用户追问设计问题后，补查同类文末空段落：空白文档、普通段落、标题后回车两次再退格分别复现PM2/PM4结构映射失败，证明不是仅一个列表分支。加粗段落在前置EOF Enter已无法保留关闭标记并创建段落，这个反例也保留为RED，未通过移走失败测试隐藏。
因此模块范围收敛为文末paragraph的创建与删除：创建时原文插入点取已证明owner的完整语法末尾，保留加粗等关闭标记与原有EOL；删除仍只移除锚点间对应的一对EOL。键盘与Native规划共用operation，完整doc与Selection绑定。仅支持前一节点为paragraph/heading/普通或有序列表，不泛化到表格/代码块/保护原子或任意中部跨块编辑。补充原文强样式、空白、普通段落、标题和外部篡改目标选区对照，后者先RED后加严格拒绝，阻止projection-sync回落绕开绑定。

Native旧资源校准后，新增用例在snapshot、真实Save As completion和prepareForClose均输出用户同条PM6错误；同一冻结执行文件切新资源时36项通过。但旧资源运行另有既有标题焦点断言失败，明确区分并保留，不称纯净35绿+新1红。随后将同类普通段落/标题/加粗EOF旅程加入同一新增Native用例，需按最终测试源重新结算差分。


## Spec P1：原有空白行内容的限定补正

211在固定9fa528c发现P1 missing/partial：普通正文或BOM空白文档已有含space的空白行，3 Enter+Backspace仍阻断保存；基线也RED，但属于本轮EOF契约未覆盖，保留为P1而非以继承为由删掉。root新增5项正文/空白/BOM/列表/strong/标题及space-tab对照，全5项真实RED。
新模块对未修改尾部允许原有space/tab/换行；实际删除补丁仍严格只含两个EOL，原有空格/tab逐字保留。列表EOF lift的原先单EOL尾部闸门也改为明确空白尾部，并把新空段落插入点绑定在局部lift补丁末尾、原有尾部空白之前，不能继续用整个candidate.length把旧尾部吞进新插入点。此两处责任已由同一组原文+Undo/保存回归覆盖，不任意trim或重建全文。定向4文件144项通过；该P1须211基于追加固定SHA独立复验关闭。
