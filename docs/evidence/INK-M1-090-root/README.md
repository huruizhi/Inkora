# 090与087组合的管理者独立回归

组合提交 `eb84ae22f04c7530f153950dc1233cd043ec9a69`：087 `49440e1` +090 `33a0085`。main/测试自动合并后逐hunk核对，保留087多行链接title字段与parser provenance、085解析/边界缓存、086旧anchor证明，以及090 exact owner proof/ack/receipt路径。

- `pnpm --dir editor test`：32文件682/682，含Web Bridge。
- `make test-bridge test-native lint PNPM=…`：exit0；Web Bridge14/14、Swift Bridge15/15；完整Native186 total/178passed/0fail/8个既有性能skip，Swift strict与TypeScript通过。
- `make release-bundle-check test-ci PNPM=…`：exit0；双架构Release与离线bundle smoke、CI入口脚本自测通过。脚本自测中的临时UI锁不启动GUI，不是物理验收。
- 新增 `testAcknowledgedImageDescriptorLoadsVerifiedPNGThroughRealSchemeHandler`：真实生产EditorViewController+WKWebView，临时恢复目录中存放1×1 PNG，accepted图片owner→完整proof→provisional→ack→commit→NodeView→真实scheme读取与ImageIO/WebKit解码。独立XCTest1/1，断言naturalWidth/Height、exact snapshot/owner URI和原PNG字节。没有窗口、授权面板或注入假descriptor；这仍不是Sandbox授权/物理输入证据。
- 新增测试仅加强消费路径，不修改生产实现。完整Native178与新增专项1/1分别记录，不伪称本地整套187已重跑；最终PR CI须覆盖最终提交。

Native/Bridge/WK实际xcresult摘要与原日志SHA无损包装在本目录。完整xcresult另做管理者归档。保留既有Swift actor-isolation和JS chunk警告。

083/088/089/090原发现与修复证据保持原文；087 Standards091与Spec092均0项，但仍不以两轴结果替代当前OS/IME/AX/最低macOS及首阶段整体验收。SYN-S016另有093真实红例，未因图片组合而宣称完成。
