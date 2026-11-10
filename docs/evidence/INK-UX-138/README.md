# INK-UX-138 后台验证

- red.txt：新增生产runtime菜单反例先红（旧UI没有更多）。
- green.txt：最终四个同域测试文件，包含冻结表格原文与撤销重做golden。
- lint.txt/build.txt：统一入口实际输出。
- geometry.txt：不可见真实WK最终360/900px长表几何，pass=1；菜单溢出可见、表格独立横滚、九项完整可达、正文不移动、上一段不被遮挡。

临时runner及打包harness保留在artifacts/INK-UX-138，不是产品调试入口。窗口从未orderFront/orderOut或启动App；使用NSApplication.shared提供WK运行环境，window.isVisible始终为false。

## 底部裁切补核

新增 bottom-red/green/tests/lint/build 为固定首版提交后的有限补核，不覆盖上方工具与上一段的既有证据。

先红：真实WK在800px高编辑区中将表格滚到y=740.34px（底部余约60px），长表横滚180px。旧菜单高182.69px、y=735.34px，后六项获得DOM焦点但elementFromPoint不能命中，九项不可达，pass=false。浏览器未自动滚动编辑区解决裁切。

修复：菜单打开时求viewport与全部overflow裁切祖先的下边界交集，保留4px边距设置border-box max-height；键盘focus preventScroll后只调整menu.scrollTop。编辑区滚动或resize时关闭，菜单自身滚动保持打开。菜单observer及全局事件监听仅在打开期间注册，关闭解除。

后绿：窗口360/900px × 编辑区600/800px × 底部剩余40/80px，共八组合。菜单实际高40.66/80.66px；Home、ArrowDown与End遍历九项，每项聚焦后同时核对menu/编辑区/viewport矩形及中心elementFromPoint命中。最后“删除表格”可见可聚焦；菜单自身scrollTop=141/101px，editorScrollDelta=0、表格y不变、表格scrollLeft=180不变、body无横溢出。原文、EditorState身份（含选区）、status、发布次数全不变；等待事件循环100ms后菜单仍打开且保持末项焦点。窗口isVisible始终false。

隐藏WK无法取得应用焦点，因此harness仅注入toolbar的visibility:visible及pointer-events:auto模拟已进入工具的可见状态，未改定位、尺寸、裁切、滚动或产品键盘逻辑。实际HTMLElement.focus、菜单keydown公开事件及elementFromPoint来自真实WK；不是物理键盘/VoiceOver验收。harness源码仍在artifacts/INK-UX-138/probe.ts和Runner.swift供备份。

四个同域测试88项、make lint、make editor-build再次通过；新增公开scroll事件验证菜单内部滚动保活及编辑区滚动关闭，保留所有原断言与golden。无全量/GUI操作。
