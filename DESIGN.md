# 实际实现设计

## 2026-10-18 生产安全加固（当前状态，优先于旧记录）

已新增V4、一次性管理员引导、数据库登录准入、人类会话持久吊销、Migration/Runtime分离和独立TLS入口模板。本文末尾“生产安全加固补充”说明具体事务与权限；下方旧节所述“缺少引导/限流/吊销”保留为当时发现，不代表当前代码。生产公开上线仍FAIL：残留镜像严重/高危公告、真实证书/续期、生产备份适配和外部告警等未闭合，详见PRODUCTION_HARDENING_REPORT.md。

## 2026-10-18 上线前安全与交付补充

资金事务、锁序、接收定义和结算边界保持不变。本轮将Flyway传递的Jackson通过2.21.7 BOM约束统一补丁线，修复已知公告匹配；实际兼容性以本轮完整回归证据为准。nginx增加同源CSP、禁止嵌入、nosniff、referrer及权限策略，不引入TLS伪完成或新权威数据层。生产仍缺TLS/管理员引导/登录防暴力破解/服务端退出吊销，不能公开上线。UI分为App状态及展示组件，字号变量集中typography.css，权威状态依旧来自服务端；禁止用UI修饰代替账务正确性。审计依据FINAL_RELEASE_AUDIT与SECURITY_AUDIT_REPORT最新节。

本文描述当前代码；DESIGN_DRAFT.md 与原始 PROJECT_AUDIT.md 保留历史，不代表最终实现状态。

## 模块边界

Vue 只负责操作、展示和服务端时钟偏移估算，禁止自行判定赢家或余额。Api 负责身份、范围、输入和 HTTP 映射；AuctionService 负责状态机及事务；Database 管理同一 Connection 的提交/回滚；MySQL 是唯一事实源。Agent 复用业务服务但使用独立最小权限凭据。没有 Redis、微服务或 JVM 内存权威队列。

实时层采用每秒 HTTP 读取 auction_events 的等价方案，读取的都是已提交数据，不存在“事务中广播”；断网或读取失败不回滚业务。代价是约一秒延迟和数据库读取负载，适合本题人数，不声称大规模推送性能。

## 数据模型与约束

V1 原有十四表保持 checksum；V2 增加 auth_sessions；V3 增加 auction_intake 并为已有拍卖补接收门，bid_requests 增加 amount。共16张应用表。金额为 BIGINT 整数积分，Java long，HTTP 限制正整数不超过9万亿，避免前端浮点精度损失。

| 表 | 主键/关键约束与用途 |
|---|---|
| users | 自增ID、email唯一，角色/状态/kind CHECK，密码哈希 |
| wallets | user_id 主外键；total>=frozen>=0，version递增 |
| wallet_transactions | ID主键、effect_key唯一，钱包/拍卖外键，记录两种余额变化及变更后余额 |
| auctions | ID、seed_key唯一；状态、计数、价格CHECK；status/end_at扫描索引 |
| auction_participants | (auction_id,user_id)主键，真人/Agent类型 |
| auction_holds | 同参与者复合主键/外键及钱包外键；每场每人冻结 |
| bid_requests | (user_id,request_id)主键；payload_hash、接收时间、amount、PENDING/终态及响应JSON |
| bids | (user_id,request_id)唯一，(auction_id,seq)唯一，参与者/请求外键 |
| auction_results | auction_id主键，每场最多一条，赢家外键及结果CHECK |
| auction_events | (auction_id,seq)主键；公开或指定用户私有，事件与业务同事务 |
| agent_tokens / scopes / rate_windows | 摘要唯一；用户/拍卖/权限复合主键；Token+分钟窗口主键 |
| seed_state | 种子键主键和锁，整个种子过程原子化 |
| auth_sessions | 摘要主键、用户外键、到期索引 |
| auction_intake | auction_id主外键，持久接收屏障 |

SQL 是完整约束与索引的权威来源。流水不强制 request_id 外键，因为释放上一领先者时请求归属新领先者，且结算没有请求；使用关联拍卖及全局effect_key解释。跨表汇总由应用事务维持并由真实 SQL 对账，不能宣称 CHECK 能跨表验证。

## 接收时间、幂等与锁顺序

服务端“接收”明确为：鉴权/基本格式检查完成，取得该场 auction_intake 行锁后、插入请求前，用独立 SQL 读取 MySQL UTC_TIMESTAMP(6)。不是网络第一字节或客户端时间。等待接收门的时间不算已接收；一旦取得时间，后续拍卖外键或钱包锁等待不改变它。

第一事务锁接收门，检查用户全局 requestId：相同拍卖与金额可重放；不同指纹409。持久化 PENDING 请求后提交。第二事务锁拍卖，按 received_at、user_id、request_id 排空已提交 PENDING。因接收门串行分配且先提交后释放，已有接收顺序可重现。SQL1213/1205/1062有限重试三次；失败返回可重试错误，持久请求可被后续扫描恢复。

结算/取消先接收门，再拍卖，再排空请求；因此不能抢在已接收但等待主表外键锁的出价前结束。出价处理只锁拍卖，不反向取得接收门；钱包按去重后的用户ID升序逐行 FOR UPDATE。跨场共享钱包不会超花。最终仍需 InnoDB 死锁检测与重试，不能保证绝无锁冲突。

## 出价原子事务

锁拍卖并校验 RUNNING、received_at严格小于当前end_at、至少当前价+10、已加入。锁新旧领先钱包，计算新增冻结=amount-本场已有hold，余额不足拒绝。

成功时：释放旧领先者hold/钱包冻结并记RELEASE，新领先者只加差额并记FREEZE，更新hold、价格和领先者；最后五秒以最新end_at加10秒，最多三次；写bid、事件、幂等终态响应，同一Connection一次提交。条件UPDATE与钱包CHECK保证不能负数；每个资金效果有唯一effect_key。任一步异常全部回滚，原持久PENDING仍可恢复。失败出价仅写拒绝响应及私有事件，不改资金。

## 结算、取消与进程故障

每实例每秒扫描 RUNNING到期、SETTLING或有PENDING的拍卖，逐场处理，某场SQL异常不阻塞全部后续场。取得接收门/拍卖锁、排空已接收请求，再检查最新截止，避免延时后误结算。

一个事务内 RUNNING→SETTLING，赢家total与frozen同时减成交款，其他hold释放，写唯一result及FINISHED事件，再FINISHED。SETTLING通常不对其他事务可见，但扫描也支持遗留该状态。DRAFT/RUNNING可以CANCELLED并释放所有hold；SETTLING和终态拒绝取消。重复结算终态直接返回；result主键与流水effect_key第二道防重。

进程中断导致未提交事务由InnoDB回滚；重启扫描重新读取数据库完成。真实子进程测试在资金写后 Runtime.halt(73)，验证零提交扣款、保留hold，再由新执行器完成唯一结算。事务异常注入另覆盖出价和结算。没有依赖内存任务恢复。

## 事件与重连

同一拍卖行锁内seq递增，事件唯一键并与业务一起提交；因此同场可见事件顺序与串行提交一致。接受后延时另占一个seq；拒绝也占seq但仅本人可读。其他人自然可能看到缺口，这是明确允许且会触发权威快照，不能凭缺口推断业务失败。

快照使用REPEATABLE READ单事务读价格、seq、参与者及结果，包含auctionId/seq/serverTime/type。events接口返回持久事件和CONNECTION_STATE水位（同一现有seq，不额外消费业务seq）；水位是观察信息，不作为新业务事件。超过200条、缺口、断线、任何新事件均重取快照。客户端按服务端时间偏移显示倒计时；实际接收仍由数据库判定。事件表不需要published_at投递标志，因为所有实例直接读取已提交历史，没有仅建表未发布的问题。

## 身份与安全

PBKDF2随机盐600000轮；人类登录返回不透明随机会话，只存摘要，有效八小时。Agent用户不能密码登录；管理员签发随机256位Token，只返回一次，数据库存SHA256，绑定用户、拍卖、read/bid权限、到期、吊销。认证时数据库锁Token及分钟窗口计数，固定分钟额度配置。Agent不能管理、列举拍卖或读钱包。前端一次显示可隐藏，不持久保存Agent明文。生产需TLS与私密配置，当前不声称完成互联网加固。

## 验证与已知边界

真实MySQL并发、锁跨截止、相等边界、三次延时、同请求重试、多场钱包、重复结算、资金回滚、进程死亡、20人HTTP、Agent授权与浏览器断线均有自动化。完整命令及结果见最终报告。

接收门排队语义、每秒轮询、最多100场扫描/每页200事件、钱包最近200条展示、未清理过期会话/限流历史均是当前容量或产品边界。没有负载SLA、跨地域时钟保证、生产账号引导或灾备恢复演练。多实例一致性通过同库不同服务对象并发验证，不冒称已执行两个完整容器的网络故障演练。

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
## 2026-10-17 钱包与异步界面修复

钱包接口以同一个 MySQL REPEATABLE READ 只读查询事务读取余额、最近200条本人流水及本人各场冻结，返回钱包 version 和 server_time。资金写入事务、锁顺序及历史流水不变。

前端以登录会话代次、房间选择代次、auctionId 和单场 seq 防止旧响应覆盖当前状态；钱包按本人 user_id 和单调 version 接受响应，每秒独立同步。出价接受仅代表请求提交成功；领先状态来自权威快照，最终赢家仅来自 FINISHED 的成交记录。流水显示拍卖、请求关联及有符号变化，冻结与扣款明确区分；本场汇总仅统计已加载的最多200条流水。
# 2026-10-18 验证补充

本轮不更改AuctionService的出价/钱包/结算写入及锁顺序。200人短时突发首轮触发Hikari获取连接5秒超时，连接池仍固定8，等待上限调整为30秒；不等于扩大吞吐容量或解决无限排队。独立测试仍每请求15秒超时，失败停止递增加压。后台受理与客户端超时可以分离，失败传输必须原requestId恢复。HTTP创建拍卖先以long验证时长1..86400，再转int，避免超大值变500。

BoundaryIT用实际MySQL两连接反序钱包锁得到1213，再升序成功；应用重试/耗尽测试的1213另为显式注入，两者证据不混淆。截止前/等于/后1微秒以持久请求时间构造；接收时刻仍为取得intake锁后的数据库时间。压力与新增浏览器场景见BOUNDARY_TEST_REPORT与STRESS_TEST_REPORT；数据库迁移和既有账务未重置。
# 2026-10-18 风险闭环设计补充（最新）

保留原资金事务与锁顺序。出价每次重试仍从 `Database.transaction` 获取新逻辑连接、开启新事务；SQL异常先rollback再close，不复用失败事务。1213/1205最多三次；1062仅在持久接收记录的唯一键竞争阶段允许重试，资金处理阶段重复键直接失败。业务拒绝/非法输入及其他SQL错误不盲目重试。耗尽后接收记录可保持PENDING，由正常扫描器重放；恢复前价格与资金不能有半完成效果。

真实端到端测试通过包内测试钩子取得当前事务连接，仅在隔离库建立 `deadlock_probe`：应用持有auction/钱包锁并已写资金，阻塞连接持有probe行且更新200行增加事务权重，再等待应用auction；应用等待probe形成真实环。MySQL选择较轻的应用事务为受害者；原始驱动1213/40001直接传回生产重试循环，不注入SQL异常。测试检查新逻辑连接、上次资金写入已回滚、一次冻结/出价/扣款及扫描恢复。此构造证明被选中受害后的正确性，不代表生产正常锁顺序自然出现此环。

管理员专用 `GET /api/v1/admin/metrics` 提供进程生命周期计数、固定桶累计直方图、Hikari活动/空闲/等待/总连接以及JVM heap/CPU。普通用户、Agent及匿名均不得读取；不记录身份、Token、密码、SQL参数。指标只作运行观测，不是MySQL账务事实。获取连接耗时包含Hikari开销；拍卖/钱包FOR UPDATE语句耗时包含网络、执行和锁等待，不能当作纯锁等待时长。测试账号只读采集MySQL全局Innodb_row_lock_*，属于共享容器总体，不能独占归因某档；同时请求Innodb_deadlocks，但本环境未导出该状态项，不能将缺失当作0。应用捕获的1213另以进程计数记录。

指标重启归零，采样可能漏掉瞬时峰值；CPU不可用时-1。HTTP时延只涵盖统一route包装器，OpenAPI静态路由与健康路由不纳入。出价接受/拒绝是响应次数（含幂等重放），settlement.attempts包括无操作扫描与取消，failures也包含业务异常。连接池超时计数仅应用connection()路径，不统计Flyway直接取连接。指标未引入额外服务、数据库表或任意标签，内存有界。
# 生产安全加固补充（2026-10-18）

以下补充不改变出价、资金或结算事务。V4为auth_sessions增加撤销时间/原因，新增security_bootstrap、login_windows、security_audit；V1–V3保持原校验和。

- 生产Runtime仅校验迁移，独立受信任Migration进程迁移/引导；生产不创建演示账号或拍品。管理员引导CLI采用256位随机摘要、10分钟、单行锁及原子消费，成功后摘要清空；审计不含凭据。开发种子仍幂等。
- MySQL共享全局→来源→账号窗口先准入再哈希，生产每分钟200/40/10次；每实例4个哈希槽。来源使用socket地址，忽略XFF；代理后会聚合限流，真实客户端可信链识别尚未实现。
- 人类会话持久吊销：退出当前、管理员撤销目标用户全部、换密原子吊销全部旧会话。区分过期/撤销；重启不恢复已吊销会话。已进入业务的请求不作中途取消承诺。Agent Token保持独立授权和生命周期。
- 生产Runtime有schema SELECT；仅实际业务表INSERT、真实更新表UPDATE、会话/限流表DELETE。流水/出价/成交/事件/安全审计不可UPDATE或DELETE。auction_intake为MySQL锁定读取保留UPDATE。权限升级只增授权，旧权限收窄须DBA复核，不能宣称已自动撤销。
- 独立production Compose只暴露HTTPS入口，内部数据库/后端无宿主映射。证书只读挂载，无证书失败关闭；本地CA测试不代表真实公网证书。数据库Docker内部JDBC仍未启用TLS，不能推导出数据库链路加密。
- 隔离备份适配器AES-256-GCM、独立只读身份/密钥、拒绝覆盖、恢复到新库后校验迁移及资金；实际生产schema、异地保留、Windows ACL和运维告警仍需补齐。容器扫描有严重/高危公告残留，公开上线门禁FAIL。

实现、测试和真实限制见PRODUCTION_HARDENING_REPORT.md；最终指标及源码哈希见docs/PRODUCTION_HARDENING_20261018.json。以下为历史设计，冲突时以上述最新实现和报告为准。

---

# 生产登录账号规范化补充（2026-10-18）

登录准入先对全局和来源窗口加锁计数，随后用与凭据查询相同的 MySQL 邮箱比较解析用户 ID。已有账号的限流键为用户 ID，同一账号的大小写及重音别名共享额度；不存在账号的键为规范化邮箱，仍受全局及来源父窗口限制。成功登录在会话创建事务中清除该用户 ID 的账号窗口。避免数据库身份比较与应用字符串比较不一致造成额度绕过；真实隔离 MySQL 修复前后探针与新增 SecurityIT 断言见测试报告。

---
