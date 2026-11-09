# INK-REV-073：V6 Spec 独立审查

## 范围

- 固定起点：`0edb13d59532cd19a0fb7afa71e2aab7cf6573a4`
- 受检 HEAD：`c0b375670a2dedc3df998f3377d398d09f5357e8`
- 分支：`task/INK-REV-073-visual-replacement-spec`
- 仅审查 V6 正式契约与冻结 14 例；未读取另一审查轴结论，未修改产品、冻结资料、依赖或权限。

## 结论

发现 2 项可行动 Spec 缺口：旧 epoch 结果可越过 runtime 边界执行；合法嵌套 strong/em 内容可搜索但不可替换。未发现 scope creep。详见 `docs/reviews/INK-REV-073-v6-spec.md`。

## 实际执行

- 核对固定 refs、HEAD、分支、clean、15 个原始 commit 与非空三点 diff：通过。
- 完整阅读指定领域文档、V6、manifest 与 14 组 input/expected 原件，并核对冻结 SHA/字节。
- 临时借用主仓 `node_modules`，运行单文件生产 runtime Vitest 探针：2 tests / 2 failed，分别复现上述两项缺口；临时测试和链接已清理。
- 用仓库锁定的 `markdown-it` CommonMark 模式核对嵌套 marks：输出 `<strong>alpha <em>omega</em></strong>`。
- 未运行全量 editor、lint、build、Native 或 UI；根审查者的 552 项、lint/build 结果不转称为本审查执行。默认 CI `42630358139` 状态由根审查者继续核对。

## 风险与未完成

- 未做 GUI、App、CUA、browser、XCUITest、系统面板、输入源、用户文件或 clipboard 操作。
- 真实 WK/IME/NSDocument/最低 macOS 仍待用户后续物理验收。
