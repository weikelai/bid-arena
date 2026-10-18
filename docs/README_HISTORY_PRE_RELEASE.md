# Bid Arena

Vue 3 + TypeScript + Vite、Java 17 + Solon 3.10.7、MySQL 8.4 的单体多人拍卖间。真实数据库负责价格、余额、截止时间与唯一成交；每秒轮询已提交的持久事件实现实时同步，不引入 Redis。已实现登录、管理、加入、出价、资金流水、三次延时、自动结算、断线恢复及受限 Agent。

## 五分钟启动

需要 Docker Desktop（Linux containers、WSL2）、Compose、联网拉取 Docker Hub 镜像。运行本机测试另需 Java 17、Maven 3.8.8+、Node 22.15+ 和 npm；首次构建取决于下载速度。

```powershell
npm run setup:env
docker compose config --quiet
docker compose build
docker compose up -d --wait
docker compose ps
```

setup 从 .env.example 生成本地 .env 及随机数据库密码，已有文件不覆盖。不要提交 .env。MySQL 默认仅绑定 127.0.0.1:3307，后端 8080，前端 5173；保护原有 MySQL 3306。启动前检查端口，冲突时调整本地 .env 的 MYSQL_PORT / BACKEND_PORT / FRONTEND_PORT，不能停止别的项目。

打开 http://127.0.0.1:5173 。API 健康检查 http://127.0.0.1:8080/api/v1/health ，同一接口通过前端 /api/v1/health 代理可访问。OpenAPI：http://127.0.0.1:5173/api/v1/openapi.json 。

数据库健康后后端自动校验/执行 Flyway V1–V3，再幂等初始化种子，失败立即退出而不是跳过。初始 16 张应用表加 Flyway 历史表。迁移的唯一源为 database/migrations/，打包入 JAR；已执行 V1 不修改。

## 演示账号与操作

仅 development 且 SEED_DEMO=true 时初始化以下公开评测账号，每人 1000 积分：

| 身份 | 账号 | 公开演示密码 |
|---|---|---|
| 管理员 | admin@example.com | Admin123456! |
| 真人 A | bidder_a@example.com | Test123456! |
| 真人 B | bidder_b@example.com | Test123456! |

密码在表中为随机盐 PBKDF2-HMAC-SHA256、600000 轮哈希。启动/重启不重置余额或密码，不补发积分。演示拍品保持 DRAFT，end_at=NULL，不自动倒计时。

1. 管理员登录，选择演示拍品或创建新拍品，点击“开始拍卖”；默认 180 秒。
2. 使用两个独立浏览器窗口/无痕会话分别以 A、B 登录，选同一拍品，点击加入。
3. A 出价 110，B 出价 120；观察当前价、领先者、剩余时间及各自冻结。领先者再次加价只冻结差额。
4. 截止前五秒内合法出价使最新截止时间加十秒，最多三次。关闭网络再恢复，页面会重新获取权威快照。
5. 到期无需客户端调用，约一秒扫描后自动结算。查看结果、钱包和流水。也可由管理员在 DRAFT/RUNNING 取消并释放资金。
6. 管理员面板创建 Agent 用户、为本场签发 Token；仅显示一次，安全交给 Agent 后立即隐藏，禁止录屏 Token。见 AGENT_TOOL_SPEC.md。

浏览器状态保存在 sessionStorage，每个标签页独立；退出只清理本标签。实时同步延迟通常约一秒；没有离线出价。

## 20 人模拟与 Agent

模拟会创建用户、拍品和流水，**必须对隔离环境运行**。推荐下方 test:compose 自动创建随机测试数据库并运行脚本、浏览器和 SQL 对账。也可以在专用测试部署上执行：

```powershell
$env:SIMULATION_ALLOW_MUTATION='isolated'
$env:API_BASE_URL='http://127.0.0.1:5173/api/v1'
npm run simulate:auction -- --bots=20 --seed=42
```

脚本自动创建短时拍卖、20 真人和 Agent，验证并发、重试、授权、最后五秒延时、自动结算并输出断言摘要；可传 --auctionId=<专用DRAFT拍卖ID>，该拍卖必须是适合测试的短时拍卖，不要使用现有业务数据。默认只支持评测演示管理员；不得用于生产。

外部 Agent 安全设置 AUCTION_AGENT_TOKEN、AUCTION_ID 和可选 AGENT_MAX_AMOUNT（默认500）后运行 `node scripts/auction-agent.mjs`。Token 不要放在参数/命令历史中；使用私有环境注入。该示例每三秒查询并在预算内递增出价；真实钱包仍由服务端约束。接口契约和错误处理见 AGENT_TOOL_SPEC.md。

## 构建与完整验证

```powershell
npm --prefix frontend ci
npm run build
npm run test:unit
npm run test:compose
node scripts/verify-secrets.mjs
```

test:compose 要求当前默认 Compose 服务已健康、宿主机端口为3307/5173；它验证种子重启不变，执行前端测试/构建，在容器 MySQL 创建临时测试账号（只授权 bid_arena_it_ 前缀），运行真实 MySQL 集成测试、20 人模拟和浏览器验收，再移除该账号。每个测试随机建库并仅删除自己的测试库，不接触本机3306或演示库。若修改默认端口，应同步脚本地址，不能把测试指向已有数据库。

浏览器测试使用 Playwright 与已安装的 Edge（Windows），其他平台需先提供 Playwright Chromium；可配置 BROWSER_CHANNEL，见 frontend/browser-check.mjs。不会自动安装系统浏览器。当前实际验证详见 FINAL_ACCEPTANCE_REPORT.md。

直接后端：`mvn -B -f backend/pom.xml package`；前端：`npm --prefix frontend run build`。有独立 MySQL 测试账号时设置 TEST_DB_URL、TEST_DB_USER、TEST_DB_PASSWORD 后运行 `npm run test:all`。该账号只能访问随机测试库。没有真实数据库会失败，不降级 Mock、不跳过。本机后端运行要求 DB_URL、DB_USER、DB_PASSWORD，执行 `npm run start:backend`；前端 `npm --prefix frontend run dev`。

## 停止与排错

```powershell
docker compose logs --tail=200 mysql backend frontend
docker compose restart backend
docker compose ps
docker compose stop
```

stop 保留容器和数据。禁止 down -v、全局 prune、Docker 重置和删除 MySQL 数据来解决普通故障。Flyway 校验失败应修复新迁移，不自动 repair/clean。修改 .env 密码不会自动改变已初始化卷中的 MySQL 账号。

docker 不在 PATH：启动已安装 Docker Desktop，在当前终端 PATH 加入其 resources/bin，重新运行 docker version / info / compose version。不能仅凭 WSL 条目认定 daemon 可用。Docker Hub 下载失败请检查 Desktop 代理；registry /v2/ 返回401代表网络可达但需标准认证，不能据此认定镜像已下载。镜像来源与实际构建记录见验证文档。

## 安全与交付边界

生产关闭演示种子、配置独立随机数据库凭据及 TLS；当前 Compose 是 loopback 评测部署，不是已上线服务。Token 为随机256位，数据库只存 SHA-256 摘要；会话八小时，Agent 支持范围、权限、过期、吊销及固定分钟限流。未实现生产首位管理员引导、密码重置、登录防暴力破解或运营审计后台。

设计见 DESIGN.md，决策/真实错误/AI 分工见 DECISIONS.md、DEBUG_LOG.md、AI_USAGE.md。原始审计与历史验证保留；需求逐项状态见 REQUIREMENTS_MATRIX.md。3–5分钟演示流程见 docs/DEMO_RUNBOOK.md。GitHub已发布，核验见GITHUB_RELEASE_REPORT.md；正式录屏、本人现场讲解与评测方外部提交按用户指示OUT OF SCOPE，均未执行。

## 2026-10-17 最终收尾最新状态（取代此前外部交付待办描述）

本轮实际重新执行 docker compose config --quiet、docker compose build、docker compose up -d --wait、node scripts/compose-verify.mjs --integration，全部退出0。完整回归结束20:16:12+08:00：后端单元4、真实MySQL集成18、前端5、20人模拟59项断言通过；Edge三上下文及SQL资金对账通过。新增独立auction-agent子进程真实出价110和取消后退出0，不再只是语法检查。历史57项是上一轮结果，予以保留。

种子重启快照一致：3用户、3条初始流水共3000、钱包各1000/0、演示DRAFT且end_at为空。测试仅使用容器3307随机隔离库，不修改本机3306。完整本地日志：.local/release-tests-final.log；构建及启动日志：.local/release-build.log、.local/release-up.log，均不发布。

状态分类：A PASS为上述本地核心、容器和自动化；GitHub发布以GITHUB_RELEASE_REPORT.md中实际推送和远端文件核验记录为准。B FAIL：最终回归无剩余失败，历史失败保留。C NOT VERIFIED：全过程开发历史、宿主机断电/大规模性能/双完整容器网络分区、可选线上部署。D BLOCKED仅用于实际外部阻塞，不把跳过人工环节视为阻塞。E OUT OF SCOPE：正式录屏、本人独立讲解/现场修改、评测方邮件/个人资料/外部提交，用户明确不要求本次交付，均未执行，不能宣称原始评测全部通过。

发布安全命令：node scripts/audit-release.mjs 与 node scripts/verify-secrets.mjs；扫描全部可达Git历史、跟踪文件及本地日志，不输出凭据值。真实.env、.local和日志截图不上传。HTTPS默认多账号凭据选择失败后选用现有weikelai GCM账号，dry-run通过；未要求提供Token或伪造历史。架构和已通过业务逻辑本轮未重构。

本节明确取代旧文档中“远端未授权”“独立Agent仅语法检查”“本人必须完成录屏/外部提交”的当前状态描述，旧文字保留作历史。AI完成本轮安全扫描、Agent脚本验收、自动化回归及发布整理，不代表本人独立设计能力已核验。仓库：https://github.com/weikelai/bid-arena 。
## 最终全面回归证据

2026-10-17 20:31:00+08:00，完整回归退出0：4单元、21真实MySQL集成、5前端测试，失败/错误/跳过均0；20人seed42模拟65断言，winner24 price370；新增动态凭据在后端日志及前端包中不存在的检查通过。Edge扩展测试包括旧钱包响应跨登录隔离、出价历史、自动SOLD及余额890/冻结0。详见TEST_EXECUTION_REPORT.md及需求矩阵新附表。原始MySQL3306仍PID8864，三个容器healthy。
# 2026-10-18 边界与压力测试补充

保留现有安装和启动说明。`node scripts/compose-verify.mjs --integration` 现同时执行前端测试/构建、后端单元及真实 MySQL 测试、HTTP参数/Agent并发边界、20人模拟、Edge多上下文竞态和20/50/100/200逐级压力；一般需数分钟。Windows使用已有Edge，测试创建随机 `bid_arena_it_*` 库和临时用户，绝不将负载指向原演示钱包；测试结束只清理这些隔离资源。必须先启动Compose并配置本机Java17/Maven/Node/npm。日志位于 `.local/` 和 `backend/target/`，不发布。

压力脚本有隔离开关、最大200 workers、每请求15秒超时及失败停止条件；不要对生产或原演示库直接运行。资源采样使用Windows PowerShell读取独立Java进程，以及Docker stats读取共享MySQL容器。短时突发测试不是长期性能/SLA证明。连接池仍8连接，等待上限现30秒；超载时可能超过调用方超时，调用方应以原requestId重试。实际结果与未测项见 [BOUNDARY_TEST_REPORT.md](BOUNDARY_TEST_REPORT.md) 和 [STRESS_TEST_REPORT.md](STRESS_TEST_REPORT.md)，最新回归见TEST_EXECUTION_REPORT。
# 风险闭环：运行观测与有界持续测试

管理员登录后可用已有Bearer会话读取 `/api/v1/admin/metrics`；请通过安全环境变量/客户端提供凭据，不把Token写入命令或日志。该接口只返回进程内固定标签计数、时延累计桶、池状态及JVM资源，不提供账务修改能力。进程重启归零，锁SQL耗时不等同纯锁等待，详情见DESIGN最新节。

`node scripts/compose-verify.mjs --integration` 还包含真实出价事务死锁受害/重试耗尽恢复、真实30秒连接池耗尽观测、StabilityIT隔离多房间持续负载。持续档位固定20用户120秒、50用户300秒（准备及结算另计），完整验证预计十多分钟；每5秒直接SQL对账，失败立即停止升级并保留日志。不是10/30/60分钟或生产容量认证。测试会真实占用共享Docker MySQL资源，请勿同时运行其他压测；不会访问本机MySQL3306。
