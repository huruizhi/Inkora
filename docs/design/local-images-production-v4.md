# V4：本地图片与资源保存闭环

状态：生产实施规格。起点 b80a968268dde1eb03bacc1f561dc14f269a2294，依赖 ADR-0004/V1 的当前原文、位置依据、历史和保存屏障。V3 表格/任务与本切片可以独立实施后集成；不能把图片平台原型、纯资源模块或编译成功当作 V4 交付。

## 已决定的产品行为

用户已经确认：新增拖入/粘贴图片默认复制到文档旁的“文档名.assets”并插入相对 URI；已有图片引用原样保留；未命名文档可先插图，图片保存在沙盒恢复草稿区，首次保存取消/失败不丢失。其余规则按用户“后续按照你的建议进行选择”的授权确定，与规划票 06 一致：

- 拖入文件保留可用原字节，剪贴板只有像素时用系统能力编码 PNG；复制失败不插入假成功引用。名称可读、不冲突，中文、空格、百分号按 URI 规则处理。
- Save As 保持已有 Markdown 引用字节，复制关联托管资源到目标相对位置；不因文档改名而重命名已有资源目录。未托管相对图片会失效时，须处理源/目标授权与复制，不能静默断链。
- 同名同字节可复用，但不取得删除所有权；异字节不覆盖、不暗改已有引用。新导入资源可以在插入引用之前分配唯一名。
- 整目录迁移保持相对关系；单独移动 Markdown 不猜测搬动外部资源。缺失、拒绝、格式不支持分别提示，保留原引用和正文，提供授权/重新定位入口。
- Undo、删图不立即删除磁盘文件。首阶段不自动清理文档旁的未引用资源；恢复资源仅在成功移交或明确放弃关联草稿后按所有权处理。
- 编辑器离线。外部图片 URI 保留为引用/离线占位，不自动下载，不引入云图床或网络权限。

## 生产接缝与单一权威

必须接通实际 `editor/src/main.ts`、runtime、PM 投影、Swift EditorViewController/InkoraDocument、恢复存储及正式保存流程。不得 import `prototypes/`、暴露 window 调试控制器、用手工 source patch 按钮冒充图片插入。可以按被证明职责重写 021/037/040 的机制，不能整目录搬运原型及其诊断 UI。

原生负责持权文件读写、导入会话/资源清单、书签和 broker；Web 负责当前 Markdown、精确插入/改路径的内容事务、投影/历史、与具体文档版本绑定的导入意图。PM 图片是派生视图，真实图片/alt/title 与原文 image owner 对应；不能靠隐藏整段图片原文而让光标、删除、搜索映射失真。

已有生产 `image_ref` 是 mark，并非已完成图片节点。实施者应选择能给出精确原文归属的 image node/NodeView 或等价投影表示，保留完整/折叠/快捷引用、定义、邻近 marks/links 和空 alt。不得盲按 href 或显示文字第一次出现定位。

图片插入、选中删除、alt/title/必要路径修改必须走真实原文事务；每次用户导入作为一个 Undo 单元。选区、方向、Unicode、BOM、EOL、前后空白、保护片段与引用定义保留。源码 no-op 不改变 raw、选区、revision 或 history。

### 未命名文档与首次保存

先写入容器恢复草稿资源并确认 SHA，再接受图片插入。内部待定位引用必须唯一绑定 document/session/asset；不得伪造已存在的外部相对路径。可采用受控草稿 URI，但这些 URI 不能落入最终 Markdown 文件。

首次保存位置确定后，资源路径解析必须是**明确的、可校验的内容事务**：将该会话托管引用按精确 owner 改为目标“文档名.assets/实际唯一名”，绑定当前 epoch/raw/revision，整体接受或拒绝，形成可解释的历史边界；不能在 `markSaved` 中偷偷改 raw，也不能用保存点掩盖内容变化。之后正式保存屏障采集确定原文，写出的字节必须就是该 snapshot。已存在的合法引用不参与该改写。

路径准备/导入不允许改变 composition 中的 marked text。过期、源码 dirty draft 或投影无法证明时保留导入意图与已持久化恢复资源，明确拒绝应用，不自动切换源码。失败不能让资源脱离草稿、让文本成为假 clean，或误删 Undo 仍可能引用的资源。

## Sandbox、授权与加载

- 打开 Markdown 文件不等于获得邻接图片/父目录权限。通过实际文件/目录选择取得必要授权，恢复时显式解析书签并进入 scope，检查 stale、更新与失败；只读授权不申请读写书签。
- Save panel 的文件权限不冒充旁置资源目录权限。需要创建 `.assets` 时取得实际目录写授权；用户取消授权可取消本次操作，文档/草稿不丢失。
- Web 只收到按 document/epoch/asset 绑定的不可预测 capability URL，不收到任意磁盘路径读 API。原生只为从当前原文/托管清单解析并验证的 owner 签发资源；旧 epoch、跨文档、未知 token、错误 method 拒绝。
- descriptor 逐组件打开、拒绝 symlink、普通文件/大小/MIME/实际解码与 SHA 校验；中间组件 ENOTDIR 不能不经元数据就猜成 symlink。合法相对 `..` 仅能在已授权根中规范化解析，绝不能越出实际 grant；无法授权则提示，不改原文。
- `WKURLSchemeHandler.stop` 后不向系统 task 回调。取消/完成竞争、epoch/revoke、任务身份和 scope lease 的真实 handler 与测试共用实现，不另建平行门禁模型。读取完成前保持所需 scope，结束后配对释放。
- 复用既有 Sandbox/user-selected/bookmark entitlements，不加网络或宽泛文件访问。CSP 只为本地 broker 增加必要 scheme，`connect-src 'none'` 保持。禁止任意 file/http 加载或执行 SVG/HTML 脚本。
- 常用可离线解码格式至少覆盖 PNG/JPEG，并实测 GIF/WebP 可用性；不支持格式明确占位而不报成功。保留源文件原字节；预览失败不能损坏正文。尺寸/解码限制须有中文反馈，不能因高亮或主题刷新重写资源。

## 资源与 Markdown 提交协议

1. 只读重验 snapshot/raw/revision/epoch、授权、来源 SHA、目标冲突、全部图片引用及关联资源；权限取消或任一失败时未修改最终 Markdown。
2. 使用排他 UUID 私有 staging、持久化版本化 manifest/事件，记录本操作拥有的文件与实际唯一名。不能按文件名或全目录扫描推断删除所有权。
3. 全部资源复制并验证，然后发布到目标相对位置；最后经现有 NSDocument 安全写入正式 Markdown。
4. 实际写入/校验成功后，才以那个 snapshot 更新保存点并退役已成功移交的恢复记录。新编辑不能被旧 receipt 清为 clean。
5. 失败保持旧 Markdown、来源、草稿及其他会话资源；仅清理本操作独占 staging。已发布孤儿保守保留且记录，不声称多文件原子事务。
6. 跨进程重启可根据持久记录和实际字节保守恢复未命名文档/资源；区分历史 confirmed 与当前文件完整性。非法 schema/path、截断、symlink、外部修改、缺图/权限未知不猜成 saved，不自动重试/覆盖/删除他人资源。

Save As 保留来源，托管和已有未托管相对图片分别证明目标引用有效；目标同字节复用/异字节冲突/缺失三路径均覆盖。缺失和授权失败不可混为文件不存在。资源准备失败必须实际阻止正式 Markdown 保存和 markSaved，不能只给 UI 红字后照常完成。

## 验收矩阵

| 场景 | 必须观察的结果 |
| --- | --- |
| 打开已有本地/引用式图片 | 图像或明确权限占位，Markdown 逐字节不变，普通正文可编辑 |
| 命名文档拖入/选择文件 | 实际字节复制、唯一名、相对 URI、显示、单步 Undo/Redo |
| 粘贴位图 | 真实生产 paste 接缝、PNG 持久化、单事务，不吞普通文本粘贴 |
| 未命名先插图 | 重启后仍恢复相同草稿/资源与 SHA |
| 首次保存取消/授权取消 | 草稿/图保留、原文与 dirty 资格正确，不生成虚假最终引用 |
| 首次保存成功 | 目标名.assets + 确定 snapshot，关闭重开能显示，BOM/EOL/正文一致 |
| 复制、发布或 Markdown 写失败 | 旧 Markdown/来源/其他会话 SHA 不变，不 markSaved，可恢复 |
| Save As 改名/换目录 | 原引用字节不变，目标资源正确，原文档/资源不删除 |
| 未托管相对图 Save As | 目标缺失/同字节/异字节分别处理，无静默断链 |
| 整目录迁移/单 Markdown 移动 | 前者重授权后相对关系有效，后者缺图保留引用不搬他人文件 |
| 中文、空格、百分号 URI | 文件名、URI、标题正确往返，非二次 decode 或路径截断 |
| 同名不同字节/同字节 | 唯一名在插入前确定，或按冲突拒绝；复用不取得清理权 |
| 多文档、重载、旧回调 | 严格 document/epoch/owner 失效，不把 A 图插进 B |
| stop/完成竞争 | 实际 handler 零 stop 后回调、单次收口、lease 生命周期正确 |
| symlink/越界/未知 token | 原生实读拒绝、正确分层诊断，外部文件 SHA 不变 |
| composition、dirty source draft、过期导入 | 不偷焦点/不丢候选/不消费输入法 Enter，保留意图与恢复图 |
| 删除、Undo、Redo、源码往返 | 图片与 alt/title/邻近 marks、原文选区/历史一致，不误删磁盘图 |
| 真实 SIGKILL 窗口和恢复 | 新进程读持久记录/字节作结论，不用同进程抛错替代 |

测试必须走生产类、真实 runtime/EditorView/Bridge 或 NSDocument 接缝；组件 fake outlet/文件系统故障注入允许，但须与实际 handler/save 共用实现。目录授权、真实拖放/剪贴板系统来源、书签跨启动、WK 显示、真实 IME、正式关闭重开与 macOS 14 实机按层记录，不用普通 scratch、部署目标或纯 Node 证明替代。无新依赖；Bridge 如需新增图片消息，须 TS/Swift 同步类型校验、文档和双侧 golden，保持既有 v1 消息兼容。

非 UI 候选至少通过完整 editor、Bridge Web/Native、相关 InkoraDocument/Recovery/资源测试、lint、production build、离线/entitlement 检查。管理者之后做真实 Sandbox/WK/系统面板/文件迁移集中验收；未执行项明确保留，V4 与首阶段不提前标完。

## 事实依据与复用边界

原型证据仅供机制迁移：021@e7d9425 的普通 scratch 跨进程恢复，037@56b5d31 的真实 Sandbox 授权/书签/WK，040 最终 @4400081 的实际 handler49/path9/model16。它们分别不能外推生产保存、拖放、物理 IME 或最低系统通过。

已读取 Apple 官方 Markdown（2026-11-09）：[只读书签选项](https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions/securityscopeallowonlyreadaccess)、[WK 取消契约](https://developer.apple.com/documentation/webkit/wkurlschemehandler/webview(_:stop:))、[NSPasteboard](https://developer.apple.com/documentation/appkit/nspasteboard)。只读选项须与 withSecurityScope 联用；stop 后不能继续向该 task 报告；剪贴板/拖放由系统接口接入。上述提交顺序、历史和恢复策略是 Inkora 的产品/工程决定，不冒充 Apple 对跨文件事务的保证。
