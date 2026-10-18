# 生产安全加固最终验证（2026-10-18 20:12:49+08:00，当前状态）

本轮完整回归 STABILITY_EXTENDED=resume100 node scripts/test-isolated.mjs 实际退出0；其后按最新源码补跑安全与全量短档回归，具体命令和日志见本节追加记录。最新后端单元4、真实MySQL集成44，失败/错误/跳过均0；前端7测试、vue-tsc类型检查及Vite构建退出0。HTTP49、20人模拟65断言、Edge多会话/异步状态/断线恢复、Agent权限及四档短时压力通过。真实应用死锁与连接池超时用例仍保留，SQL资金对账无差异。

持续负载分别完成20用户600秒、50用户1800秒、100用户3600秒。20档来自本轮较早完整运行（仅后续压力夹具失败），50档来自随后运行（100档中断），100档在本次最终全量中恢复执行；不能宣称一次进程连续跑完三档。完成摘要、实时SQL、源码/配置/日志SHA256见docs/PRODUCTION_HARDENING_20261018.json，不用历史评测基线替代本轮。共享Windows主机与开发登录模式的结果不认证生产登录配额或容量/SLA。

生产加固：一次性管理员CLI、生产禁种子、数据库登录准入/有限哈希并发、持久会话吊销/换密、Migration/Runtime分离、本地校验证书的TLS入口、隔离加密恢复及运维探针均有本轮证据。独立生产Compose使用精确逐表权限完成双领先者/差额冻结/成交/取消，运行账号不能改写追加表。生产环境文件生成器不覆盖旧配置、不打印秘密；UTF-8/UTF-16LE发布扫描阻断探针通过。

**生产公开上线：FAIL。** 生产MySQL镜像仍有4严重/35高危公告命中；后端37、前端/入口各2公告未闭合。容器扫描实际退出1，不能写为通过。真实公网域名/证书/续期/服务器、异地备份及外部告警BLOCKED。生产schema备份适配/保留、Windows ACL、生产SQL定时核对、数据库链路TLS、旧账号权限收窄、密码找回和灾难恢复NOT VERIFIED。正式录屏、本人讲解/临时修改及评测外部提交OUT OF SCOPE，未执行。GitHub最新状态以GITHUB_RELEASE_REPORT.md最新实核为准。

---

#以下保留此前审计与失败记录；其中历史的当前状态、未执行说明或较旧测试数量不代表本轮最终状态，最新结论以上方及本轮脱敏证据为准。

 生产安全加固与部署准备（2026-10-18）

本轮基线为 `95422f85c84f07baa169586965ee57d65d87bbfe`，新增改动正常提交，最终发布记录见 GITHUB_RELEASE_REPORT.md。旧审计及失败记录保留，以下新增证据不能倒填为历史结果。

## 三类交付结论

- 本地全栈评测：核心实现保持，最终本轮回归结果见下方及 TEST_EXECUTION_REPORT.md。正式录屏、本人讲解/临时修改、评测方外部提交 OUT OF SCOPE，不能宣称原评测全部维度通过。
- 生产安全加固：一次性管理员引导、登录准入、持久会话撤销、账号分离、TLS模板及隔离加密恢复已实现并有针对性验证；运维能力仅部分完成。
- 真实公网部署：BLOCKED。没有真实域名、受信任公网证书/续期、服务器与外部备份/告警资源。当前不允许据此直接公开上线。

## 实现与边界

| 范围 | 实际实现与验证 | 状态 |
|---|---|---|
| 开发/生产分离 | APP_ENV严格枚举，生产禁止种子；缺配置/入口批准失败关闭；独立production Compose不继承开发端口 | PASS |
| 管理员引导 | 受信任CLI；256位随机摘要、10分钟、单行锁、原子消费/审计、钱包0；错密钥/过期/重放/重建服务均验证 | PASS |
| 登录防护 | MySQL全局→来源→账号有序锁；每分钟200/40/10，先限流后哈希；4个本地哈希槽；不存在账号同401；成功仅清账号窗口；饱和父窗口不新建子窗口 | PASS（最终回归见测试记录） |
| 来源可信边界 | socket地址，忽略伪造XFF；代理覆盖转发头；代理后来源聚合，未实现可信链精确客户端IP识别 | 保守限流PASS；精确来源 NOT VERIFIED |
| 会话 | DB撤销/原因，8小时；退出当前、管理员全部、换密全部；重启仍失效；每60秒有界清过期会话和窗口 | PASS；已执行中的请求不承诺取消 |
| 前端退出 | 保留epoch隔离，即时清本地；服务端失败明确提示未确认，迟到结果不污染新登录 | 浏览器回归PASS |
| 数据库权限 | Migration：目标schema SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/INDEX/REFERENCES/DROP；Runtime：schema SELECT，业务表INSERT/UPDATE，安全审计仅INSERT，会话/限流表DELETE；不许删除资金流水或写bootstrap/seed/Flyway；Test仅bid_arena_it_*；Backup只读独立身份 | Runtime真实竞价/冻结/释放/成交/事件/登录及拒绝DDL/系统schema验证见最终记录 |
| 权限局限 | SELECT仍为schema范围，非逐列隔离；现有账号不重置，--runtime增授不自动撤销历史过宽权限，升级需DBA复核 | NOT VERIFIED：外部既有生产升级与旧权限收窄 |
| TLS | 独立TLS入口8443，数据库/后端无宿主端口；TLS1.2/1.3，证书只读挂载；无明文回退；仅TLS设置HSTS，CSP/nosniff/referrer/permissions | 本地显式信任CA、hostname校验、拒绝未信任客户端及真实代理PASS；公网BLOCKED |
| 备份恢复 | AES256GCM，独立密钥/身份，128MiB有界、空间检查、忽略目录0600、拒绝覆盖；新随机隔离库Flyway/计数/资金/成交对账 | PASS：隔离适配器；生产schema适配/Windows ACL/轮换/异地/自动保留 NOT VERIFIED |
| 运维 | admin metrics已有连接池/等待/延迟/SQL锁/结算/CPU/堆；新增本地健康/磁盘/备份新鲜度/失败计数探测；生产日志10MiB×3 | 本地探针可运行；未注入管理凭据/备份路径时明确NOT VERIFIED；外部告警BLOCKED |
| 应用审计 | 引导/登录成功/撤销/换密审计不含明文凭据；异常只记类型；敏感API no-store | PASS：实现及测试；长期审计归档/生产运行保留 NOT VERIFIED |
| 依赖 | npm零漏洞；Maven41项OSV无命中 | PASS：应用公告匹配，非绝对安全证明；容器全层门禁FAIL，见下文 |

V4新增3张表、会话撤销字段；V1–V3未修改。共19张应用表及Flyway历史表。新增SecurityService不改AuctionService出价、锁、钱包或结算业务。

## 本轮命令与证据

所有日志在忽略的 `.local/` 或 `backend/target/`，未发布原始日志、备份、证书私钥、随机测试账号凭据。记录时间为本机2026-10-18，日志的ISO时间为UTC。

| 命令 | 本轮结果/证据 |
|---|---|
| `mvn -B -f backend/pom.xml test` | 退出0，4单元；`.local/security-build.log` |
| `node scripts/test-isolated.mjs '-Dit.test=SecurityIT'` | 早期3安全IT退出0；`.local/security-it-retry.log`，后续新增限流存储断言，最终数量另列 |
| `node scripts/test-isolated.mjs '-Dit.test=SecurityHttpIT'` | 退出0，1生产HTTP IT，真实Runtime身份和进程重启；`.local/security-http-retry.log` |
| `node scripts/test-isolated.mjs '-Dit.test=BackupIT'` | 退出0，1加密恢复IT；`.local/backup-it.log`、`backend/target/backup-restore.log` |
| `npm --prefix frontend test` | 退出0，7通过；`.local/hardening-frontend-test.log` |
| `npm --prefix frontend run build` | 退出0，vue-tsc类型检查及Vite生产构建；`.local/hardening-frontend-build.log` |
| `node scripts/test-local-tls.mjs` | 最终退出0；`.local/local-tls-retry3.log` / `local-tls-result.json` |
| `node scripts/test-production-compose.mjs` | 最终退出0；`.local/production-compose-retry.log` / `production-compose-result.json`，独立项目已stop、卷保留 |
| `node scripts/audit-dependencies.mjs` | 退出0，41项，0命中；`.local/hardening-dependencies.log` |
| `npm --prefix frontend audit --json` | 退出0，0漏洞；`.local/hardening-npm-audit.json` |
| `node scripts/ops-check.mjs` | 退出0，无健康/磁盘告警，但缺管理及备份配置，综合NOT VERIFIED；`.local/ops-check.json` |

完整回归、最终Compose、持续负载和发布核验在完成后追加；不得将上表针对性测试冒充最终全量验证。

## 保留的失败与修复

1. 首次Maven参数未加引号，被PowerShell拆分；退出非0，`.local/security-it.log`，加引号后通过。
2. 扩展安全IT首次5项中1个HTTP连接重置错误，非授权断言失败；`.local/security-expanded.log`。改独立连接后曾通过，但全量重跑再次出现；新增测试最终显式HTTP/1.1后针对性退出0，`.local/security-http-http11.log`，不再隐式尝试协议升级。默认Java客户端协议兼容性仍为局限，不声称服务支持HTTP/2。
3. TLS首轮本机OpenSSL默认配置缺失；后续临时CA缺少CA用途扩展导致证书用途拒绝。配置和CA扩展修正后成功；`local-tls.log`、`local-tls-retry.log`、`local-tls-diagnostic.log`保留。
4. 生产Compose首轮错误选择早期不完整证书目录，入口缺fullchain.pem失败关闭；`.local/production-compose.log` / `production-compose-failure.log`。改按最近目录选择后完整通过，未回退HTTP。
5. 首次全量42IT中1压力失败：生产哈希4槽错误用于开发16路登录，返回LOGIN_BUSY；`.local/hardening-full-regression.log`。只在production启用严格并发限制后重跑四档压力通过，未削弱断言。第二次全量43IT中1个Java HTTP连接错误，其余包括持续与四档压力通过；`.local/hardening-full-regression-retry.log`，不能将该次称全绿。
6. 初始镜像层扫描实际命中高危/严重。最小OS升级后nginx仍被未用动态模块锁定旧修订，安装补丁包失败；移除未用模块后替换同1.28.3修订r7。发行包默认nginx.conf与镜像旧配置不兼容，启动失败；新增deploy/nginx-main.conf修复。随后生产初始代理健康502，增加前端healthy依赖和有界就绪检查，最终 `.local/production-compose-readiness.log` 退出0。相关失败日志保留，未用重试掩盖断言。
7. 20用户600秒和实时SQL核对通过的同次全量，200人压测夹具15秒拍卖在负载过程中到期，返回AUCTION_ENDED而非脚本预期BID_TOO_LOW；`.local/hardening-final-regression.log` 实际43IT中1失败。吞吐夹具改60秒、结算等候90秒，所有原拒绝与资金断言保持，截止边界测试不改；后续完整重测使用`.local/hardening-regression-candidate.log`。不能把该次失败伪装为通过。

## 镜像扫描实际发现（不能用退出码0代表安全）

Docker Scout v1.24.0逐层报告：后端37项（22中危/15低危）；原前端及入口各147项（17严重/62高危/39中危/14低危/15未分级）。拉取同nginx:1.28-alpine确认远端已是本地版本，随后同Alpine分支系统补丁、删未用模块、nginx1.28.3-r7后各降至2项（中危CVE-2025-60876、未分级CVE-2026-58055，均报告无修复版本），严重/高危0。

原mysql:8.4.8有206项（4严重/107高危/86中危/9低危）；独立生产Dockerfile只升级列明OS包，不改变MySQL服务版本和已有开发容器，降至118项（4严重/35高危/72中危/7低危）。4严重来自/usr/local/bin/gosu内嵌Go1.24.6（CVE-2026-78663/39821/56857及CVE-2025-68121）；OS包升级不会重编此二进制。未贸然替换数据库启动身份切换工具，仍需上游修复镜像或经审核重编验证。**生产镜像门禁FAIL，不能公开上线。** 未宣称每条公告可从本应用利用。

原始与补丁SARIF保留于`.local/*-container-scan.json`、`*-container-patched.json`、`frontend-container-final.json`及`ingress-container-final.json`。Docker Scout报告生成返回0，有命中；清理临时文件偶发占用警告也保留。最终源码配置与包扫描的关联及哈希见脱敏证据。

## 接续审计记录（最终结果尚待完整回归结束）

- 上一条 candidate 日志在100用户约202秒后中断，相关进程与监听端口均已不存在；这不是完成的60分钟测试。保留 `.local/hardening-interrupted-regression.log`。20/600、50/1800的已完成摘要与SQL日志保留；新增 `STABILITY_EXTENDED=resume100` 显式核验两档完整成功摘要后接续100/3600，完整回归输出 `.local/hardening-regression-resumed.log`，不能提前记PASS。
- 实际前端运行容器仍引用旧镜像；仅重建前端容器后部署24检查通过，`.local/hardening-frontend-recreate.log` 与 `.local/deployment-patched.log`。
- 按实际SQL收紧生产Runtime授权：流水、出价、成交、事件、参与者和Token范围表只INSERT，不再授UPDATE；只有真正更新的表保留UPDATE。接收门 `auction_intake` 虽无显式UPDATE语句，但MySQL锁定读取需要UPDATE，首次收紧导致1142，已在隔离库明确复现并补回该表必要锁权限。失败和重测分别保留 `production-compose-runtime-final.log`、`runtime-lock-privilege-failure.log`、`production-compose-runtime-retry.log`。扩展演练验证两领先者释放、同用户差额冻结、唯一成交及取消释放，不更改资金核心。
- 发布扫描器增加PowerShell UTF-16LE解码，防止只按UTF-8扫描本地日志。合成模式探针同时验证两种编码阻止发布且不回显匹配值，`.local/release-audit-encoding-test.log`；探针不使用真实凭据。
- 最终容器扫描实际退出1：backend 37、frontend/ingress各2、生产MySQL118公告命中，其中MySQL严重4/高危35，公开上线门禁继续FAIL。npm及41项Maven运行依赖重新扫描0命中。全层扫描不等于已证明所有公告可利用。
- 进一步复现邮箱排序规则导致的账号限流绕过：MySQL不区分重音，但原限流键使用邮箱字符串。隔离探针修复前预期429实为401，改为用户ID账号键后实为429；成功登录清同一用户ID窗口。新增 SecurityIT 重音别名、跨来源及成功重置断言；最新针对性与全量结果由最终测试记录给出。未改AuctionService。
- 最新生产镜像复测首次退出1：TLS入口尚未监听，健康探测ECONNREFUSED；仅为启动健康探测增加有界连接就绪等待（不忽略证书错误或重试业务请求），再次退出0，双用户资金、精确权限、成交和取消断言不变。实际失败、入口日志与重测保留于 production-compose-runtime-latest.log、production-latest-readiness-failure.log、production-compose-runtime-latest-retry.log。生产项目停止、卷保留。

## 上线前最小补齐路径

准备真实域名/主机及受信任证书、自动续期和防火墙；确认代理聚合限流对实际流量的影响；复核逐表权限及生产管理员凭据轮换；为真实schema审查流式加密备份/异地保留，完成恢复演练；接入真实监控/告警、生产SQL对账与审计归档；完成全层镜像扫描及更长稳态/灾难恢复验证，再批准公开入口。密码找回、宿主断电、双完整容器网络分区、早期全过程Git历史、可选线上部署均不能写为PASS。
