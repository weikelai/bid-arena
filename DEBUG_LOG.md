# 真实问题记录

## 2026-10-17 冻结回归：浏览器列表等待超时

本轮首次完整回归退出1：HttpSimulationIT中Edge在自动成交场景等待新拍品列表按钮30秒超时；后端单元4、AuctionIT14、DatabaseIT6、前端5和模拟65断言已通过，但不能据此将完整套件标PASS。证据：.local/freeze-tests.log、freeze-browser-failed.log、freeze-http-failed.log，失败结束20:43:18+08:00。

定位发现该测试点击管理员“开始”后立即点击另一浏览器刷新，没有显式等待管理员RUNNING或列表请求响应。只调整browser-check.mjs：先断言管理员RUNNING，再等待GET拍卖列表响应并新增“包含目标拍品”断言，随后验证原有界面/成交/资金断言；没有延长拍卖或删减断言。旧日志不足以证明超时唯一根因，因此以复测及新增服务端列表断言判断，不声称已复现数据库业务缺陷。完整复测结果见TEST_EXECUTION_REPORT冻结附节。核心业务未改动。

历史阶段 1 记录保留在 docs/STAGE1_VALIDATION.md。本文件只记录实际遇到的问题，不补造历史。

| 问题 | 证据与定位 | 修复 | 验证 |
|---|---|---|---|
| Docker daemon 管道不存在 | docker version 有 Client，但 dockerDesktopLinuxEngine pipe not found；当时 HTTP 8080/5173 不通 | 正常启动已安装 Docker Desktop；不重装、不重置 | docker info 成功，三个容器 healthy；compose-verify 重启对账通过 |
| 上一轮 API 草稿编译失败 | .local/backend-progress.log 有括号错误，Solon Context 包名与 bodyAs 方法不存在 | 修正 Solon API，随后拆分 Api/AuctionService/Sql | Maven 实际构建和单测通过 |
| DATETIME 映射类型错误 | 第一次 AuctionIT 7 项报 LocalDateTime cannot be cast to String | Sql.rows 同时将 Timestamp、LocalDateTime 转 UTC RFC3339 | 后续 13 项 MySQL 测试通过 |
| 模拟脚本启动路径错误 | http-simulation.log 显示 /auctions/2/start HTTP404，空响应导致 JSON 解析失败 | 使用 /admin/auctions/{id}/start；解析失败记录路径、状态，不打印凭据 | 后续 20 人模拟 55 项断言通过 |
| SQL 触发器故障注入权限不足 | MySQL 开启 binlog，临时账号创建 trigger 要求 SUPER | 不扩大权限、不改数据库全局参数；改为 package-private 故障注入器，在真实事务资金写入后抛 SQLException | 故障用例重新执行，最终结果见 FINAL_ACCEPTANCE_REPORT.md |
| PowerShell 管道损坏中文源码 | Python 从 PowerShell stdin 接收的 App.vue 中文变为问号 | 使用 apply_patch 写入 UTF-8 中文 | 前端重新构建；浏览器中文标签定位通过 |

原始运行日志在被忽略的 .local/ 和 backend/target/，包含当次真实输出；测试完成后可以重跑生成，不将日志当作永久运行保证。

## 2026-10-17 最终收尾最新状态（取代此前外部交付待办描述）

本轮实际重新执行 docker compose config --quiet、docker compose build、docker compose up -d --wait、node scripts/compose-verify.mjs --integration，全部退出0。完整回归结束20:16:12+08:00：后端单元4、真实MySQL集成18、前端5、20人模拟59项断言通过；Edge三上下文及SQL资金对账通过。新增独立auction-agent子进程真实出价110和取消后退出0，不再只是语法检查。历史57项是上一轮结果，予以保留。

种子重启快照一致：3用户、3条初始流水共3000、钱包各1000/0、演示DRAFT且end_at为空。测试仅使用容器3307随机隔离库，不修改本机3306。完整本地日志：.local/release-tests-final.log；构建及启动日志：.local/release-build.log、.local/release-up.log，均不发布。

状态分类：A PASS为上述本地核心、容器和自动化；GitHub发布以GITHUB_RELEASE_REPORT.md中实际推送和远端文件核验记录为准。B FAIL：最终回归无剩余失败，历史失败保留。C NOT VERIFIED：全过程开发历史、宿主机断电/大规模性能/双完整容器网络分区、可选线上部署。D BLOCKED仅用于实际外部阻塞，不把跳过人工环节视为阻塞。E OUT OF SCOPE：正式录屏、本人独立讲解/现场修改、评测方邮件/个人资料/外部提交，用户明确不要求本次交付，均未执行，不能宣称原始评测全部通过。

发布安全命令：node scripts/audit-release.mjs 与 node scripts/verify-secrets.mjs；扫描全部可达Git历史、跟踪文件及本地日志，不输出凭据值。真实.env、.local和日志截图不上传。HTTPS默认多账号凭据选择失败后选用现有weikelai GCM账号，dry-run通过；未要求提供Token或伪造历史。架构和已通过业务逻辑本轮未重构。

本节明确取代旧文档中“远端未授权”“独立Agent仅语法检查”“本人必须完成录屏/外部提交”的当前状态描述，旧文字保留作历史。AI完成本轮安全扫描、Agent脚本验收、自动化回归及发布整理，不代表本人独立设计能力已核验。仓库：https://github.com/weikelai/bid-arena 。
## 2026-10-17 全面验收追加

本轮依据原题PDF五页及Markdown重新审查，而非复用旧结论。发现App.vue退出后旧异步响应可写回钱包的风险，新增会话代次检查和状态清理，Edge延迟私有响应跨登录测试通过；补出价历史及终态展示。OpenAPI补充实际200响应schema。新增真实1205锁超时重试、注入1213回滚重试、SETTLING取消限制、相邻价格并发、bid-only权限测试。

本轮第一次扩展浏览器脚本报Route is already handled，属于测试拦截器unroute/fulfill竞争；完整失败日志.local/comprehensive-tests-attempt1.log与comprehensive-browser-attempt1.log保留。等待handled后移除，完整attempt2回归退出0，20:28:30完成：4单元/21真实MySQL集成/5前端/64模拟断言，浏览器SOLD/扣款与SQL对账通过；未删减断言。凭据日志与前端包检查新增后的最终运行结果见TEST_EXECUTION_REPORT.md。

真实死锁环未复现，1213是真实事务中的错误注入；实际1205锁超时已由真实MySQL产生。用户本人设计归属不能代签；早期全过程历史不存在；完整容器网络分区/断电/线上部署未验证。正式视频、本人现场核验、评测方外部提交仍按用户要求OUT OF SCOPE。
## 最终全面回归证据

2026-10-17 20:31:00+08:00，完整回归退出0：4单元、21真实MySQL集成、5前端测试，失败/错误/跳过均0；20人seed42模拟65断言，winner24 price370；新增动态凭据在后端日志及前端包中不存在的检查通过。Edge扩展测试包括旧钱包响应跨登录隔离、出价历史、自动SOLD及余额890/冻结0。详见TEST_EXECUTION_REPORT.md及需求矩阵新附表。原始MySQL3306仍PID8864，三个容器healthy。
