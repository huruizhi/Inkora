# 本地图片生产实现

INK-M1-055 将图片接入正式 source-authoritative 编辑器与 `NSDocument` 保存队列。Web 端的图片是可选中的 inline atom/NodeView，Markdown 原文仍是唯一正文权威；原生端只持有资源字节、授权、书签、清单与短期 capability。

## 用户路径

- 「插入图片…」、文件拖入和仅含位图的 Command-V 都进入同一个导入事务。普通文本剪贴板继续交给 WebKit。
- 命名文档要求用户显式选择 Markdown 所在目录，原字节先复制并校验 SHA-256，再插入 `文档名.assets/文件名` 相对 URI。同名同字节复用，同名异字节在插入前分配 `-2` 等唯一名。
- 未命名文档把原字节写入 Recovery 下的会话目录，以唯一 `inkora-draft://asset/<uuid>` 绑定正文 owner。清单为 atomic JSON，重启按会话 UUID、字节数和 SHA 恢复。
- 首次保存先用一个显式 Bridge 内容事务把本会话的草稿 URI 改成确定目标 URI；再取得正式 snapshot，发布并复验全部资源，最后才允许 `NSDocument` 写 Markdown。取消授权、内容事务拒绝或资源失败均不进入 Markdown 写入。
- Save As 不重写已有引用。相对图片按原 URI 从来源授权根复制到目标授权根；目标同字节复用，异字节拒绝且不覆盖。来源文档和资源不删除。
- 缺失、拒权、不支持、外部 URL 和等待授权分别显示局部占位。定位按钮只更新 capability，不改 Markdown。外部 URL 离线保留，不下载。
- 每个图片 NodeView 提供内联“描述…”表单；alt/title 通过图片节点位置生成单一源码事务。参考式图片只有在用户明确修改属性时才把该 owner 转成等价行内图片，原定义与邻近链接/marks 不改；纯显示、授权和 capability 刷新不产生 revision/dirty。

## 安全边界

`inkora-asset://resource/<uuid>` 同时绑定 document、epoch 和 token。导入与首次保存路径事务在入队时固定 document/revision，过期后拒绝且不迁移到新选区重试；授权事件也只接受当前精确 revision。broker 对每个路径组件使用 descriptor-relative open，拒绝越界、symlink、非普通文件、超限、MIME/解码/SHA 不符；重载使旧 token 失效。真实 `WKURLSchemeHandler` 与测试共用 `DocumentAssetTaskCore`，stop 后不再回调，读取结束才配对释放 security-scope lease。

目录选择产生版本化 security-scoped bookmark；只读来源使用 read-only 选项，写入目标使用读写 bookmark。解析失败保留记录并要求重新授权，不把拒权伪装成缺图。CSP 只增加 `inkora-asset://resource` 的 `img-src`，`connect-src 'none'` 不变。

PNG、JPEG、GIF、WebP 使用 ImageIO 做真实解码检查，保留源字节；剪贴板像素是唯一编码为系统 PNG 的路径。SVG/HTML 和其他格式不进入可执行预览。

## 故障与恢复

导入先以 `pending` 持久化，Bridge 确认后才记为 `accepted`；进程中断时，恢复正文若已有唯一 URI则确认，否则重放该导入意图。首存资源发布后、Markdown 提交前的状态为 `awaitingMarkdown`：草稿源和已发布孤儿都保留，重试相同目标复用，改目标则产生新的路径事务。

Save As 使用 UUID 私有 staging，并把 prepared、published-awaiting-markdown 或 failed-conservative journal 写在 Recovery。Markdown 成功后才删除 journal；失败只清本操作 staging，已发布资源保守保留。扫描覆盖行内、完整、折叠与快捷参考图，并排除 fenced/inline code、HTML 注释和转义图片示例。

真实 Sandbox 面板、跨启动 bookmark、WK 图片显示、拖放/系统剪贴板、IME 与正式关闭重开由管理者集中物理验收；hostless 测试只证明生产接缝与注入的授权/调度模型，不外推系统权限已授予。
