# 2026-10-18 风险闭环最新状态

本节为2026-10-18风险闭环最新状态，取代下方历史当前结论，但保留旧日志和失败。最终 `node scripts/compose-verify.mjs --integration` 退出0：后端4单元、36真实MySQL集成（AuctionIT15、BoundaryIT11、DatabaseIT7、HttpSimulationIT1、StabilityIT1、StressIT1），失败/错误/跳过0；前端7、HTTP49、模拟65断言、Edge多会话及四档压力通过。脱敏指标与原始日志哈希见docs/RISK_RUN_20261018.json。

| 风险/要求 | 状态与证据 |
|---|---|
| 真实MySQL应用死锁重试及耗尽恢复 | PASS：BoundaryIT真实4次1213/40001，旧领先释放与新冻结回滚/新事务重试、tick恢复、幂等与唯一成交；final-run.log REAL_APP行 |
| 不盲目重试业务或不可恢复SQL | PASS：BoundaryIT处理阶段1062/1146与非法输入/低价断言，接收唯一键范围才重试1062 |
| 池状态/获取耗时/超时与SQL故障 | PASS（所列范围）：管理员metrics/固定桶、DatabaseIT真实30秒耗尽、StabilityIT实际采样与全局锁等待；纯等待归因和未导出的全局死锁数NOT VERIFIED |
| 持续多房间资金正确性 | PASS（有界）：20用户120秒、50用户300秒，5秒实时SQL及最终唯一结果/扣款；非10/30/60分钟验收 |
| 前后端/核心业务/Agent/Compose/四档压力 | PASS：本轮4/36/7、HTTP49/模拟65/Edge与逐档SQL，详细原需求映射继承下方并引用本轮证据 |
| GitHub当前发布 | 以GITHUB_RELEASE_REPORT最新节实际推送/独立克隆为准，不沿用旧提交 |

NOT VERIFIED：建议的20用户10分钟、50用户30分钟、100用户60分钟及多机/生产容量；纯锁等待的逐请求归因；完整容器网络分区、宿主机断电、生产TLS/管理员安全引导/登录限流完善性、全面渗透、早期全过程Git历史及可选线上部署。OUT OF SCOPE：正式录屏、本人现场讲解/临时修改、评测方外部提交，均未执行。

---

# 2026-10-18 当前验证状态补充（优先于历史状态）

本节为2026-10-18当前结果，优先于下方保留的历史“当前”声明。完整回归结束于11:05:03+08:00，命令 node scripts/compose-verify.mjs --integration，退出0：后端单元4/4、真实MySQL集成32/32（AuctionIT15、BoundaryIT9、DatabaseIT6、HttpSimulationIT1、StressIT1），失败/错误/跳过均0；前端7/7及TypeScript/Vite生产构建通过。HTTP边界49项、20人seed42模拟65断言、Edge多上下文及20/50/100/200人四档压力全部通过。公开脱敏计数、压力指标和原始日志SHA256见 docs/BOUNDARY_RUN_20261018.json；原始日志保留本地，不发布。

| 原始要求范围 | 当前状态及证据 |
|---|---|
| P1 工程/数据/启动 | PASS：最终Compose构建启动、Flyway与幂等种子重启比较、前后端构建；final-run/build/up日志 |
| P2 竞价、钱包、幂等、截止/延时 | PASS：AuctionIT15、BoundaryIT9、HTTP49及四档逐档SQL；具体测试名见BOUNDARY_TEST_REPORT |
| P3 结算/重启/竞争 | PASS（已测范围）：105场/3执行器唯一成交、原恢复测试、真实1205与真实死锁1213；不等同断电或双完整容器分区 |
| P4 实时/界面/Agent | PASS（已测范围）：Edge门控旧响应、双上下文断网恢复/延时、动态赢家与资金；65模拟断言、49HTTP检查、摘要与动态Token泄漏检查；采用事件轮询 |
| P5 测试/文档/发布 | 测试与文档PASS；远端本轮状态见发布报告最新节，不能沿用旧发布声明 |

每个PASS仅指所列自动化证据覆盖的范围，原逐项矩阵及历史记录保留如下。

NOT VERIFIED：真实死锁受害业务事务自动重试端到端链（实际MySQL两连接死锁1213已复现；应用重试含明确注入测试）、每档连接池等待时长/锁等待与死锁计数、长时间及多机容量、完整容器网络分区、宿主机断电、生产TLS/管理员引导/登录防护完善性、完整安全渗透、早期全过程Git历史与可选线上部署。OUT OF SCOPE：正式录屏、本人现场讲解/临时修改、评测方外部提交，均未执行。不能据此宣称原始评测全部通过。

---

# 最终验收矩阵

## 当前冻结证据（2026-10-17，本节优先于历史时间）

本轮最终回归20:46:45+08:00退出0：单元4、真实MySQL集成21、前端5、20人seed42模拟65断言、Edge关键场景及SQL对账通过。生产代码仍为e13339b；唯一代码库行为变更是浏览器测试增加显式状态/列表响应同步及断言，验收提交8bf8b4512f85be67b2ec184e421a837cb05c5db4。之后只补交付文档。最新原题P1–P5详表中的运行PASS以.local/freeze-tests-retry.log重新验证；不再仅依赖20:31历史结果。

| 冻结复核项 | 状态 | 本轮证据/局限 |
|---|---|---|
| 技术栈、构建、迁移、种子、前后端、竞价资金幂等延时结算、权限、实时恢复及模拟 | PASS | config/build/up均0；T完整回归0；4/21/5及65；真实SQL与浏览器通过，详见TEST_EXECUTION_REPORT冻结附节 |
| 初次冻结套件失败 | FAIL | .local/freeze-tests.log退出1，浏览器列表按钮超时；这是保留的首次结果，不是最终套件状态 |
| 测试同步修正后的完整套件 | PASS | .local/freeze-tests-retry.log退出0；新增列表内容断言，未删除旧断言；超时唯一根因不能仅凭旧日志完全确定 |
| 当前运行、代理、OpenAPI与种子重启 | PASS | 三healthy，四HTTP200，health database=UP，种子快照逐字一致 |
| 远端发布与敏感信息 | PASS | 独立克隆/最终全树比对及全历史审计，见GITHUB_RELEASE_REPORT；扫描不证明所有未知秘密不存在 |
| 实际死锁环 | NOT VERIFIED | 1205真实锁超时通过；1213为注入，不是实际死锁复现 |
| 完整容器网络分区、宿主机断电、大规模压力 | NOT VERIFIED | 没有相应演练；同库多执行器、halt73恢复及20人不等价 |
| 生产TLS、管理员引导、登录防护 | NOT VERIFIED | 生产能力已知不完善，当前仅loopback演示验收，不直接公开部署 |
| 全过程早期Git历史、本人设计归属 | NOT VERIFIED | 不补造历史，不代签人工决定 |
| 可选线上部署 | NOT VERIFIED | 未执行 |
| 正式录屏、本人现场讲解/临时修改、评测方外部提交 | OUT OF SCOPE | 用户明确不要求，均未执行，不算原题评分已通过 |

没有待人工解除的外部BLOCKED；最终未发现未处理的严重业务缺陷。浏览器同步修正后已完整通过，仍不能据一次复测证明永不波动。最终交付说明见FINAL_HANDOFF.md。下方保留此前矩阵及需求展开历史。

## 此前矩阵（保留历史）

依据原始《全栈评测-拍卖间.md》逐项核对。原阶段1矩阵已保存在 Git 初始快照2503d71，原始审计未改。PASS只表示所列验证范围，不代表外部隐藏测试或本人能力已通过。

命令 C：docker compose config --quiet / build / up -d --wait / ps；T：npm run test:compose（包含前端5项、后端4项单元及真实MySQL集成、20人模拟、Edge浏览器）；S：node scripts/verify-secrets.mjs。原生历史结果见 docs/STAGE1_VALIDATION.md，以下为最新容器MySQL验收。

| 编号 | 需求/业务规则 | 模块/实现文件 | 自动化验证/命令 | 实际证据与状态 | 风险/依赖 |
|---|---|---|---|---|---|
| R01 | Vue3/TS/Vite可操作页面 | frontend/src/App.vue,package.json | T构建及浏览器 | PASS：登录/加入/出价/管理/钱包实际操作 | 依赖Node与Edge |
| R02 | Java17/Solon3.x | backend/pom.xml,Application.java | C构建、T | PASS：Solon3.10.7依赖树、Java17构建 | banner版本不代替依赖树 |
| R03 | MySQL8唯一事实源，无非必要基础设施 | Database.java,compose.yaml | T真实MySQL8.4、SQL核对 | PASS | 未做负载SLA |
| R04 | Compose自动迁移及种子 | DemoSeeder,V1–V3 | C、compose-verify.mjs | PASS：三迁移成功、三用户三初始流水，共3000 | 首次镜像需网络 |
| R05 | DRAFT→RUNNING→SETTLING→FINISHED及取消 | AuctionService.finish/start | AuctionIT及browser T | PASS：取消释放、终态不可取消、唯一结果 | SETTLING事务内短暂状态 |
| R06 | 100/10/180/1000，首价110 | schema,seeder,service | DatabaseIT/AuctionIT T | PASS | 短时拍卖仅显式配置 |
| R07 | 严格早于截止，相等拒绝 | durable intake/place | 相等PENDING及跨锁截止测试 T | PASS | 接收定义是取得接收门后数据库计时 |
| R08 | 差额冻结、余额非负 | wallets/holds/money | 同人差额、资金不足、SQL对账 T | PASS | BIGINT整数 |
| R09 | 新领先冻结、旧领先释放、失败无资金副作用 | place,money | AuctionIT及20人 T | PASS | 拒绝仍写私有事件 |
| R10 | requestId只生效一次、参数冲突 | bid_requests主键/指纹 | 六并发重复及HTTP409 T | PASS | 用户全局范围、ASCII1–64 |
| R11 | 并发同价唯一领先、跨场共享钱包 | 拍卖锁/有序钱包锁 | AuctionIT T | PASS | 有限死锁重试三次 |
| R12 | 失败事务完整回滚 | Database.transaction | 资金写后异常注入 T | PASS | 注入点不是每条SQL穷举 |
| R13 | 最后5秒+10，最多3次且上限后可出价 | place | 顺序与并发延时、HTTP狙击 T | PASS | 依赖MySQL UTC时钟 |
| R14 | 服务端自动结算、无人不扣款 | tick/finish | 空拍卖、HTTP自动结束 T | PASS | 扫描1秒、每批100 |
| R15 | 重复/并发结算唯一扣款/结果/流水 | result PK/effect unique | 四执行器并发及重复tick T | PASS | 同库多个对象，未双完整容器故障演练 |
| R16 | 结算进程停止后重启恢复 | finish持久事务 | 子进程halt73后SQL检查与新执行器 T | PASS | 未进行宿主机断电演练 |
| R17 | 钱包、流水、hold、成交一致 | wallet_transactions | 直接SQL核对所有测试钱包 T | PASS | 积分扣款非真实支付 |
| R18 | 用户/钱包/拍卖/参与者/出价/成交/Token最低模型 | migrations | DatabaseIT精确表集、约束 T | PASS：16应用表 | 无跨表CHECK，事务维护 |
| R19 | 所有必需HTTP能力及OpenAPI | Api.java,openapi.json | HTTP模拟T、17路径实际GET | PASS | 文档响应为通用结构部分 |
| R20 | 必需事件字段、单场递增seq | event,snapshot,events | HTTP字段/顺序 T | PASS | 连接状态/快照为水位而非新业务序号 |
| R21 | BID_REJECTED仅本人 | visibility/user_id过滤 | 两用户事件隐私断言 T | PASS | 私有seq造成他人缺口 |
| R22 | 通知失败不回滚、丢消息重新快照 | 持久事件轮询/room.ts | 浏览器offline/reconnect、核心交互T | PASS | 等价轮询，非WebSocket连接 |
| R23 | 登录、角色及私人钱包隔离 | Api.authenticate/human/admin | 真实HTTP模拟T | PASS | 生产登录限流未实现 |
| R24 | Agent独立凭据/范围/权限/到期/吊销/限流 | tokens/scopes/rate | HTTP授权、401/403/429 T | PASS | 固定分钟窗口非滑动窗口 |
| R25 | 摘要存储/仅签发一次返回/不提交凭据 | issue/UI/gitignore | SQL LENGTH(digest)、S | PASS | 实际录屏仍需人工检查 |
| R26 | 20人、seed42、并发/重复/资金不足/迟到/延时/重连/最终核对 | simulate-auction.mjs,HttpSimulationIT | T | PASS：摘要及SQL对账 | 默认仅隔离演示环境 |
| R27 | 至少一个Vue核心交互测试 | room.test.ts | T前端测试 | PASS：前端共5项 | 非全页面覆盖率 |
| R28 | .env.example、一键测试、管理员/两真人、DRAFT演示 | setup-env/README/compose | C、T重启对比 | PASS：DRAFT end_at NULL、余额不变 | 测试脚本默认3307/5173 |
| R29 | README完整可复制演示路径 | README,DEMO_RUNBOOK | 实际命令+浏览器T | PASS | 五分钟取决于首次下载 |
| R30 | DESIGN/DECISIONS/DEBUG_LOG/AGENT_TOOL_SPEC | 根目录文档 | 文件及对应代码核对 | PASS | 外部模型Agent接入未声称已做 |
| R31 | AI_USAGE含本人决策、分工、可独立解释范围 | AI_USAGE | 文档已记录Agent事实与待确认项 | NOT VERIFIED | 本人必须确认三项设计与独立讲解，不能代签 |
| R32 | 有意义的真实开发历史 | Git | git log/status | NOT VERIFIED：原目录无Git，本次仅真实快照与后续验收提交 | 不可重建不存在的逐步历史 |
| R33 | 3–5分钟录屏 | docs/DEMO_RUNBOOK | 未制作 | OUT OF SCOPE | 用户明确不要求本次交付 |
| R34a | GitHub发布 | origin/master | 推送及独立克隆文件检查通过 | PASS | 见GITHUB_RELEASE_REPORT |
| R34b | 姓名联系方式及邮件提交 | 外部交付 | 未执行 | OUT OF SCOPE | 用户明确不要求本次交付 |
| R35 | 可访问线上地址（加分） | 外部部署 | 未部署 | BLOCKED | 需服务器/域名/凭据授权 |
| R36 | 现场无Agent讲解/临时变更核验 | 本人 | 未进行 | OUT OF SCOPE | 用户明确不要求本次交付 |

所有本地PASS的详细结果和命令退出码见 FINAL_ACCEPTANCE_REPORT.md；原始需求未因外部阻塞删减。当前不宣称整个评测已经通过。

## 2026-10-17 最终收尾最新状态（取代此前外部交付待办描述）

本轮实际重新执行 docker compose config --quiet、docker compose build、docker compose up -d --wait、node scripts/compose-verify.mjs --integration，全部退出0。完整回归结束20:16:12+08:00：后端单元4、真实MySQL集成18、前端5、20人模拟59项断言通过；Edge三上下文及SQL资金对账通过。新增独立auction-agent子进程真实出价110和取消后退出0，不再只是语法检查。历史57项是上一轮结果，予以保留。

种子重启快照一致：3用户、3条初始流水共3000、钱包各1000/0、演示DRAFT且end_at为空。测试仅使用容器3307随机隔离库，不修改本机3306。完整本地日志：.local/release-tests-final.log；构建及启动日志：.local/release-build.log、.local/release-up.log，均不发布。

状态分类：A PASS为上述本地核心、容器和自动化；GitHub发布以GITHUB_RELEASE_REPORT.md中实际推送和远端文件核验记录为准。B FAIL：最终回归无剩余失败，历史失败保留。C NOT VERIFIED：全过程开发历史、宿主机断电/大规模性能/双完整容器网络分区、可选线上部署。D BLOCKED仅用于实际外部阻塞，不把跳过人工环节视为阻塞。E OUT OF SCOPE：正式录屏、本人独立讲解/现场修改、评测方邮件/个人资料/外部提交，用户明确不要求本次交付，均未执行，不能宣称原始评测全部通过。

发布安全命令：node scripts/audit-release.mjs 与 node scripts/verify-secrets.mjs；扫描全部可达Git历史、跟踪文件及本地日志，不输出凭据值。真实.env、.local和日志截图不上传。HTTPS默认多账号凭据选择失败后选用现有weikelai GCM账号，dry-run通过；未要求提供Token或伪造历史。架构和已通过业务逻辑本轮未重构。

本节明确取代旧文档中“远端未授权”“独立Agent仅语法检查”“本人必须完成录屏/外部提交”的当前状态描述，旧文字保留作历史。AI完成本轮安全扫描、Agent脚本验收、自动化回归及发布整理，不代表本人独立设计能力已核验。仓库：https://github.com/weikelai/bid-arena 。
## 全面验收重新提取的证据矩阵（2026-10-17，本节优先）

原题没有连续编号，以下以PDF页码/章节及规则号作稳定定位，并展开本轮新增边界。完整命令、退出码、数据库SQL与日志集中于TEST_EXECUTION_REPORT。历史R表保留，不将其旧PASS自动视为本轮结果。

证据命令：C=`docker compose config --quiet; docker compose build; docker compose up -d --wait`，均0；T=`node scripts/compose-verify.mjs --integration`，修复后的attempt2退出0；S=`node scripts/audit-release.mjs; node scripts/verify-secrets.mjs`，以最终安全结果为准；G=`git ls-remote`加独立克隆fetch/ls-tree/show。T内部真实执行前端test/build、Maven verify -Pmysql-it、simulate-auction与Edge浏览器。最终新增凭据检查结果在执行报告追加。以下PASS依据attempt2已实际结果，最终回归若失败必须覆盖。

| 原题定位/编号 | 原始要求及验收条件 | 源代码 | 测试名/关键断言 | 命令/退出码 | 数据库核对/证据 | 状态 | 风险/剩余 |
|---|---|---|---|---|---|---|---|
| P1 技术-前端 | Vue3/TS可操作界面 | frontend/src/App.vue,package.json | vitest5、vue-tsc、Edge三用户操作 | C/T 0 | comprehensive-build-final、tests-attempt2 | PASS | 非全UI路径覆盖 |
| P1 技术-后端 | Java17/Solon3 HTTP | pom.xml,Application,Api | JAR真实启动/HTTP模拟 | C/T 0 | DatabaseIT启动两次 | PASS | 手动组装服务依赖；非复杂分层 |
| P1 技术-数据 | MySQL8唯一事实/自动迁移 | Database,migrations V1–V3 | migrationHistoryIsVersionedAndAllTablesUseInnoDb | T 0 | 16表、checksum失败检测/InnoDB | PASS | 不用Redis |
| P1 交付 | Compose一键三服务 | compose.yaml,Dockerfile | config/build/up-wait，三healthy/代理 | C/T 0 | 3307/8080/5173，日志和HTTP | PASS | 首次联网下载未保证5分钟 |
| P2 状态机 | DRAFT/RUNNING/SETTLING/FINISHED及取消限制 | AuctionService | settlingCannotCancelAndFinishedCannotBid；rejectsAndIdempotencyPreserveMoney | T 0 | 非法状态无bid/资金流水 | PASS | SETTLING中间态通常同事务不可见 |
| P2 规则1 | 100/10/180/1000，无出价当前100 | V1,DemoSeeder,Api.create | repeatedAndConcurrentSeedsIssueExactlyOneInitialCredit | T 0 | 默认值、3钱包、DRAFT end NULL | PASS | 允许测试自选短时拍卖 |
| P2 规则2/5a | 差额冻结/可用余额 | place,money | differentialReleaseAndUniqueCapture | T 0 | 120hold、差额10、旧hold0 | PASS | 积分非支付 |
| P2 规则5b | 余额不足/低价/失败不改资金 | place | rejectsAndIdempotencyPreserveMoney，HTTP low/funds | T 0 | bid0/资金变化0；CHECK total>=frozen>=0 | PASS | 拒绝有私有事件及请求终态 |
| P2 规则4a | 顺序及并发requestId一次效果 | bid,bid_requests PK | concurrentDuplicateProducesOneBid，HTTP四重放/金额冲突409 | T 0 | bid1、FREEZE1，replayed | PASS | 唯一范围(user,request)，跨场冲突 |
| P2 规则4b | 同价/相邻价竞争唯一领先 | place/钱包排序锁 | competingUsersAndSharedWallets，HTTP same/adjacent race | T 0 | 最高相邻价成功，单场正hold1 | PASS | 顺序由数据库接收门决定 |
| P2 规则5c | 跨场共享钱包不超花 | lockWallets,money | competingUsersAndSharedWallets | T 0 | 钱包=hold=流水汇总 | PASS | 未做大规模压力 |
| P2 规则3 | 截止前/相等/之后 | bid接收门/place | durableReceiptSurvivesLockWaitAcrossDeadline；deadlineEqualIsRejectedAndRestartScannerFinishesEmptyAuction；HTTP late | T 0 | 预收请求跨锁等待成功，相等拒绝/无成交扣款 | PASS | 接收定义为鉴权后取得intake门的DB时间 |
| P2 规则6 | 最新截止+10/最多3/到顶仍成功/并发不覆盖 | place | extendsThreeTimesAndStillAcceptsAtLimit；concurrentSnipesUseLatestDeadlineOnlyOnce | T 0 | deadline精确+10、extension<=3、并发仅1 | PASS | 含5秒边界以>=end-5判断 |
| P2 规则5d/6 | 资金/价格/延时/事件同事务 | Database.transaction/place | failureAfterWalletWritesRollsBackAndPendingReceiptRecovers | T 0 | 资金/流水/价格全部回滚；PENDING恢复一次 | PASS | 故障注入点为资金写后 |
| 扩展 C8 | 锁超时/死锁错误重试不重复 | bid有限3次重试 | retryAfterActualWalletLockTimeoutHasOneEffect；deadlockVictimRetryRollsBackBeforeOneAcceptedEffect | T 0 | 真实1205三次耗尽后零bid/流水，同request恢复1次；注入1213两次尝试1次效果 | PASS | 实际死锁环形成NOT VERIFIED，1213为注入 |
| P2 规则7a | 到期无人/赢家自动结算/取消释放 | tick,finish | HTTP自动FINISHED、浏览器SOLD、NO_BIDS、cancel | T 0 | 每场result1、winner余额=1000-price、hold0 | PASS | 扫描间隔1秒 |
| P2 规则7b | 重复/多执行器唯一结果/扣款 | finish,result PK,effect unique | differentialReleaseAndUniqueCapture四执行器 | T 0 | 唯一CAPTURE/result，重复无新增 | PASS | 同库独立执行器，不是双完整容器 |
| P2 规则7c | 中途停止/重启/事务失败恢复 | finish/tick | processDeathDuringSettlementRollsBackAndScannerRecovers；settlementFailureRollsBackCaptureAndNewExecutorRecovers | T 0 | halt73未提交CAPTURE0/hold110，恢复CAPTURE1/result1 | PASS | 未测宿主机断电 |
| P2 规则8/P3事件 | 通知失败不回滚、seq/envelope、私有拒绝 | event,Api.events,snapshot,room.ts | HTTP envelope/ordered/private；Edge offline/reconnect；requiresSnapshot | T 0 | 持久事件与业务同事务；断网快照恢复 | PASS | 1秒轮询等价；私有seq缺口可见但无私有内容 |
| P2–3 模型八类 | 用户/钱包/流水/拍卖/参与者/出价/结果/Token | V1–V3 | DatabaseIT constraints/表集合 | T 0 | CHECK3819/FK1452/唯一1062，16表 | PASS | 跨表汇总靠事务，非CHECK |
| P3 API | 原题12项能力/OpenAPI | Api,openapi.json | HTTP身份/业务调用，spec路径/钱包schema | T 0 | 原题路径均存在，响应补schema | PASS | 未引入完整自动JSON-schema契约引擎 |
| P3 Token | 摘要/一次返回/独立凭据/权限/范围/过期/吊销/限流 | Api.issue/authenticate/permit | HTTP read-only/bid-only、401/403/429 | T 0 | SQL摘要32字节；无取回明文接口 | PASS | SHA256不可逆为密码学设计，不能数学证明不可恢复 |
| P3 Token安全 | 不泄露Token至Git/日志/包 | audit-release,simulate | 全历史/已知凭据扫描，新增运行时凭据断言 | S及最终T均0 | .local/release-security.json、65断言 | PASS | 模式扫描不保证所有未知秘密 |
| P3–4 模拟 | 20人seed42/递增/并发/重试/迟到/延时/重连/最终核对 | simulate,HttpSimulationIT | attempt2为64断言，winner24 price370 | T 0 | 钱包/hold/流水/唯一成交/请求关联直接SQL | PASS | 隔离库，不能对原数据运行 |
| P4 Vue核心测试 | 至少一项核心交互 | room.test.ts,health.test.ts | 5项：缺口/倒计时/健康反馈 | T 0 | vitest输出 | PASS | 组件交互另由Edge覆盖 |
| 扩展 前端隔离/展示 | 退出切换不残留、历史/成交/钱包 | App.vue,browser-check | 延迟777响应跨登录、history120、SOLD/890/冻结0 | T 0 | browser-acceptance.log | PASS | 未测所有浏览器与多设备撤销会话 |
| P4 初始化 | 自动种子不重复、DRAFT不自动倒计时 | DemoSeeder,compose-verify | 并发种子、JAR两启动、容器重启快照一致 | T 0 | 初始3用户/3流水3000，无Token | PASS | 无生产管理员引导 |
| P4 README | 可复制完整演示/测试/Agent路径 | README,AGENT_TOOL_SPEC | 按命令启动、独立Agent出价110终态退出0 | C/T 0及文档核对 | tests-attempt2，浏览器 | PASS | 外部模型接入未声称验证 |
| P4 文档规范 | DESIGN/DECISIONS/DEBUG_LOG/工具契约 | 根文档 | 对照源码/真实日志静态核对 | 阅读命令0 | 保留至少2真实错误与决策取舍 | PASS | 文档存在不等于本人理解 |
| P4 AI_USAGE | 模型/分工/3项本人决定/2取舍/错误/能力边界 | AI_USAGE | 记录AI实际工作与未确认事项 | 文档核对 | 未代签本人3项决定 | NOT VERIFIED | 人工设计归属不能由自动化证明 |
| P4 Git历史 | 有意义全过程历史 | git log | 保留真实snapshot及后续行为提交 | G 0 | 无force/倒填 | NOT VERIFIED | 原早期历史不存在，不能补造 |
| P5 仓库交付 | GitHub远端代码/迁移/测试/文档齐全 | origin/master | 独立克隆检查 | G 0，最终修复同步见发布报告 | GITHUB_RELEASE_REPORT | PASS | 不改远端既有历史 |
| P4–5 录屏 | 3–5分钟正式视频 | DEMO_RUNBOOK仅可选说明 | 未制作 | 未执行 | 用户明确跳过 | OUT OF SCOPE | 不算评分已通过 |
| P5 现场核验 | 本人独立解释/临时变更 | 本人及评审 | 未进行 | 未执行 | 用户明确跳过 | OUT OF SCOPE | 不代签个人能力 |
| P5 外部提交 | 邮件/个人资料/报名 | 外部流程 | 未发送 | 未执行 | 用户明确跳过 | OUT OF SCOPE | 不外发消息 |
| P5 加分线上 | 公开访问部署 | 无 | 未部署 | 未执行 | 未提供主机/域名/部署授权 | NOT VERIFIED | 不影响本地测试结论 |
| P5 评分10分 | 架构/业务/Solon/Vue/MySQL/质量/测试/Git/Agent | 全项目与人工核验 | 不自动自评分 | 未执行评分 | 分项证据与缺口见本表 | NOT VERIFIED | 最终由评审综合判定 |
最终回归补证：20:31:00+08:00退出0，4单元/21真实MySQL集成/5前端/65模拟断言。新增凭据对后端日志及前端包逐值检查通过；上表T的最终证据为.local/comprehensive-tests-final.log。
## 2026-10-17 双用户显示修复补充

此前冻结记录保留；本次修改后的代码不再视为与8993dc0完全相同。新增核验：同场seq防倒退、房间选择代次隔离、本人钱包version防倒退、钱包/流水/hold一致快照、出价接受与最终赢家分离。实际命令及本轮结果见 TEST_EXECUTION_REPORT.md 的本轮附节。原有资金写入与结算规则未修改；真实死锁环、完整网络分区、断电及大规模性能等原有 NOT VERIFIED 项不因此升级，人工交付 OUT OF SCOPE 不变。
