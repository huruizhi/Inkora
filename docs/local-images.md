# 本地图片生产实现

INK-M1-055 将图片接入正式 source-authoritative 编辑器与 `NSDocument` 保存队列。Web 端的图片是可选中的 inline atom/NodeView，Markdown 原文仍是唯一正文权威；原生端只持有资源字节、授权、书签、清单与短期 capability。

## 用户路径

- 「插入图片…」、文件拖入和仅含位图的 Command-V 都进入同一个导入事务。普通文本剪贴板继续交给 WebKit。
- 命名文档要求用户显式选择 Markdown 所在目录，原字节先复制并校验 SHA-256，再插入 `文档名.assets/文件名` 相对 URI。同名同字节复用，同名异字节在插入前分配 `-2` 等唯一名。
- 未命名文档把原字节写入 Recovery 下的会话目录，以唯一 `inkora-draft://asset/<uuid>` 绑定正文 owner。schema 3 清单为 atomic JSON，同时记录 document/session、历史导入 intent、新确认 intent 与 handoff 状态；schema 1/2 保持读取兼容。重启按会话 UUID、字节数和 SHA 恢复。无法证明原 selection 的旧记录或过期 pending 进入 `requiresConfirmation`，不在当前光标自动重投。
- 首次保存先用一个显式 Bridge 内容事务把本会话的草稿 URI 改成确定目标 URI；再取得正式 snapshot，发布并复验全部资源，最后才允许 `NSDocument` 写 Markdown。取消授权、内容事务拒绝或资源失败均不进入 Markdown 写入。
- Save As 不重写已有引用。相对图片按原 URI 从来源授权根复制到目标授权根；目标同字节复用，异字节拒绝且不覆盖。来源文档和资源不删除。
- 缺失、拒权、不支持、外部 URL 和等待授权分别显示局部占位。定位按钮只更新 capability，不改 Markdown。外部 URL 离线保留，不下载。
- 每个图片 NodeView 提供内联“描述…”表单；alt/title 通过图片节点位置生成单一源码事务。参考式图片只有在用户明确修改属性时才把该 owner 转成等价行内图片，原定义与邻近链接/marks 不改；纯显示、授权和 capability 刷新不产生 revision/dirty。

## 安全边界

`inkora-asset://resource/<uuid>` 同时绑定 document、epoch 和 token。导入、descriptor 与首次保存路径事务在入队时固定 canonical owner proof 的 document/revision，过期后拒绝且不迁移到新选区或新文本重试；授权事件也必须携带当前精确 proof 且 href 仍是 owner。broker 对每个路径组件使用 descriptor-relative open，拒绝越界、symlink、非普通文件、超限、MIME/解码/SHA 不符；重载使旧 token 失效。真实 `WKURLSchemeHandler` 与测试共用 `DocumentAssetTaskCore`，stop 后不再回调，读取结束才配对释放 security-scope lease。

目录选择产生版本化 security-scoped bookmark；只读来源使用 read-only 选项，写入目标使用读写 bookmark。解析失败保留记录并要求重新授权，不把拒权伪装成缺图。CSP 只增加 `inkora-asset://resource` 的 `img-src`，`connect-src 'none'` 不变。

PNG、JPEG、GIF、WebP 使用 ImageIO 做真实解码检查，保留源字节；剪贴板像素是唯一编码为系统 PNG 的路径。SVG/HTML 和其他格式不进入可执行预览。

## 故障与恢复

导入先以 `pending` 和完整 source identity 持久化，Bridge 确认后才记为 `accepted`；`accepted` 只由当前编辑器 accepted 语义投影的 canonical owner proof 判定，代码、普通正文与链接中的 URI 不计。进程中断时，启动协调器提供恢复、稍后和明确放弃；有可信正文时恢复同一草稿，没有正文时只打开空白图片草稿。作者在常驻 banner 明确确认后，系统重新捕获当前 document/epoch/revision/directed selection，走真实图片事务并持久化包含相同 document/revision/raw owner proof 的 snapshot，最后才记 `handedOff/accepted`。旧 intent 保留用于审计，不重绑或自动重投。首存资源发布后、Markdown 提交前的状态为 `awaitingMarkdown`：manifest 仍保留 draft owner，草稿源和已发布孤儿都保留，重试相同目标复用，改目标则产生新的路径事务。

Save As 使用 UUID 私有 staging，并把 prepared、published-awaiting-markdown 或 failed-conservative schema 2 journal 写在 Recovery，记录 Markdown SHA、源/目标文档和授权根。启动只读枚举并分别报告历史 journal state 与当前 Markdown/资源 SHA 完整性；非法 schema/path/symlink 保留原记录并拒绝裁决。Markdown 成功后才删除 journal；失败只清本操作 staging，已发布资源保守保留。需要迁移的 URI 只取自编辑器生产 canonical parser 已接受的图片节点：行内、完整、折叠与快捷参考图，以及 CommonMark escape/entity/first-wins/case/whitespace、平衡括号和容器语义均与实际编辑器一致；Native 不再建立第二套 Markdown owner 语法真值。

proof 的 URI 用于选择资源，不改 Markdown 原字节。Native 继续独占真实目录 grant、安全 open、MIME/ImageIO 解码、SHA、staging/publish/journal 与 safe-save；命名图片注册后的同步预检与异步 scheme 读取都由 broker 自己取得根目录 security-scope lease，descriptor 读取完成、取消或失败后对称单次释放，不依赖调用者残留 grant。proof 缺失、跨文档、跨 revision、raw 不同或迟到时不触碰资源并保留恢复资产。

真实 Sandbox 面板、跨启动 bookmark、WK 图片显示、拖放/系统剪贴板、IME 与正式关闭重开由管理者集中物理验收；hostless 测试只证明生产接缝与注入的授权/调度模型，不外推系统权限已授予。
