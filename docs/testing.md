# 构建、测试与 CI 入口

本地与 GitHub Actions 使用同一组 Make 目标。测试本身不得读取用户目录、个人配置或公网；`make setup` 仅负责安装和解析开发依赖。

## 命令

| 命令 | 作用 |
| --- | --- |
| `make test-editor` | textarea editor kernel 行为测试 |
| `make test-bridge` | TypeScript + Swift Bridge v1 contract tests |
| `make test-native` | 全部 XCTest 单元与 WKWebView 集成测试 |
| `make test-ui` | 无辅助功能权限依赖的 Debug App 启动烟测；CI 通过 `INKORA_CAPTURE_SCREEN=1` 尽力截图 |
| `make test-ci` | 验证命令包装器的成功/失败与快照归档路径 |
| `make test-all` / `make test` | 按层运行全部测试 |
| `make build-release` | 构建 Release App，不配置正式签名凭据 |

## 固定产物目录

所有诊断产物位于被 Git 忽略的 `artifacts/`：

- `logs/`：每个入口的完整 stdout/stderr；
- `failures/`：失败状态码与 Markdown 摘要；
- `test-results/`：XCTest `.xcresult`，包含测试日志和 attachments；
- `screenshots/`：UI launch smoke 在系统允许时生成的 PNG；
- `markdown-snapshots/`：失败测试通过 `INKORA_MARKDOWN_SNAPSHOT_SOURCE` 提供的 Markdown 原文。

CI 无论成功失败都会上传整个目录，保留 14 天。正式签名、公证和凭据不属于本流程。
