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

## 单命令入口

```sh
make -C prototypes/local-assets/native-host build
make -C prototypes/local-assets/native-host verify
make -C prototypes/local-assets/native-host check
make -C prototypes/local-assets/native-host run
```

- `build`：以 `arm64-apple-macos14.0` 编译宿主/控制程序/模型检查器，复制离线资源 manifest，ad-hoc 签名；失败非零。
- `verify`：无 GUI 校验严格签名、**恰好四项** entitlements、14.0 部署目标、bundle resource SHA、CSP 与禁止网络/文件导航规则。
- `check`：运行纯模型 15 项断言并执行 `verify`；不会创建伪造的 panel/bookmark/WK 通过证据。
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
- `make check` 不是 OS 授权证据。只有管理者在签名 Sandbox App 中的面板选择、真实退出重启与 WK 事件才是运行证据。
- 当前仅 PNG/JPEG，最大 10 MiB；不支持 SVG/HTML、拖放、剪贴板、保存迁移或生产 NSDocument 集成。
- TOCTOU 通过逐组件 descriptor 打开和 `O_NOFOLLOW` 缩小；原型不处理硬链接，也不宣称 App 全进程目录权限本身能提供文档隔离。
- 本机如果不是 arm64 或没有完整 Xcode，构建会失败；最低系统 14.0 只由二进制 load command 验证，未在 macOS 14 真机运行前不得宣称 14 已通过。
- 父票 14、M0、M1 均不会因本宿主代码可运行或纯模型检查通过而完成。
