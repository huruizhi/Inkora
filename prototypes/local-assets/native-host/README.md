# INK-PROT-032 原生 Sandbox 图片宿主

这是父票 14 的**隔离原型证据宿主**，不是生产图片功能。问题是：在 macOS 14+ 的真实 App Sandbox 中，显式 `NSOpenPanel` 文件/目录授权、app-scoped security-scoped bookmark 恢复，以及离线 WKWebView 的文档隔离资源 broker，能否组成一条可观察、可拒绝越权的本地 PNG/JPEG 加载链。

原型不修改生产编辑器，不访问用户真实文档，不联网。控制程序只在 `/tmp/InkoraLocalAssetHostFixtures/<runID>/` 建立唯一实验 fixture；宿主只接受定位记录中的 runID、run root 和 manifest SHA。定位路径仅用于限制面板结果和初始定位，**不作为授权**；外部 `manifest.json` 与文件内容必须在面板授权或书签恢复后实际读取。

## 一条纵向场景

1. 非沙盒 `fixture-control` 创建含中文、空格、`%` 的外部目录：BOM+CRLF Markdown、PNG、第二文档，以及 missing、`..` 越界、逐组件 symlink 反例；manifest 记录 SHA 与预期拒绝。
2. 签名宿主启动时只读自身 container 内的 locator，展示 OS、二进制 SHA、fixture manifest SHA、runID 与 Sandbox 激活状态；默认不读取外部 fixture。
3. 用户先在 `NSOpenPanel` 选唯一 Markdown。宿主实际读取该 Markdown，并在同一文件安全作用域内尝试邻接 PNG，分别记录 success / missing / denied / errno / SHA；不能从文件 URL 推导目录已授权。
4. 用户再显式选择唯一目录。宿主在该目录安全作用域内读取并核对 manifest，创建 app-scoped bookmark，再给 broker 安装目录授权。JS 只得到 `inkora-asset://resource/<随机token>`。
5. broker 强制 `document UUID + epoch + resource UUID` 所有权，以只解码一次的受限相对路径定位；逐组件 `openat(O_NOFOLLOW)`、最大 10 MiB、fixture SHA、PNG/JPEG 魔数全部通过才返回 WK。
6. 真正退出再启动后，宿主解析 bookmark，记录 restored / stale / error，并重新实读 manifest、Markdown 与图片。目录移动后是否 stale 不预设，以恢复结果和实际读取结果为准。

跨文档 token、旧 epoch、撤销授权、未知 token、`..`、绝对路径、其他 scheme、SVG 和 malformed percent 的拒绝由 `model-check` 的 16 项无 UI 断言覆盖。它只报告纯模型，不冒称运行过面板、书签或 WK。

`handler-check` 的 46 项断言直接驱动真实 `AssetSchemeTaskCore`（`AssetSchemeHandler` 的 start/stop 公共内部路径）与真实 `ResourceBroker`/descriptor 读取：替身只替换系统 `WKURLSchemeTask` 出口和调度时序，覆盖 stop 先于完成、完成前后两种竞争顺序、epoch/revoke 轮换、单次回调、任务 identity 清理与读取 lease 持有到读结束。它不实例化 WKWebView/App，不冒称面板或 OS 授权运行。

## 单命令入口

```sh
make -C prototypes/local-assets/native-host build
make -C prototypes/local-assets/native-host verify
make -C prototypes/local-assets/native-host check
make -C prototypes/local-assets/native-host handler-check
make -C prototypes/local-assets/native-host run
```

- `build`：以 `arm64-apple-macos14.0` 编译宿主/控制程序/模型检查器/接缝检查器，复制离线资源 manifest，ad-hoc 签名；失败非零。
- `verify`：无 GUI 校验严格签名、**恰好四项** entitlements、14.0 部署目标、bundle resource SHA、CSP 与禁止网络/文件导航规则。
- `check`：运行纯模型 16 项断言、真实 handler/broker 接缝 46 项断言并执行 `verify`；不会创建伪造的 panel/bookmark/WK 运行证据。
- `handler-check`：单独运行 46 项真实 `AssetSchemeTaskCore`/`ResourceBroker` 非 UI 接缝断言（在 `/tmp` 建唯一 scratch fixture，结束即清理）。
- `run`：创建新 fixture、验证后以前台 `open -W` 运行。它会占桌面，当前锁屏时禁止执行。

`network.client` 仅按 ADR-0003 满足当前系统 WebKit WebContent 进程启动；页面使用非持久 data store、自定义 bundle/asset scheme、`connect-src 'none'`、导航白名单，源码没有 `URLSession`，仍完全离线。没有任意读写 entitlement。

## 管理者约 5 分钟人工验收（必须解锁桌面）

在仓库根目录执行，必须同时持生产 UI 锁并通过 desktop preflight：

```sh
scripts/ci/with-ui-lock.sh scripts/ci/ui-preflight.sh desktop \
  make -C prototypes/local-assets/native-host run
```

观察顺序：

1. 启动状态明确显示 `sandboxActive=true`，尚无外部读取；事件含 OS、binary/fixture SHA 和 runID。
2. 点“选择 Markdown”后先取消一次，确认 `panel-cancel/source=user-action`；再次选择 fixture 的唯一 Markdown。确认 Markdown 实读成功，邻接图片结果单独记录，不能因 `startAccessing` 返回值或 bookmark 可解码就宣告图片可读。
3. 点“选择目录并加载图片”，选择完整 fixture 根；确认 manifest SHA 通过、bookmark-created、scope 计数归零、native SHA 成功、WK request/complete，页面出现 1×1 fixture 图片。
4. 点“切换文档 epoch”，确认旧 token 不再显示；重新选目录后生成新 document/epoch/token。点“撤销授权”，确认后续资源不可读。
5. 再选文件和目录后用 `⌘Q` **真实退出**。为了保留同一 fixture，第一次先运行 `make fixture verify`，随后连续运行两次：

   ```sh
   open -W prototypes/local-assets/native-host/.build/InkoraLocalAssetHost.app
   open -W prototypes/local-assets/native-host/.build/InkoraLocalAssetHost.app
   ```

   第二次确认 bookmark-restored/stale 状态和实际读取结果；若要测试移动，在两次之间仅把当前 run root 内的 fixture 目录改名，再观察恢复 URL、stale 与 manifest 实读，不能预设移动一定 stale 或一定成功。

退出、取消或 WK stop 时不删除 fixture；读取 lease 在异步读取结束后才 stop，取消后不再 `didReceive/didFinish`。验收完显式清理本轮唯一 fixture：

```sh
make -C prototypes/local-assets/native-host fixture-clean
```

## 证据边界与风险

- `events.jsonl` 和 `bookmarks.json` 只保存在原型自身 container；日志不含 bookmark 原始字节或凭据，只含本实验 fixture 的 token、SHA、runID、相对状态。
- `make check` 不是 OS 授权证据。`handler-check` 在非沙盒 CLI 中 `startAccessingSecurityScopedResource` 返回 true 属进程外 no-op，其 scope 计数只断言 lease 对称释放；只有管理者在签名 Sandbox App 中的面板选择、真实退出重启与 WK 事件才是运行证据。
- 当前仅 PNG/JPEG，最大 10 MiB；不支持 SVG/HTML、拖放、剪贴板、保存迁移或生产 NSDocument 集成。
- TOCTOU 通过逐组件 descriptor 打开和 `O_NOFOLLOW` 缩小；原型不处理硬链接，也不宣称 App 全进程目录权限本身能提供文档隔离。
- 本机如果不是 arm64 或没有完整 Xcode，构建会失败；最低系统 14.0 只由二进制 load command 验证，未在 macOS 14 真机运行前不得宣称 14 已通过。
- 父票 14、M0、M1 均不会因本宿主代码可运行或纯模型检查通过而完成。

## INK-PROT-037 真实运行补正

032基线e7930fe的编译/模型绿不能代表可启动：无nib的默认入口未创建delegate，实际进程无窗口/事件。037显式创建NSApplication并绑定delegate后正常运行；添加标准退出菜单和最后窗口关闭退出，支持可核对的跨进程验收。

真实文件面板只授权Markdown时，Markdown SHA成功，邻接PNG实读EPERM。文件书签原先只用withSecurityScope请求读写能力，在只读授权下失败；现在组合securityScopeAllowOnlyReadAccess，不扩大entitlement。官方依据：https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions/securityscopeallowonlyreadaccess 。目录书签和文件书签均经真实退出后恢复实读。

恢复发生在WK页面就绪之前，原本会丢失showImage调用；现在保存当前capability，didFinish后才展示，new epoch/revoke清掉待展示值并重验token。移动本轮唯一fixture目录后两个bookmark实际stale=true；刷新必须先进入恢复URL安全作用域，补正后刷新成功，Markdown/manifest/PNG SHA一致，WK完成。

完整原始记录和11项分层断言位于evidence/INK-PROT-037/；只读书签字节不进入证据。所有操作由管理者通过CUA完成系统面板；不是用户物理键盘或macOS14运行证据。本机macOS27.2，deployment target14.0只证明构建目标。

尚未完成035发现的中间symlink ENOTDIR分类和真实handler stop/generation并发接缝；拒绝symlink本身有效，不能把分类缺陷写成已发生逃逸。仍未有拖放/粘贴、保存迁移或正式NSDocument集成，父票14保持未完成。所有自有宿主已正常退出，唯一fixture和locator已清理，bookmarks经UI撤销，生产UI锁已释放。

## INK-PROT-040 接缝补正

035发现的中间组件symlink误分类已修：macOS上中间组件为symlink时`openat(O_DIRECTORY|O_NOFOLLOW)`返回ENOTDIR(20)而非ELOOP，errno无法与普通非目录组件区分。现以`fstatat(AT_SYMLINK_NOFOLLOW)`目录项元数据证据分类为`symlink`并保留原errno=20；普通非目录组件仍为`io-error`，不跟随链接、不扩大权限。最终组件symlink仍为`symlink`/ELOOP(62)。红例先于修复真实复现（见docs/tasks/INK-PROT-040.md）。

真实handler并发接缝已建：`AssetSchemeHandler`的start/stop公共内部路径提取为`AssetSchemeTaskCore`，WK适配器与`handler-check`的fake outlet共同调用同一实现；`ResourceBroker`的读取调度与回调交付是显式受限接缝（默认即真实工作队列/主队列）。红例先证明：任务完成后晚到的stop会把已完成的任务identity残留进canceled集合，系统task对象地址复用后无关新任务被永久误抑制；修复为只有仍active的任务才标记canceled。035担心的“回调在broker state.sync内重入死锁”经在途epoch/revoke场景实际执行未复现（completion只异步入队，不同步重入broker状态队列），保留原实现未改。

未验证边界：`handler-check`是纯CLI非UI执行，不是WKWebView/面板/OS授权运行证据；037冻结的runtime证据未动。identity键仍为ObjectIdentifier。管理者通过真实WKSchemeTaskOutlet适配器证明底层task在读取、取消后的待交付阶段均被强持有，收口后才释放；原候选所列“在途对象已释放并同址复用”在默认适配器路径未被证实，不能直接据此要求token重设计。父票14/M1保持未完成。

## INK-PROT-040 管理者独立补正

最终 `make check` 为 model 16 + handler 49 + path 9，签名与静态离线验证通过；handler/path 再连续三轮通过。当前实际计数取代上文候选的46项历史记录。

新增路径回归对037原Support.swift先复现唯一中间symlink分类失败，当前实现9/9绿。`openat`失败后立即捕获errno，再查询元数据，避免后续系统调用污染诊断。新增3个真实WKSchemeTaskOutlet生命周期断言，验证上述强持有边界。读取收口等待有5秒上限；handler退出前显式清理唯一scratch，因为exit不执行顶层defer。`path-check`可独立运行，也纳入默认check。

证据位于 `evidence/INK-PROT-040-review/`。这些为真实处理器/文件描述符接缝，不是WKWebView或OS授权运行。默认completion只异步交付，相关重入未复现；不据此证明任意外部同步回调重入安全。037原始运行证据保持不变；父票14仍缺拖放/粘贴、保存迁移、生产集成和最低OS实机。
