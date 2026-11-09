# INK-M1-060 首两个切片的红绿证据

生产基线为056最终9e16950。此记录仅覆盖最初查询/定位切片，后续替换结果见任务记录，不能由本表推出完整V6通过。

| 真实接缝/命令（锁定pnpm） | 修前结果 | 当前结果 |
| --- | --- | --- |
| `--dir editor exec vitest run src/main.test.ts -t '可视查找仅计'` | 1 failed：期望3处可编辑内容，得到6处（href/title/info被误计） | 1 passed；另核对每个高亮摘要为alpha、模式切换3→6→3、零Bridge改动 |
| `--dir editor exec vitest run src/main.test.ts -t '可视查找按位置'` | 1 failed：期望2个可定位按钮，实际0 | 1 passed；第二处同文、query持焦、源码精确选区与零Bridge改动 |
| `--dir editor exec vitest run src/visual-search-runtime.test.ts` | 新范围控制 | 16 passed；14个冻结input预期计数与2个结构/位置控制，不代表expected替换文件通过 |
| `--dir editor test` | 056为459项 | 当前477 passed/0 failed，26文件，包含Bridge |

结果来自production main、SearchPanel、runtime与EditorView，不读取工具栏DOM作为可搜索内容。jsdom几何桩只让PM事务运行，不是实际滚动可见证据。fixture的原始input/expected/manifest未修改；标准库132检查只证明oracle完整。

后续补查原生鼠标激活：程序化 `.click()` 本身不会证明真实 pointerdown 的默认焦点行为。新增同一真实面板用例的 pointerdown 断言先红（defaultPrevented=false），再让结果/上一处/下一处按钮阻止默认夺焦；键盘导航与composition守卫不改。补正后main/panel/runtime三文件101项通过；仍不据此冒称真实WK焦点和滚动验收。
