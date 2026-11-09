# INK-REV-035：Sandbox 图片宿主独立验收

- 受审任务：INK-PROT-032
- 固定基线：`e7930fe8caa13475b34c24969f9b7fc309123633`
- 验收分支：`task/INK-REV-035-sandbox-host-acceptance`
- 验收范围：非 UI 构建、静态验证、纯模型与 CLI 文件系统接缝；未运行 `run`、`open`，未操作面板、浏览器、输入源或用户文件
- 结论：**不通过，修复后复验**

## 结论摘要

`build`、`check` 和 `verify` 均返回 0，模型检查实际通过 16 项；签名、四项 entitlement、14.0 部署目标、资源 SHA、CSP 与静态离线规则通过。路径只解码一次、`..`、绝对路径、其他 scheme、SVG、坏百分号、token/epoch/revoke 的纯模型断言也通过。

这些结果不能抵消两个具体缺陷：宿主没有实例化 `AppDelegate`，管理者的真实启动观察中进程存在但没有窗口或 `events.jsonl`；中间路径组件为 symlink 时，CLI 最小红例得到 `ENOTDIR`，实现将其记录为 `io-error` 而非承诺的 `symlink`。前者阻断整条真实授权/WK 验收链，后者破坏逐组件 symlink 的可诊断证据。

## 规格轴

### [阻断] App 启动后没有安装 delegate，纵向场景无法开始

管理者在独立的 INK-PROT-037 运行验收中观察到：基线 App 启动后进程 `16441` 持续存在，但无窗口，两次获取 App 均超时；宿主 container 只有 `fixture-locator.json`，没有 `events.jsonl`。这说明 `applicationDidFinishLaunching` 没有执行，而不是面板选择或安全作用域读取失败。

静态实现与该观察一致：`main.swift` 把 `AppDelegate` 声明为 `@main`，二进制有 `_main`；但 `Info.plist` 的 `NSPrincipalClass` 是 `NSApplication`，没有 `NSMainNibFile` 或 `NSMainStoryboardFile`，源码也没有显式创建 `NSApplication`、实例化 `AppDelegate`、设置 `NSApp.delegate` 并进入事件循环。无 nib/storyboard 时，没有机制实例化该 delegate。

影响：README 的启动状态、面板、bookmark、broker、WK、撤销和真实退出重启步骤全部不可达。035 未触碰 UI，也未修改实现；最小启动修复由独立 INK-PROT-037 处理。

### [高] 中间组件 symlink 被拒绝，但误分类为 `io-error`

`readRelativeNoFollow` 对每个中间组件调用 `openat(O_DIRECTORY | O_NOFOLLOW)`。在当前 macOS 上，中间组件为 symlink 时返回 `ENOTDIR(20)`；`readFailure` 只把 `ELOOP` 映射为 `.symlink`，因此输出 `.ioError`。最终组件 symlink 则返回 `ELOOP(62)` 并正确映射为 `.symlink`。

可重跑最小红例使用原始 `BrokerPolicy.swift` 与 `Support.swift` 编译，只在原型 `.build` 下创建唯一目录：

```text
PASS percent-decode: real/sub/a.png
PASS regular-read: read-ok
PASS final-symlink-rejected: status=symlink errno=62
FAIL component-symlink-rejected: status=io-error errno=20
PASS png-mime: magic+extension
PASS extension-mismatch: png bytes as jpg
PASS encoded-traversal-rejected: path-traversal
```

安全结果仍是拒绝，没有发生 symlink 跟随；缺陷在诊断分类。它与 `DIAGNOSTICS.md` 将 `symlink` 列为独立状态、README 声称有“逐组件 symlink 反例”不一致，也会使真实事件无法证明命中的是 symlink 边界。035 按要求没有修改原实现。

### [中] 16 项模型没有验证实际 stop/cancellation/generation 实现

模型中的取消断言只测试 `Shared/BrokerPolicy.swift` 的 `CallbackGate`。该类型除 `ModelCheck/main.swift` 外没有生产调用；实际 `AssetSchemeHandler` 使用的是 `ObjectIdentifier`、`active`/`canceled` 集合和主线程回调，`ResourceBroker` 另用 UUID `generation` 抑制过期读取。模型未覆盖以下实际边界：

- `WKURLSchemeTask.stop` 与异步读取完成的竞争；
- callback 后 `ObjectIdentifier` 的集合清理与潜在复用；
- authorize/new epoch/revoke 改变 generation 时只回调一次；
- 读取 lease 是否在异步读取真正结束后归零。

静态阅读未发现这些路径必然发生双回调：generation 在串行队列内比较，旧结果转成 `document-generation-changed`；scheme handler 在主线程回调前再次用 `isCurrent` 检查，并在 cancel 后抑制回调。但现有 16 项通过不能作为这些实际实现的验证证据，应明确保留为未验证风险。

### [低] README 的模型断言数量自相矛盾

README 前文和程序输出都是 16 项，`check` 说明却写“15 项断言”。实际运行确认 16 项全部通过。该错误不影响执行，但会使证据清单计数不一致。

## 规范轴

- 符合：改动局限于隔离原型，没有修改生产编辑器、引入第三方依赖或网络资源；构建目标与 entitlement 符合 ADR-0003 的原型边界。
- 符合：README 和 `check` 输出明确说明纯模型不能冒称 NSOpenPanel、bookmark 或 WK 真实运行通过。
- 符合：安全作用域读取以实际读结果为准，`startAccessingSecurityScopedResource()` 的布尔值没有被直接当作授权成功；读取 lease 延续到异步读取结束。
- 符合：broker 在返回数据前依次执行逐组件 descriptor 打开、10 MiB 上限、fixture SHA 和 PNG/JPEG magic+扩展名检查；补充 CLI 接缝确认普通读、PNG MIME、扩展名不匹配、百分号和编码 traversal 行为。
- 判断项：`CallbackGate` 是只服务模型的平行抽象，形成“测试通过但实际 handler 未被测”的 Speculative Generality/测试替身漂移风险。该项不是格式工具能发现的问题。
- 不符合：中间 symlink 的诊断状态与仓库自己的 `DIAGNOSTICS.md`/README 承诺不一致。

## security scope 与 bookmark 审查

- 文件和目录面板结果都先做 fixture 白名单限制；locator 只用于定位，外部 Markdown/manifest 均在作用域中实际读取并核对 SHA。
- 文件授权只围绕选中文件开启作用域；邻接图片读取独立记录，不把文件授权推导成目录授权。
- 目录 bookmark 在面板安全作用域内创建；恢复后重新开启作用域、重新读取 manifest，并区分 restored、stale、error 与实际读取结果。
- revoke 删除持久 bookmark、使 registry revoked、清空 root/hash 并轮换 generation。正在进行的读取 lease 会等读取结束才释放，旧 generation 不返回成功数据。
- 未实际运行面板、bookmark 恢复或 sandbox 授权，因此以上仅为静态实现审查，不是 OS 授权通过证据。

## token、epoch、路径、SHA/MIME 与并发边界

- token：随机 UUID，registry 保存 document UUID、epoch、相对路径；未知 token、跨文档参数、旧 epoch、revoke 均有纯模型断言。
- 文档切换：重新 authorize 会新建 registry/document 并轮换 generation；new epoch 保留 document UUID、轮换 epoch/generation；旧 token 解析失败。
- 路径：先校验百分号，再只解码一次；拒绝绝对路径、`.`/`..`、空组件、NUL、非 PNG/JPEG 扩展；descriptor 打开使用 `O_NOFOLLOW`。中间 symlink 的拒绝有效但分类有上述缺陷。
- SHA/MIME：manifest 自身先按 locator SHA 核对；图片再按 manifest SHA 核对，最后按 magic 与扩展名共同决定 MIME。补充接缝确认 PNG 字节不能以 JPEG 扩展返回。
- stop/cancel/generation：静态控制流具备双层过期检查，但模型没有接入实际 handler/broker；保留未验证风险，不写成并发已通过。

## 实际命令与结果

```sh
git rev-parse --verify e7930fe8caa13475b34c24969f9b7fc309123633^{commit}
# e7930fe8caa13475b34c24969f9b7fc309123633

git rev-parse HEAD
# e7930fe8caa13475b34c24969f9b7fc309123633

make -C prototypes/local-assets/native-host build
# rc=0；arm64-apple-macos14.0 三个二进制构建完成，App ad-hoc 签名严格验证通过

make -C prototypes/local-assets/native-host check
# rc=0；16/16 模型断言通过；内含 verify 通过

make -C prototypes/local-assets/native-host verify
# rc=0；签名、恰好四项 entitlement、14.0、资源 SHA、CSP、静态离线规则通过
```

补充 CLI 接缝最终返回 `rc=1`，唯一失败为中间组件 symlink 分类；其余 6 项通过，输出见上。接缝最初有三次无效准备尝试：一次含清理 trap 的命令在执行前被策略拒绝；一次 stdin 顶层 Swift 编译失败；一次 stdin `@main` 链接缺 `_main`。这三次均未执行受审逻辑，不计入产品结果；最终改用 `.build/ReviewSeam.swift` 后得到上面的有效红例。

静态启动核对：

```sh
nm -gj .build/InkoraLocalAssetHost.app/Contents/MacOS/InkoraLocalAssetHost | rg '(^_main$|AppDelegate)'
# _main

/usr/libexec/PlistBuddy -c 'Print :NSPrincipalClass' .build/InkoraLocalAssetHost.app/Contents/Info.plist
# NSApplication

/usr/libexec/PlistBuddy -c 'Print :NSMainNibFile' ...
# Does Not Exist

/usr/libexec/PlistBuddy -c 'Print :NSMainStoryboardFile' ...
# Does Not Exist
```

## 未完成事项与风险

- 035 没有运行任何 UI、面板、bookmark 或 WK 流程；真实运行证据由管理者持 UI 锁验收。
- 启动缺陷修复后，必须重新执行面板取消/选择、目录授权、WK 加载、epoch、revoke、真实退出重启和 bookmark stale/实际读取验收；当前不能宣称任何一项已通过。
- 需要补一个直接覆盖实际 `AssetSchemeHandler`/`ResourceBroker` 的非 UI 可控接缝，至少覆盖 stop 与 completion 竞争、generation 轮换、单次回调和 lease 归零。
- 需要修正中间组件 symlink 的状态识别并保留 `errno=ENOTDIR` 证据，再重跑最小红例。
- README 的 15/16 计数需要统一；本验收未修改 INK-PROT-032 原始文件。

## 验收决定

固定基线 `e7930fe` 的静态安全设计大体成立，构建与纯模型验证可复现；但启动链不可达是阻断缺陷，逐组件 symlink 诊断另有确定红例，实际并发实现仍缺非 UI 证据。因此 INK-PROT-032 在该基线上**不通过独立验收**，不得据此关闭父票 14、M0 或 M1，也不得把 `make check` 写成真实 OS 授权通过。
