# INK-REL-189：本机安装表格与代码工具 build10

用户授权本机安装。基线 3dac317feef5c3850c245c3b1ba634cfad6a58eb；
分支 task/INK-REL-189-local-code-table-preview。产品仅 project.yml build9→10，
marketing 0.1.0 不变，包含已合并表格与代码工具，无新依赖。

使用 make build-release 构建，按源 entitlements 作 ad-hoc/runtime 签名，
核对双架构、版本、离线资源、精确权限和签名。旧版私有 ZIP 备份后，
只有真实进程退出才 staging 原位替换，绝不强退或丢弃用户文档。
安装后使用真实 App 资源执行代码与表格 Native/WK 专项；正常启动仅证明
进程启动，不冒称物理 IME、VoiceOver、可见绘制或 macOS14 实机验收。
只本机部署，不发布 GitHub Release、tag、feed，不改变公证或 Keychain。
完成后保留工作树和压缩回退，仅解除本次借用依赖链接。

## 实际结果

构建源码 6c3342f0e8886e8ae776a55b0b0d8e5d42e322b8，`make build-release` 退出0；
使用源 entitlements ad-hoc/runtime 重签，codesign strict/deep、精确权限、离线资源检查通过。
0.1.0/build10、正式 bundle ID、macOS14 与 arm64+x86_64 核对通过；无 Sparkle 强链。
应用 editor 文件逐字节与本次构建资源一致。

候选与安装后分别运行真实代码 Native/WK 3/3、表格 Native/WK 4/4，均0失败，
包括原文精确保存重开、语言选择/行号、参数表格/重排/规模和宽窄布局。
本轮不重跑上轮1015项或全量CI，不将前次结果计作本轮自跑；既有构建警告保留。

核对旧进程已经退出后才替换；未强退、未选择丢弃。旧build9和新build10私有ZIP逐文件
校验通过；恢复目录只备份，不打印或提交其内容。安装 staging 与候选全文件SHA相等，
原位替换后再次匹配全部SHA与strict签名。回退旧App移至废纸篓，构建生成的本次临时
Inkora.app在压缩核验后删除；唯一正式入口仍为 /Applications/Inkora.app。

LaunchServices open成功且核对新进程路径/build10。用户回复已保存退出时进程再次结束，
因此又正常启动一次。CUA native pipe startup failed，无法确认可见窗口或对话框，
不把进程存在当物理IME/paint/VoiceOver验收。未运行macOS14实机/完整Native/XCU/
正式公证/公开发布。仍是未公证本机预览。

实际文件清单、私有压缩回退路径及测试原始输出见同域evidence；
借用的两项依赖链接已在完成后解除，真实依赖与工作树、中间日志保留。
收据整理首次Python stdin编码失败发生在执行前，未改变安装；改用ASCII脚本整理。
