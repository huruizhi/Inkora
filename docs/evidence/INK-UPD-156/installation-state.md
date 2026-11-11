# 下载失败与延期安装的状态归属补正

根审查指出前版在didDownloadUpdate即永久锁定直到host升级，签名/验证/解包失败会错误锁住通道。先用公共UpdateInstallationState反例重现原行为（10项中1失败），再修正；原始红/绿输出均保留，绿11项通过。

## 官方2.10.0实际语义

- SPUCoreBasedUpdateDriver.m:178–183：didDownloadUpdate先于extractUpdate。
- 同文件:236–250：提取启动失败时清SDK下载后abort；didExtractUpdate仅表明installer启动并接收数据，并不代表签名/解包/准备完成。
- SPUInstallerDriver.m:480–486：启动后completion(nil)甚至先于installer发回extraction事件。因此本实现没有把didExtractUpdate当成准备完成。
- SPUAutomaticUpdateDriver.m:103–130：installerDidFinishPreparation之后才发willInstallUpdateOnQuit，是可靠准备事件；返回false保留官方默认调度。
- SPUCoreBasedUpdateDriver.m:322–335：willInstallUpdate在installerWillFinishInstallationAndRelaunch转发，标为已交接，不因后续错误擅自释放。
- SPUUpdater.m:794–812,820–827,873–885：driver completion在主线程先didAbortWithError，再didFinishUpdateCycle（立即重开分支可省后者）；SDK不允许两个driver并发。adapter按此固定SDK有序回调关联当前attempt。公共回调不带cycle ID，不能宣称能够识别任意违反该SDK顺序的伪造didAbort。
- SUErrors.h:54–56：3000 unarchiving、3001 signature、3002 validation；domain必须SUSparkleErrorDomain。

## 状态与恢复

每次真实didDownloadUpdate建立UUID尝试。只有本尝试新创建的pending记录才属于它；已有较早延期/跨进程记录保持独立归属。delta失败回退完整包时，新尝试可继承本进程尚未准备记录的归属，并换generation，旧generation不能清新generation。

只有上述三个明确终止错误、当前generation一致、未准备、记录由本尝试拥有且build仍一致，才移除本记录；不触碰SDK缓存/私有API。任意网络错误、SUNoUpdate、其他domain或旧token都不会清。已准备事件会锁定交接意图；cycle成功/取消结束但没有可靠准备事件时，将当前记录保留为未知状态，后续错误不得越权清它。

精确未覆盖边界：标准公开UpdaterDelegate没有“手动准备完成/延期安装器已退出”的全量查询。因此手动dismiss后或跨进程恢复的未知记录继续锁通道，直到host达到pending build；不能自动证明它已消失。此边界不再泛化到本次未准备下载的3000/3001/3002失败。已有准备后的安装器失败仍可能保守锁定，需后续公开SDK能力/用户明确恢复方案，不假报已恢复。

测试覆盖三种失败可恢复、已准备不清、旧延期不清、较新尝试不被旧token清、delta回退归属、错domain/无更新不清、cycle结束后不清及跨进程未知不清。只测试真实公共状态模块，没有mock客户端安装。
