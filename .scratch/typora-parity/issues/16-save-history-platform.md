# 核实原文件自动保存与版本历史的平台方案

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: INK-RES-002
Blocked by: None
Parent: ../map.md

## Question

macOS 14+ App Sandbox下，系统文档自动保存/版本API及自建本地检查点各有什么真实保证与限制？怎样与Inkora的异步编辑快照、外部修改检查、恢复草稿及旁置托管图片共存，并支持离线浏览/比较/恢复和有界存储？

## Resolution criteria

- 查本次最新生产代码与Apple一手资料，固定代码提交、来源链接和系统版本；区分已文档化事实、代码现状、待原型及推荐，不用普通非Sandbox读写证明系统版本能力。
- 对比至少系统管理与应用管理两条路线：保存前后回调/失败、文件系统或位置不支持版本时行为、首次保存/另存/移动/外部修改、版本资源依赖、容量/保留/清理所有权与卸载/迁移。
- 指出哪些API事实可以研究确认，哪些需要独立签名Sandbox和实际文件位置实验；缺少平台环境保留未执行，不凭部署目标认定macOS 14通过。
- 产出独立研究分支与事实表、最小实验问题和方案取舍，供后续选型决策票；不直接启用autosavesInPlace、不修改用户原件或生产代码，不把研究推荐当实现已完成。

产品职责与默认行为以[保存与历史边界](09-autosave-history.md)为输入。本研究解决实现方案事实，不重复向用户索取已授权的常规产品选择。

## Execution

已交给 Paseo 的 INK-RES-002，在固定生产基线 `36e636578798510d240b23520122c88578cf3fe5` 上独立研究。仅新增 `docs/research/INK-RES-002-save-history-platform.md`，不改产品、不启用自动保存、不执行真实用户文件或桌面操作。具体 host、Agent、workspace 及模型记录见[调度记录](../execution/M0-dispatch.md)。领取不代表研究完成或平台能力已验证。

## Answer

接收固定研究提交 [`3fad2d05591966aa0d8d2301426bc80c98b2b301`](https://github.com/huruizhi/Inkora/blob/3fad2d05591966aa0d8d2301426bc80c98b2b301/docs/research/INK-RES-002-save-history-platform.md)，研究分支保留，不合并入产品。管理者核对代码与Apple官方DocC正文，首稿遗漏系统浏览器已退回修正；最后文件仅研究Markdown，diff检查通过、远端一致且干净。Agent已归档，实际平台实验未执行。

- AppKit的`browseVersions(_:)`提供系统Versions浏览器；`preservesVersions`默认跟随`autosavesInPlace`，false会禁用版本浏览及revert；false/true组合是Apple明确的未定义行为。系统UI属于可验证的候选，不能把它误列为不存在，也不代表Inkora当前已适配。
- 当前生产基线36e6365的`autosavesInPlace`为false、没有覆盖`preservesVersions`。保存通过异步快照后调用`super.save`，只有成功回调确认对应保存点；恢复草稿独立存储。以上是代码事实，不是本次运行验收。
- `save`与`writeSafely`有主文档安全写及回调契约；不能外推Markdown和旁置资源具有同一原子事务。未取得任意位置的历史可用性、应用可设系统总容量、旁置图片自动版本化、跨卸载/迁移及离线恢复的普遍保证，均保留未知。
- 自建检查点可以明确字节/资源关联及保留策略，同时承担索引损坏、写中断、配额清理、访问权限和迁移责任。系统、自建或混合路线尚未选定；不因研究方便而直接锁定混合架构。
- 后续选型需按研究中六组签名Sandbox实验核实：配置/保存失败、首次保存及移动、外部并发、版本可读和恢复、资源与清理、检查点中断和容量。只在scratch及明确授权位置测试，记录OS/签名/卷、字节与错误。macOS14最低系统证据仍缺。

本票完成平台事实整理及实验问题，不启用自动保存，不替代M0或后续文件工作流阶段的实现/运行验收。后续阶段分组仍由08统一处理，09既定产品政策保持有效。
