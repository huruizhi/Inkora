# INK-M1-060 首两个切片的红绿证据

生产基线为056最终9e16950。此记录不覆盖尚未实现的替换。

| 真实接缝/命令（锁定pnpm） | 修前结果 | 当前结果 |
| --- | --- | --- |
| `--dir editor exec vitest run src/main.test.ts -t '可视查找仅计'` | 1 failed：期望3处可编辑内容，得到6处（href/title/info被误计） | 1 passed；另核对每个高亮摘要为alpha、模式切换3→6→3、零Bridge改动 |
| `--dir editor exec vitest run src/main.test.ts -t '可视查找按位置'` | 1 failed：期望2个可定位按钮，实际0 | 1 passed；第二处同文、query持焦、源码精确选区与零Bridge改动 |
| `--dir editor exec vitest run src/visual-search-runtime.test.ts` | 新范围控制 | 16 passed；14个冻结input预期计数与2个结构/位置控制，不代表expected替换文件通过 |
| `--dir editor test` | 056为459项 | 当前477 passed/0 failed，26文件，包含Bridge |

结果来自production main、SearchPanel、runtime与EditorView，不读取工具栏DOM作为可搜索内容。jsdom几何桩只让PM事务运行，不是实际滚动可见证据。fixture的原始input/expected/manifest未修改；标准库132检查只证明oracle完整。
