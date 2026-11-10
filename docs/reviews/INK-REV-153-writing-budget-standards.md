# Standards

固定审查 `aef514c501cb33eb10cac121d300b67374c462a5...9bd139681a52c9d801158a0c4f9b899c91d263ee`。未发现有证据成立的书面规范背离；不代表完整验收通过。

保存新 hunk（`tests/InkoraTests/PerformanceWebViewTests.swift:197–217`）走真实 save，并核对 dirty、revision、磁盘字节，符合 `docs/document-save.md:7–13`、Bridge revision 不变量6及 ADR-0004。runner 新 hunk（`scripts/perf/run-safe-save-151.sh:9–15`）归档旧结果，符合 `docs/performance.md:16` 的运行隔离要求。

Possible，非硬违规：共享工作流在 `PerformanceWebViewTests.swift:112–132、197` 多次按 measureSave 分类，接近 Repeated Switches；若再扩展工作流，可提取保存夹具及动作。目前仅两种明确测试路径、共享主体避免重复，按仓库范围约束不要求本轮改动。其余 Fowler 项未见足以报告的新 hunk。

正式预算、paint、VoiceOver/Sandbox 仍未验，不能据后台采样宣告整体完成。
