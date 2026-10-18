# 真实问题记录

## 2026-10-18 上线前审计真实失败与修复

- 最终补丁完整回归的50用户持续档在约242秒后因`powershell.exe Get-Process`采样子进程超过5000ms，被SIGTERM终止，StabilityIT实际失败1；日志sampling-failure-evidence保留，不能用早先通过覆盖。最小修复只将本地进程采样预算改为15000ms并使用NonInteractive/ErrorAction Stop，仍禁止重叠采样、缺失即失败，保留HTTP15秒、资金断言、资源上限及整档截止不变；实际采样探针及修复后全量结果见最新报告。不能据此宣称业务无性能风险或忽略监控失败。

- PowerShell执行Maven依赖清单时未引用含点号的`-DoutputFile`，被拆成生命周期`.txt`，退出1；引用完整-D参数后解析成功（.local/preflight/maven-dependencies*.log）。不属应用业务缺陷。
- PDF提取先缺pypdf，随后默认GBK控制台无法输出项目符号；仅在忽略目录安装pypdf，UTF8文件提取成功并读取完整五页，不改系统Python或原题文件。
- Maven运行时OSV初次匹配Jackson2.19.1的15条公告；查阅受影响范围和版本可用性后用BOM2.21.7统一2.x补丁版本，41依赖重扫无命中。是否存在实际可利用路径未证明；不能冒充渗透结果。兼容性以最终完整回归为准。
- 新浏览器截图路径缺乏新克隆父目录初始化，补充mkdir recursive，不削弱原断言。
- 审计执行顺序错误：Compose尚在up时验证包装器因匹配到MySQL Healthy提前重启backend，导致up退出1/后端143、前端未启动、代理就绪失败。保留final-up.log/start-order-failure.log；串行up重试三服务健康后再执行完整回归，没有改资金逻辑。执行者为Agent，不把该失败归因于业务代码。

本轮详细结果见FINAL_RELEASE_AUDIT.md和docs/PREFLIGHT_RUN_20261018.json；下方历史原样保留。

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
## 2026-10-17 双用户状态与钱包排查

只读查询现有容器数据库及后端日志，钱包总额/冻结与流水/hold 不一致计数为0。用户3的130和870为不同拍卖的成交扣款，未发现需要修复的历史账务，未修改已有余额或流水。

代码审查确认界面没有拒绝低seq快照，出价接受提示容易误认为最终获胜，钱包及流水原先分次查询。已添加快照代次与seq防护、明确领先/被超过/最终成交文案及钱包一致性读取。浏览器用真实提交延迟响应、旧快照延迟交付验证乱序；首次完整回归通过后，新增断线最终赢家场景首次失败（房间未加载即断网），保留 .local/incident-tests-final.log 和 .local/incident-browser-final-failed.log，补充房间RUNNING加载断言后重新回归。没有删除业务断言或改动竞价资金写入逻辑。
# 2026-10-18 边界与压力实际问题（最新）

1. `.local/boundary-20261018/first-run.log` 退出1（31集成、2失败）：浏览器新增选择器误用中文演示名，真实种子为Bid Arena Demo；修正测试选择器，所有断言保留。200人首轮HTTP500，后端记录SQLTransientConnectionException；见first-evidence/stress-200.log与stress-backend.log。未增加更高档位。
2. 保持8连接/事务锁规则，将Hikari获取等待5秒改为30秒。second-run.log退出0（31集成）：四档资金对账均0差异；200人1801请求，HTTP错误0/超时0，p95 3202.129ms，p99 4358.840ms。该结果是第二轮，不冒充最终回归。
3. HTTP隔离探针实际复现超大durationSeconds=2147483648返回500，预期400，证据http-real-probe.log。定位Math.toIntExact异常落入500处理；在转换前显式校验1..86400。http-boundaries.mjs覆盖并发Token/参数/限流，最终结果记录见TEST_EXECUTION_REPORT。
4. 两次临时PowerShell诊断正则未提取端口，产生一次连接127.0.0.1:80拒绝和一次退出2；随后改用[0-9]正则成功复现真实HTTP500。不是应用无法启动，保留http-before-fix/http-probe日志。

## 2026-10-18 风险闭环补充

代码复核发现出价处理阶段任意1062也会进入重试，范围过宽。将1062限定为持久接收唯一键竞争阶段，1213/1205仍最多三次；处理阶段1062/1146及业务拒绝新增“不重试”断言。没有改变资金事务或锁顺序，没有通过删断言解决问题。

新增真实应用死锁测试：两真实连接形成probe/auction环，应用已写新冻结和旧释放后实际收到驱动1213/40001，原异常交给生产重试。一次受害新事务成功、三次耗尽扫描恢复，两者均检查回滚/关闭/幂等及唯一成交；错误注入旧测试保留并与真实受害区分。新增真实8连接耗尽、30秒获取超时及权限拒绝检查。

首轮完整回归full-run.log退出0（35集成），随后增强旧领先释放场景、实际池超时和成交金额/赢家SQL检查，最终完整回归以risk-20261018/final-run.log为准，不能用首轮代替最终证据。PowerShell将Java INFO标准错误流包装为NativeCommandError文本，不是测试失败；以实际退出码及Failsafe结果判断。日志全部本地忽略，最终汇总见RISK_CLOSURE_REPORT.md。
# 2026-10-18 生产加固补充

在95422f8基线上增加独立安全服务，未重构竞价核心。实际失败：PowerShell拆分Maven参数；Java HTTP默认协议升级/连接重置；开发压力登录被生产PBKDF2并发槽误限；TLS临时CA用途与证书目录错误；nginx动态模块锁旧包、发行配置变化导致启动失败；生产入口就绪前502。分别修正引号、显式HTTP1.1、仅production严格哈希槽、CA扩展/目录选择、删未用模块及显式nginx主配置、前端健康依赖/有界探测。原日志保留，未删除断言。最终全量结果见最新TEST_EXECUTION_REPORT与脱敏证据。

容器扫描首次实际发现高危/严重命中；nginx/系统包最小补丁消除入口高危/严重，但生产MySQL残留gosu内嵌Go严重公告。禁止将Scout退出0说成安全通过；公开上线仍FAIL。3306未写、原开发MySQL镜像/数据卷未升级或删除。
# 2026-10-18 生产加固接续复核

- 账号限流绕过：真实 MySQL 的不区分重音邮箱排序规则把不同字符串匹配到同一用户，原按邮箱字符串计数可绕过账号额度。隔离探针先复现 `expected=429 actual=401`，修复后 `expected=429 actual=429`。现有账号按数据库用户 ID 计数，成功登录清同一账号窗口；新增 `databaseEquivalentEmailAliasesShareAdmissionAndSuccessReset`，不改拍卖业务。证据：`.local/canonical-account-before.log`、`.local/canonical-account-after.log`；最新针对性和全量结果见 TEST_EXECUTION_REPORT。
- 接续工具会话的 PowerShell 未继承 Docker CLI 路径，一次命令未被识别；该次 `$LASTEXITCODE` 是残留值，不能视为配置检查成功。只将已安装 Desktop 的 resources/bin 加入后续命令会话 PATH，未修改系统设置；重新执行配置及容器检查。
- 本地报告生成器的模板字符串存在未转义反引号，`node --check` 实际报 SyntaxError，尚未写入报告。修正后语法检查通过；生成步骤仍要求最终回归真实成功才执行。
- 生产模板最新镜像复测返回1，首次 HTTPS 健康请求 `ECONNREFUSED`；入口没有 Compose healthcheck，`up --wait` 不保证监听已完成。原有30次健康等待只处理HTTP状态，未处理连接尚未就绪。仅在初始健康探测对连接拒绝/重置有界重试，TLS校验错误立即失败，业务请求和断言不重试。日志 `.local/production-compose-runtime-latest.log`、入口日志 `.local/production-latest-readiness-failure.log`、重测 `.local/production-compose-runtime-latest-retry.log`；探测尝试单独保存，不把启动重试隐藏为一次成功。
- 最终开发容器复核发现前端仍运行旧镜像 b5cad0c1e57f，当前构建/扫描镜像为2b6f49d86d77；普通 `up -d --wait` 未替换它，健康检查不能证明版本一致。仅对frontend执行 `up -d --no-deps --force-recreate --wait frontend`，再比较容器.Image与镜像.Id并重跑代理/TLS。日志 `.local/hardening-frontend-latest-recreate.log`；没有删除卷或重建数据库。

---
