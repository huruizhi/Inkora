# INK-UX-138 后台验证

- red.txt：新增生产runtime菜单反例先红（旧UI没有更多）。
- green.txt：最终四个同域测试文件，包含冻结表格原文与撤销重做golden。
- lint.txt/build.txt：统一入口实际输出。
- geometry.txt：不可见真实WK最终360/900px长表几何，pass=1；菜单溢出可见、表格独立横滚、九项完整可达、正文不移动、上一段不被遮挡。

临时runner及打包harness保留在artifacts/INK-UX-138，不是产品调试入口。窗口从未orderFront/orderOut或启动App；使用NSApplication.shared提供WK运行环境，window.isVisible始终为false。
