# 生产安全加固最终验证（2026-10-18 20:12:49+08:00，当前状态）

本轮完整回归 STABILITY_EXTENDED=resume100 node scripts/test-isolated.mjs 实际退出0；其后按最新源码补跑安全与全量短档回归，具体命令和日志见本节追加记录。最新后端单元4、真实MySQL集成44，失败/错误/跳过均0；前端7测试、vue-tsc类型检查及Vite构建退出0。HTTP49、20人模拟65断言、Edge多会话/异步状态/断线恢复、Agent权限及四档短时压力通过。真实应用死锁与连接池超时用例仍保留，SQL资金对账无差异。

持续负载分别完成20用户600秒、50用户1800秒、100用户3600秒。20档来自本轮较早完整运行（仅后续压力夹具失败），50档来自随后运行（100档中断），100档在本次最终全量中恢复执行；不能宣称一次进程连续跑完三档。完成摘要、实时SQL、源码/配置/日志SHA256见docs/PRODUCTION_HARDENING_20261018.json，不用历史评测基线替代本轮。共享Windows主机与开发登录模式的结果不认证生产登录配额或容量/SLA。

生产加固：一次性管理员CLI、生产禁种子、数据库登录准入/有限哈希并发、持久会话吊销/换密、Migration/Runtime分离、本地校验证书的TLS入口、隔离加密恢复及运维探针均有本轮证据。独立生产Compose使用精确逐表权限完成双领先者/差额冻结/成交/取消，运行账号不能改写追加表。生产环境文件生成器不覆盖旧配置、不打印秘密；UTF-8/UTF-16LE发布扫描阻断探针通过。

**生产公开上线：FAIL。** 生产MySQL镜像仍有4严重/35高危公告命中；后端37、前端/入口各2公告未闭合。容器扫描实际退出1，不能写为通过。真实公网域名/证书/续期/服务器、异地备份及外部告警BLOCKED。生产schema备份适配/保留、Windows ACL、生产SQL定时核对、数据库链路TLS、旧账号权限收窄、密码找回和灾难恢复NOT VERIFIED。正式录屏、本人讲解/临时修改及评测外部提交OUT OF SCOPE，未执行。GitHub最新状态以GITHUB_RELEASE_REPORT.md最新实核为准。

---

#以下保留此前审计与失败记录；其中历史的当前状态、未执行说明或较旧测试数量不代表本轮最终状态，最新结论以上方及本轮脱敏证据为准。

 功能独立复核（2026-10-18 上线前审计）

## 生产加固本轮补充

此前功能结果保留。新增一次性管理员CLI、生产禁止种子、DB持久登录限流、退出/管理员/换密撤销、会话过期区分、Runtime权限、加密恢复、本地TLS和独立生产Compose演练。对应实现、命令、失败及边界集中在 PRODUCTION_HARDENING_REPORT.md，最终全量结果以 TEST_EXECUTION_REPORT.md 最新节为准。原出价、冻结、延时、幂等和结算模块未重构。新增API已写入OpenAPI，前端只改退出行为，不改三栏UI。

普通开发压测首轮因生产哈希槽误用于开发模式而收到LOGIN_BUSY，已修正为仅生产严格限制，不削弱原压力断言。新增Java HTTP测试须显式HTTP/1.1；默认升级行为出现连接重置，失败保留，不能假装首次全量已通过。公开上线安全门禁仍FAIL；人工录屏/讲解/外部提交OUT OF SCOPE。

依据原始Markdown及PDF五页逐条核对，历史结果不作为本轮通过证据。最新实测计数及日志哈希集中在 `docs/PREFLIGHT_RUN_20261018.json`，执行情况见TEST_EXECUTION_REPORT最新节。源代码路径均相对仓库根。

| 要求 | 实现/接口 | 本轮验证入口 | 判断边界 |
|---|---|---|---|
| Vue3/TS可操作页面 | frontend/src/App.vue、components/*；room.ts | Vitest room/health；browser-check.mjs | 不只依赖API脚本；真人能力不由自动化证明 |
| Java17/Solon3/MySQL8 | backend/pom.xml、Application、Database、compose.yaml | 构建、健康、DatabaseIT | 无Redis；MySQL唯一权威 |
| 自动迁移/种子 | database/migrations/V1–V3、DemoSeeder | DatabaseIT migrationHistory、repeatedAndConcurrentSeeds、twoRealProcessStarts | 不重置已有钱包；演示DRAFT不启动倒计时 |
| 登录/身份/权限 | Api.login/authenticate/human/admin/permit | HTTP边界、模拟、浏览器会话切换 | 客户端退出不是服务端会话吊销，见安全报告 |
| 状态机/创建/开始/取消/加入 | AuctionService.create/start/join/finishTransaction | AuctionIT、BoundaryIT transitions、browser admin流程 | SETTLING通常在事务内不可见，明确测试遗留SETTLING |
| 100/10/180/1000 | V1默认值、Api/DemoSeeder/createUser | DatabaseIT、BoundaryIT金额/模拟 | 非浮点；单次出价上限9万亿 |
| 严格截止 | bid_requests.received_at；place received.isBefore | receiptMicrosecondBeforeEqualAndAfterDeadline、intakeLock、跨锁等待 | 接收定义为取得数据库接收门后，不是HTTP首字节；隐藏脚本解释风险保留 |
| 幂等与并发 | (user_id,request_id)主键、指纹、auction_intake/行锁 | concurrentDuplicate、competingUsers/sharedWallets、HTTP并发Token重试 | 用户全局requestId；不同载荷409；不能只查再判断 |
| 冻结/释放/差额/拒绝无副作用 | wallets/holds、money条件UPDATE、effect_key唯一 | differentialRelease、exactFunds、回滚及SQL对账 | 多表关系由同一事务保证，CHECK不是跨表求和 |
| 最后5秒延10秒最多3次 | place最新end_at同事务更新 | extendsThreeTimes、concurrentSnipes、thirdExtensionRaceAndRollback | 上限后仍可接受合法出价 |
| 自动唯一结算/无人/取消/恢复 | Api定时扫描、finish、auction_results主键 | restartScanner、processDeath、settlementFailure、concurrentExecutors | 真实进程中断不等于宿主断电 |
| 通知失败不撤账/seq/重连 | event同事务持久化；events/snapshot；room.ts | 模拟、浏览器离线、旧快照/HTTP延迟 | 每秒轮询等价实时方案；私有拒绝可形成公共seq缺口，取快照 |
| 钱包/流水/用户隔离 | Api.walletSnapshot重复读事务；sessionEpoch/roomEpoch/version | privateWalletSnapshot、旧钱包跨登录响应浏览器测试 | 已有UI三栏/字体/独立滚动也在浏览器检查 |
| Agent摘要/一次返回/授权/到期/吊销/限流 | Api.issue/authenticate/permit；V1 tokens/scopes/rate_windows | simulate-auction、http-boundaries、browser Agent签发隐藏吊销 | 管理API可配策略，UI当前固定策略；隐藏不是吊销 |
| Agent不能管理/访问私有数据 | human/admin拒绝Agent，指定auction scope | HTTP401/403/429及Agent子进程 | 示例脚本对非200退出，不宣称智能模型/自动退避 |
| OpenAPI路径/结构 | backend/src/main/resources/openapi.json；Api.register | 模拟必需路径及实际HTTP读取 | JSON文档，无内置Swagger UI |
| 20人同场/并发/重试/延时/结果 | scripts/simulate-auction.mjs、HttpSimulationIT | 输出SIMULATION_SUMMARY和SQL | 可通过auctionId选择专用短时测试场，不向原演示库负载 |
| 文档/环境/测试/发布 | README、DESIGN、DECISIONS、DEBUG_LOG、AI_USAGE、AGENT_TOOL_SPEC | 文件树、命令与发布核验 | AI_USAGE不伪造本人决策/比例；早期全过程历史NOT VERIFIED |

所有自动化项是否PASS以本轮最终完整回归证据为准；`FINAL_RELEASE_AUDIT.md`不把尚在执行/未执行项描述通过。录屏、本人现场讲解/临时修改及外部提交OUT OF SCOPE；线上部署、隐藏评测结果、本人独立能力NOT VERIFIED。

## 源码审查与最小修复

完整读取Api/AuctionService/Database/AppConfig/DemoSeeder/Sql/PasswordHasher、三份迁移、Vue主组件/核心状态/展示组件、Compose/Dockerfile/nginx及集成脚本。保留已验证资金锁序，不重构核心。

发现并修复：新克隆运行字体截图测试时父目录可能不存在，browser-check现在先递归创建；账务无变化。移除App.vue两个在组件拆分后不再引用的格式化函数；未删除重要文档/脚本。安全配置与依赖修复见SECURITY_AUDIT_REPORT。

## 测试质量与限制

并发/结算使用真实MySQL，断言唯一效果、回滚、资金汇总，不用内存Mock冒充数据库。真实死锁用测试钩子建立实际两连接环，确认驱动1213/40001后传播生产重试；另有异常注入用例，不混为一谈。Vue单测覆盖状态决策纯函数，浏览器补真实交互；不能宣称单元测试已覆盖所有展示组件。轮询/快照存在额外读取成本，未完成生产大规模推送。服务端接收时间契约与网络入站时间区别需评审知悉；不改规则掩盖边界。
