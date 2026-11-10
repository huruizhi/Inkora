# INK-REV-133：侧栏 Standards 独立审查

## 任务边界与固定对象

- 工作树：`/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-133-sidebar-standards`。
- 分支：`task/INK-REV-133-sidebar-standards`。
- 受检 HEAD：`d3edf8803c661d1fb2dbebf9e8abdd826720f69d`。
- 基线：`30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53`。
- 开始时 `git status --short` 无输出；HEAD 与指定 SHA 相等；基线可解析。
- 唯一受检 diff 在初始 HEAD 执行一次：`git diff 30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53...HEAD`，输出捕获到 `/tmp/INK-REV-133-initial.diff`，之后读取该捕获，不重新计算受检 diff。
- 补丁非空，3936 行、36 文件、3314 新增/27 删除；SHA-256：`e0e3c1878b482cc5e37ba1a0122989f4e43bb0e0e1c005b0688464bfb31dcbbb`。报告提交不属于受检产品范围。

初始 `git log base..HEAD --oneline`（新到旧）：

```text
d3edf88 docs: normalize sidebar integration evidence logs
c8216b9 feat(editor): integrate titlebar and verified document navigation
5f1d7dc docs: record independent sidebar module verification
d776cc1 feat(editor): complete sidebar controls and title chrome
ced630d test(sidebar): cover authorized roots and hostless bridge lifecycle
1f797e8 fix(sidebar): retain raw BOM offsets and verified file metadata
c3b130a feat(sidebar): verify native catalog bytes and search locations
ef6c184 docs: track delegated sidebar acceptance requirements
348d757 fix(editor): guard optional sidebar message handlers
bf8f7e5 docs: specify titlebar controls and sidebar animation
466d351 chore: checkpoint sidebar work for delegated implementation
```

## 完成内容与交付文件

- 读取全部指定规范；用 `rg --files --hidden` 搜索标准文件，只有根 `AGENTS.md`，没有 `CODING_STANDARDS.md` / `CONTRIBUTING.md`。
- 核对目录授权、descriptor/原始字节边界、侧栏消息来源和代际、文档导航/保存关闭路径、composition/focus 守卫、标题及布局计时器、统计映射及测试/文档证据归属。
- 依赖清单和锁文件没有出现在捕获 diff 中；新增 Swift 仅使用系统 CryptoKit/Darwin/Foundation/WebKit，新增 TS 沿用既有模块。新增侧栏源文件搜索 `fetch/XMLHttpRequest/WebSocket/URLSession/http(s)` 无匹配；结合改动路径静态核查，未发现引入运行时网络访问。此非运行时网络隔离实验。
- 未发现删除有效测试断言的改动；既有失败样式断言被保留并修复。文档主体中文、提交 subject 为英文 Conventional Commits；格式及编译由既有工具负责，不重复列为发现。
- Fowler 12 项均按 judgement 对照；只保留有明确 hunk 的两项。未因 Bridge/主机适配的必要转发而泛判 Middle Man，未把架构要求的跨层接线泛判 Shotgun Surgery。
- 结果：[Standards 报告](../reviews/INK-REV-133-sidebar-standards.md)。S1 通过 Paseo `send_agent_prompt` 提前通知父会话 `08ef1b06-4ec0-4486-bfcf-c3dfd3e624c6`，消息 `db2654a2-91c9-4975-9935-b26bbe14f3cd` 返回 queued；不将 queued 冒称已读。
- 本任务仅新增 `docs/reviews/INK-REV-133-sidebar-standards.md`、`docs/tasks/INK-REV-133.md`，没有修改产品代码。

## 自跑验证与外部证据

实际执行并成功：`git rev-parse HEAD`、`git rev-parse --verify <base>`、`git branch --show-current`、`git status --short`、上述唯一 diff 捕获与 `test -s`、`git log <base>..HEAD --oneline`；Python 读取捕获文件计算文件数、增删行数、SHA-256 和依赖清单命中集合（空）；`rg`/`nl` 源级取证。`rg` 无匹配按搜索结果处理，不冒称产品测试通过。

未执行 `make setup/lint/test/run`，未执行产品单测或构建。原因：这是只新增报告的静态审查，发现无需运行反例即可核对；根会话负责最终组合门禁，本任务按指令不重复全量验证。没有安装依赖、借用 symlink、创建 Agent/PR/Issue、merge、启动 GUI/App/CUA/浏览器/XCU、展示系统面板或执行物理输入。

130/131/132 任务文档、evidence 下的失败/成功日志以及129验收矩阵均来自外部作者或集成者；未独立重跑，其数量和结论没有成为此次通过证明。产品尚未合 main，本任务无产品整体验收结论。

## 未完成事项、风险与交付身份

- S1 待父会话裁定并由实现任务处理；S2/S3 为可选维护建议。本审查不修代码、不补写协议例外来消除问题。
- 静态审查不证明真实 Sandbox、系统窗口、输入法、动画及发布行为；相同文档/revision/raw 校验存在，并不能等价于已满足正式消息协议。
- 提交采用 `docs: record sidebar standards review`；完整 commit SHA 由最终回报提供（避免文档自引用提交 SHA）。提交后 push 同名分支，并独立核对远端 ref 与 HEAD 相等、工作树 clean。
- 保留工作树作为验收备份，未回收。

## Post-fix 独立复审（2026-11-11）

### 冻结对象与工作方式

本轮开始 `HEAD=3e6aaf4dffcb63679f32ce2f4da9ed90015d60d9`，工作区 clean。首稿全部保留，本轮只追加原两份文档。

- 固定产品：`caab97a9b3a03bf2dbc6bcecf66d27d201eccd87`。
- 修正比较起点：`d3edf8803c661d1fb2dbebf9e8abdd826720f69d`；主基线：`30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53`。
- 实跑 `git archive caab97a9b3a03bf2dbc6bcecf66d27d201eccd87 | tar -x -C artifacts/INK-REV-133-postfix/frozen`，其后产品读取与探针编译均针对该副本；没有读取或修改动态根的产品实现。
- 实跑固定端点 `git diff d3edf8803c661d1fb2dbebf9e8abdd826720f69d caab97a9b3a03bf2dbc6bcecf66d27d201eccd87`，捕获到 `artifacts/INK-REV-133-postfix/product.diff`，57文件；SHA-256 `b40f7061644705aca5457afc89c871461d1d0b24396f89ab94fc46ec26e352a6`。不是以报告提交后的 HEAD 作为产品端点。
- 对 Swift 协议/EditorBridge/Controller/Catalog/WorkspaceBridge、TS bridge/main/connection 及两份协议文档，共10文件计算 Git blob ID，与固定 SHA 的对象 ID 逐一比较一致。
- 核对新增实现仅用既有依赖/系统框架；没有依赖安装、清单或锁文件修改，没有加入运行时网络路径。仍只审 Standards 轴。

### 有限自跑验证

产物均在本工作树 ignored 的 `artifacts/INK-REV-133-postfix/probes/`，不纳入产品或提交：

1. Web 公共协议与取消反例：`node artifacts/INK-REV-133-postfix/probes/protocol.mjs`，退出0，`web.log` 保留最终输出。Bridge session 直接导入冻结 `bridge.ts`；connection 使用冻结文件编译结果。验证正文 text/raw 夹带和非法范围拒绝、重复 requestID 不再次执行、同 doc/revision 的旧 accepted loadID 拒绝、sourceChoice 与拒绝回执关联、呈现不改变前后 queryState 状态；完成搜索与 pending open 同时出现在取消目标中，取消回执与迟到旧结果不重绘列表/结果。
2. 有限转译命令（退出0，`tsc.log` 无诊断）：

```sh
node /Users/rayhu/Documents/projects/Inkora/editor/node_modules/typescript/bin/tsc --ignoreConfig --target ES2022 --module commonjs --lib ES2022,DOM,DOM.Iterable --outDir artifacts/INK-REV-133-postfix/probes/compiled artifacts/INK-REV-133-postfix/frozen/editor/src/bridge.ts artifacts/INK-REV-133-postfix/frozen/editor/src/sidebar-connection.ts
```

上述绝对路径仅借用已安装编译器；产品输入全部为 archive 副本，没有借用动态根产品模块，没有创建依赖 symlink。

3. Native 有限探针：

```sh
xcrun swiftc -swift-version 6 artifacts/INK-REV-133-postfix/frozen/app/Sources/BridgeProtocol.swift artifacts/INK-REV-133-postfix/frozen/app/Sources/SidebarCatalog.swift artifacts/INK-REV-133-postfix/frozen/app/Sources/SidebarWorkspaceBridge.swift artifacts/INK-REV-133-postfix/probes/NativeProbe.swift -o artifacts/INK-REV-133-postfix/probes/native-probe
artifacts/INK-REV-133-postfix/probes/native-probe
```

编译与执行均退出0（`native-compile.log`/`native.log`）。真实冻结实现只替代外部 scheme 常量，不替代协议/搜索/票据逻辑。Foundation 验证合法范围及正文/空 load/负数/不安全整数拒绝；真实临时目录产生完成搜索与导航票据，取消精确目标后票据重验失败，发起新搜索后迟到旧取消返回两个 false。未创建 WebView、NSWindow、App 或系统面板；security scope 使用临时目录、不模拟真实授权成功。

初次 Web 探针遇到三次工具链启动失败：Node26 不支持 `--experimental-transform-types`、strip-only 不支持 parameter property、`stripTypeScriptTypes` 不支持 transform mode。它们发生在探针加载阶段，不是产品 red；改用既有 TypeScript 编译器后执行真实冻结源文件成功，未放宽断言或修改冻结实现。

### 结果、外部证据与限制

- S1 原完整 raw 独立入口已关闭；正式命令/回执/accepted loadID 在双侧实现，不仅是书面声明。目录 UI 限定例外与标题/选区正式通道边界明确。
- Native EditorBridge request timeout、跨 load 清理和精确回执匹配是本轮源码核查；未独立执行其整个异步生命周期。范围导航的输入状态守卫在 `main.ts:459–469,480–484`；标题分支只更新文字和 UI 标记，不改模式、焦点、选区或内容。协议240行将多类校验合并叙述，本轮按234行标题纯元数据与235行范围语义区分适用检查，不把不涉及选区的标题更新解释为编辑事务。
- A/B 的 targetSearchRequestID/targetOpenRequestID 实现与公开取消协议相符；原 S2/S3 非阻断 judgement 保留。本轮未发现新硬违规；详细位置及规则引用在报告追加节。
- 固定副本135证据索引、130取消日志为外部历史证据；没有当作本审查自跑。父会话同时负责 `make lint`、`make test-non-ui`、`make release-bundle-check`，本任务既未运行也未断言其本轮结果。
- 没有全量 Native/Release/CI/GUI/App/窗口/面板/浏览器/新Agent。未修产品、未改其他 worktree；只追加两份文档。未发现需提前阻断父会话的新硬问题。
- 本轮提交 subject：`docs: append frozen sidebar standards re-review`；完整 SHA 与远端/clean 核验结果由最终回报提供，工作树及 ignored 冻结副本保留待两层备份回收。
