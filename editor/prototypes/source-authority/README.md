# INK-PROT-030 原文权威与可编辑投影原型

这是一个隔离、可丢弃的 LOGIC 原型，用于回答冻结契约中的单一问题：保留现有
ProseMirror、parser、schema、source ledger 和受保护原文片段时，能否让每个已接受编辑立即进入
唯一当前原文，并让 Save、主动源码、scratch 重开、选区与历史使用同一权威？它不是生产迁移、
ADR 或 M0 通过结论。

## 边界

- `currentRaw`：唯一公开内容权威。已接受的视觉或源码编辑在同一控制器事务内立即更新它。
- semantic parse：`currentRaw` 的派生解释，不反向序列化覆盖原文。
- editable projection：真实 `EditorState` 加 raw span、显式 affinity、projection anchor 和 provenance。
  单尾随空格与空段可在语义 parser 隐藏时继续由原文和 anchor 持有。
- session：原文/可视选区、源码草稿、composition 分组、诊断、Undo/Redo 与 epoch。
- `savedRaw`：最后成功的内存保存点。`documentDirty` 只比较 `currentRaw !== savedRaw`；未提交源码
  草稿单独形成 `draftDirty`。

Save 不重建投影、不移动选区、不推进版本，也不增加 Undo。scratch 重开读取相同 UTF-8 字节、
创建新 epoch 并清空旅行历史；测试显式给出 raw caret，再验证它已落入真实 EditorView selection。

## 复用与新增

只读复用：

- `editor/prototypes/fidelity/model.ts` 的锁定 parser/schema；
- `editor/prototypes/fidelity/source-ledger.ts` 的词法归属与双向映射；
- `editor/prototypes/fidelity/native-transaction.ts` 的局部原文补丁规划；
- 生产 `editor/src` 下被上述模块引用的 schema、codec 与安全分析。

新增核心在 `core.ts`，不读取 DOM。`main.ts` 只负责 EditorView、按键、textarea 与状态面板。
`window.fidelityPrototype` 只是现 native-host observer 可读取的兼容适配，所有字段均来自同一个
`SourceAuthorityController`；没有实例化旧 `FidelityModel` 作为第二真值。

## 运行

从仓库根目录执行：

```sh
make -C editor/prototypes/source-authority test
```

入口会使用主仓锁定的 pnpm/node_modules；若当前 worktree 缺少 `editor/node_modules`，Makefile 仅在
命令期间建立临时链接并在退出时删除，不安装依赖。

重新生成单文件离线产物：

```sh
make -C editor/prototypes/source-authority build
```

随后可双击 `PROTOTYPE.html`。页面提供真实 PM 自由编辑、主动源码、当前原文/保存点/投影/
选区/history/资格面板，以及冻结主链按钮。

## 有界声明

- `# ` 在此原型中自然形成空 ATX heading，自动层逐项证明字节、语义投影、选区和历史；这不是
  完整 Markdown 输入规则承诺。
- 保护片段内部编辑、过期事务、BOM 前位置、CRLF/surrogate/grapheme 内部边界仍明确拒绝，
  并保留诊断/未解决意图。
- 原型只为冻结 oracle 覆盖的常见结构建立投影关系；没有推广为完整 Markdown 投影代数。

结果与证据分层见 [RESULTS.md](RESULTS.md)。
