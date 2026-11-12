# INK-REV-192：Spec 独立审查

固定受审 HEAD `c22e6841a3b5c69197a0556cfe457bd3dcdbb081`，base `3dac317feef5c3850c245c3b1ba634cfad6a58eb`。审查范围为两者三点 diff，单提交 `c22e684 fix(editor): preserve native IME ranges and list prefix input`。只审不修。

## Finding

**P2 / implemented wrong：裸列表标记后回车遭拒绝，保存资格失效。**

规格 `docs/tasks/INK-FIX-190.md:12`：“单独的-、+、*保持文字，输入空格才成列表”；第13行要求连续输入及删除有效。新增 `editor/src/source-authority.ts:182–191` 的 pendingBullet 文字投影没有覆盖其后拆段：空文档经公共 handleTextInput 输入 `-`，再派发 Enter，PM 合法目标是含 `-` 的段落加空段落，实际原文仍为 `-`，`unresolved=true`、`saveEligible=false`，诊断为“parser 与 PM 事务的语义差异没有共享字节/意图契约，已原子拒绝”。`+`、`*` 同样失败。应延续已证明的文字投影并保留 Enter 原文/历史，不能靠放宽未知事务拒绝规则解决。

未发现额外 scope creep；未将未验项目推断为实现缺失。

## 独立证据与边界

- 冻结版本三个既有文件 heading-entry-runtime、heading-composition-runtime、list-input-runtime：109项通过。
- 自建 v2 公共 runtime 探针：裸标记 Enter 3项失败；显式普通 PM 删除3项通过。base归档 Enter控制3项通过（旧版为列表，仅证明没有同样的 unresolved，不代表符合新文字规格）。
- 首版 Backspace仅派发键盘事件，jsdom不执行浏览器默认删除，3个失败属夹具不足；原探针/输出保留，不算产品缺陷。后验 trace确认 Enter实际派发合法 replace 拆段步骤。
- 作者125项DOM/25项Native及根其他结果均为外部证据。本审未运行Native、App、物理IME、可见光标绘制、VoiceOver或macOS14验收。
- ignored `artifacts/INK-REV-192/` 与 `editor/artifacts/INK-REV-192/` 保留探针、base冻结副本和原始输出。产品文件与有效测试未修改。
