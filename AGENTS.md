# Inkora Agent 协作规范

- 沟通与文档使用中文；代码标识符、提交信息使用英文 Conventional Commits（subject ≤72 字符）。
- 每个任务在独立 worktree / 分支 `task/<TASK-ID>-<slug>` 上进行，只改任务范围内的文件。
- 任务完成必须回报：完成内容、修改文件、测试/构建命令及结果、未完成事项、风险、分支与 commit。
- "代码已写"不等于完成；未实际运行的测试必须如实说明。
- 不得删除或绕过有效测试；不得引入未在任务中说明的依赖。
- 编辑器核心原则：Markdown 文件保真优先；不得破坏中文输入法 composition、光标、选区、撤销重做。
- 平台：macOS 14+，App Sandbox；不访问网络（AI 模块除外，且须与编辑器解耦）。
- 统一入口：`make setup` / `make lint` / `make test` / `make run`。
