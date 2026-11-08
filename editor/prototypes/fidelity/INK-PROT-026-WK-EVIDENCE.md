# INK-PROT-026 管理者独立接收与真实WK检查

代码固定ea63941a6ca320c5aa888eb18263c870fb361846；HTML source7c1fa47b665f60b42fdb04b2f495ad8786baa2058107eac32298b33e2c8e9577，bundle cec18aebe609813eac526967df50c191bb359695784b06fd78c3410d11190a95；observer2aa57f69…b68696d。macOS27.2，非macOS14实测。

管理者先用186d旧HTML执行新专项，确认直接Undo断言红；新代码独立实跑37+4+16+4+6+5、ledger17、selection15、native16+3+3、fixture582均过，025/026冻结真人材料逐字节未变。已FF接入008/推送，宿主重新构建verify/签名、manifest/Info/HEAD与source/script核对通过。原008目录随后观察为不在registry/磁盘，未归因用户或工具；提交在本地与远端一致。管理者从同提交重建本地 /Users/rayhu/Documents/projects/Inkora/.worktrees/INK-PROT-008-VERIFY，不新增Paseo侧栏workspace。

真实WK通过desktop preflight持锁启动，管理者以CUA普通输入操作，仅隔离样稿：
1. 末段输入X：rev1/past1/dirty=true，保存可用。
2. 普通Space被拒，rev1/past1及内容不变，blocked等价失败，保存禁用。此正常空格行为另交027修复，不能把“拒绝当下保存阻断正确”当连续输入正确。
3. 直接Undo：rev2/past0/future1，回原句/caret66，dirty=false/blocked空，保存可用。
4. 再按Space被拒，future1保留；空Undo不改变rev2/错误/保存禁用；直接Redo为rev3/past1/future0、X/caret67，blocked空、保存可用。
5. 制造畸形源码按钮：rev4/pending math，完整原文投影红框且禁save；Undo rev5恢复clean/可save；Redo rev6恢复pending且仍禁save。
6. Undo后建立内存保存点，最终rev7/past1/future1、内容X/caret67、dirty=false/pending=false/可save。这里不是NSDocument磁盘保存。

AX逐步观察为上述结论依据；原始运行输出存ink-prot-026-wk-runtime.txt，observer每秒去重snapshot，可能不包含每一次相邻按钮动作，不能由缺少中间snapshot推定动作未发生。未注入JS/模拟composition；工具普通输入不构成真实搜狗/候选窗验收，最新版本物理组合取消/选区替换/总体交互仍未验证。

本次宿主PID87910经精确命令核对后SIGTERM，前台session44623退出143，未冒称正常Quit。未改输入源/权限/用户文件。026两个执行Agent与workspace已归档，代码及记录备份在 /Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed；不是全部M0通过。
