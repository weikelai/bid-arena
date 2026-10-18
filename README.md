# Bid Arena 使用与维护教程

多人实时拍卖间，使用**虚拟积分，不涉及真实支付**。Vue 3 + TypeScript + Vite、Java 17 + Solon 3.10.7、MySQL 8.4 / InnoDB、Flyway、Docker Compose。单体每秒轮询数据库持久事件；MySQL是余额、价格、截止时间和成交的唯一事实来源，无Redis。

已实现真人竞价、管理员创建/开始/取消、冻结/释放/扣款、幂等、三次延时、自动结算、快照恢复和受限Agent。没有真实支付、密码找回或运营后台。**仅适用于本机评测及受控测试，不可直接暴露互联网**。正式录屏、本人现场讲解/临时修改、评测方外部提交未执行，按用户指示OUT OF SCOPE。

## 1. 环境准备

Windows 11使用支持WSL2的Docker Desktop，启用Linux containers、硬件虚拟化并启动Desktop。不要重置Docker或已有MySQL。逐项检查：

```powershell
wsl --status
wsl -l -v
docker version
docker info
docker compose version
git --version
node --version
npm --version
java -version
mvn -version
```

Compose使用容器内构建工具；本地环境生成脚本需Node≥22.15。原生测试另需Java17、Maven≥3.8.8、npm及Windows Edge（Playwright使用其引擎）。其他平台需安装Playwright Chromium，按实际安装设置BROWSER_CHANNEL。建议预留至少4GiB内存和足够镜像/数据库磁盘空间，实际占用需观察；不承诺固定最低资源或首次下载五分钟完成。

若CLI不在PATH，将Desktop安装目录的resources/bin加入当前会话，不复制陌生docker.exe。网络故障先检查Desktop代理、DNS及Docker Hub的auth/registry连通性；PowerShell代理成功不代表daemon采用同一代理，不提交代理凭据。

## 2. 从零启动

```powershell
git clone https://github.com/weikelai/bid-arena.git
Set-Location bid-arena
npm run setup:env
# 从.env.example创建本地.env并生成随机数据库密码，已有文件不覆盖
Get-NetTCPConnection -LocalPort 3307,8080,5173 -State Listen -ErrorAction SilentlyContinue
docker compose config --quiet
docker compose build
docker compose up -d --wait
docker compose ps
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
Invoke-RestMethod http://127.0.0.1:5173/api/v1/health
Invoke-RestMethod http://127.0.0.1:5173/api/v1/openapi.json | Select-Object openapi
```

如果端口属于其他项目，在本地.env修改本项目映射，不停止别的服务。默认前端 http://127.0.0.1:5173 ，后端8080，项目MySQL3307，均仅绑定loopback。**宿主机MySQL3306独立，绝非测试目标**。测试包装器目前固定3307/5173；改端口需审查脚本，不能误指向原数据库。

.env.example仅含空数据库密码占位和公开开发配置；setup:env生成随机密码。APP_ENV=development、SEED_DEMO=true仅用于本地评测。production强制关闭种子，管理员必须通过下述受控CLI引导。真实.env保持忽略。查看错误：`docker compose logs --tail=100 mysql backend frontend`，三个服务应healthy。更新前端后Ctrl+F5；页面三栏独立滚动，右侧切换历史/流水，管理员另有Agent/创建标签。

## 3. 自动迁移与种子

开发后端提供HTTP前执行并校验database/migrations/V1–V4，生产后端只校验、迁移由ops单独执行。Flyway保存版本/checksum，失败即退出。当前19张应用表及Flyway历史表；不要修改已应用迁移，结构变更新增版本。种子事务用seed_state锁防重，重启不补发积分、不重置钱包或密码。初次演示拍品DRAFT、end_at=NULL，不自动倒计时；被使用后不会重置。

只读核查容器库（不连接3306）：

```powershell
@'
SELECT version,success FROM flyway_schema_history ORDER BY installed_rank;
SELECT email,role,kind FROM users ORDER BY id;
SELECT status,end_at FROM auctions WHERE seed_key='demo-auction-v1';
SELECT COUNT(*) credits,SUM(delta_total) points FROM wallet_transactions WHERE type='INITIAL_CREDIT';
'@ | docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'
```

全新库三个账号各1000积分、三条初始流水共3000；已有库新增用户后计数自然不同。密码为随机盐PBKDF2-SHA256 600000轮哈希。`node scripts/compose-verify.mjs`读取事实快照、重启后端并比较；有竞价或到期结算时事实可合法变化，应先确保空闲，不应将变化直接视为重复初始化。

## 4. 真人双用户演示

以下为原题规定的公开开发演示凭据，不允许用于生产：

| 身份 | 邮箱 | 公开演示密码 |
|---|---|---|
| 管理员 | admin@example.com | Admin123456! |
| 真人A | bidder_a@example.com | Test123456! |
| 真人B | bidder_b@example.com | Test123456! |

1. 管理员选择DRAFT演示拍品，或在“创建拍卖”输入名称及秒数（默认180，范围1–86400），创建后点击开始。
2. A、B使用独立浏览器配置/会话登录，选同一拍品并加入。同一浏览器无痕窗口可能共享会话，须核对用户ID。
3. A出110、B出120，观察领先者冻结、旧领先者释放；同一人加价仅冻结差额。可用=总余额−冻结。
4. “已接受”不代表最终获胜，“当前领先”仍可能被超过；只有FINISHED的服务端结果确定赢家。
5. 最后五秒合法出价以最新截止时间延长10秒，最多三次，恰好到截止也拒绝。断网再恢复会取权威快照，不支持离线出价。
6. 右侧查看历史与流水，分别列出总余额和冻结变化。FREEZE非扣款，RELEASE不增加总余额，CAPTURE才扣款；请求号可展开。
7. 到期每秒扫描自动结算，赢家扣款、冻结清零，无人出价不扣款。管理员仅可在DRAFT/RUNNING取消并释放冻结。

历史演示可能已消耗账号余额，不手改账务或重新发积分；创建专用用户或使用隔离测试。退出会清理本标签sessionStorage并请求服务端吊销当前人类会话；网络失败时界面明确提示吊销尚未确认，不能仅凭本地已退出就认为服务端凭据失效。

## 5. 竞拍Agent教程

Agent是受限API参与者，不需要OpenAI API Key。管理员在Agent标签创建独立邮箱、至少12位密码的AGENT用户（邮箱不发送邮件，Agent不能密码登录）。选授权拍卖，填返回的Agent用户ID并签发Token。界面固定read+bid、1小时、120次/分钟；自定义权限/过期/配额使用管理API，见[AGENT_TOOL_SPEC.md](AGENT_TOOL_SPEC.md)。明文只返回一次，交给进程后隐藏，不截图、不写命令历史。

在提示出现后输入真实值，Read-Host引号内只放提示语：

```powershell
$agentSecret = Read-Host '请输入本场 Agent Token' -AsSecureString
$env:AUCTION_AGENT_TOKEN = [System.Net.NetworkCredential]::new('', $agentSecret).Password
$env:AUCTION_ID = Read-Host '请输入拍卖数字 ID'
$env:AGENT_MAX_AMOUNT = '200'
try { node scripts/auction-agent.mjs }
finally {
    Remove-Item Env:AUCTION_AGENT_TOKEN,Env:AUCTION_ID,Env:AGENT_MAX_AMOUNT -ErrorAction SilentlyContinue
    Remove-Variable agentSecret -ErrorAction SilentlyContinue
}
```

脚本每3秒读取并预算内加价，最多300轮；不是智能最高价代理，可能给自己加价。终态退出，Ctrl+C可停止。401/403/429报错退出，不实现自动退避；余额不足等BID_REJECTED须看type/error。网络失败若重试同一业务，必须保留requestId与金额。GET `/api/v1/auctions/{id}`查询；POST同路径`/join`用JSON `{}`；POST `/bids`用`{"requestId":"稳定唯一编号","amount":110}`。Bearer只用私有环境传递，不放URL。

管理员通过POST `/api/v1/admin/agent-tokens/{id}/revoke`吊销签发响应中的Token记录ID；界面“隐藏”不等于吊销。用 `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId,ParentProcessId,Name`检查进程，只停止自己确认的Agent PID，不全局杀node、不输出可能含凭据的命令行。

## 6. 自动化测试与模拟

```powershell
npm --prefix frontend ci
npm run test:unit
npm run build
npm run test:compose
node scripts/verify-secrets.mjs
node scripts/audit-release.mjs
npm --prefix frontend audit
```

test:compose调用`node scripts/compose-verify.mjs --integration`，要求默认Compose健康、宿主Java17/Maven/Node与浏览器。它验证重启、前端单测/类型/构建、后端单元/全部MySQL集成、HTTP边界、双会话竞态/断网、20人模拟、四档压力和有界持续测试。新安全测试还需Runtime及Backup身份，包装器会自动创建；也可直接运行 `node scripts/test-isolated.mjs`。根test:all需自行提供全部隔离账号，不自动授权；首次使用推荐test:compose。

包装器在容器MySQL建立仅授权bid_arena_it_*的随机临时用户，各测试随机建库，结束只清理自己的资源。不对演示库/3306施加写负载。完整约十多分钟，首次下载另计；不要同时运行其他压测。日志在.local/与backend/target/，不发布；JUnit测试数与HTTP/模拟断言数不同，不能相加冒充测试数。

单独模拟只允许专用可丢弃部署（不是已有演示后端）：

```powershell
$env:SIMULATION_ALLOW_MUTATION='isolated'
$env:API_BASE_URL='http://127.0.0.1:<隔离后端端口>/api/v1'
npm run simulate:auction -- --bots=20 --seed=42
# 可选 --auctionId=<专用短时DRAFT拍卖ID>
# 压力：node scripts/stress-auction.mjs --users=20
```

脚本创建用户/拍卖/流水，优先使用自动隔离包装器。压力20/50/100/200人；持续固定20人120秒、50人300秒，限制共享开发机占用，不是10/30/60分钟或生产容量承诺。HTTP200中的BID_REJECTED属于预期拒绝，不是HTTP系统错误。SQL检查钱包与流水/holds、唯一CAPTURE/结果、PENDING及孤立出价，任何差异立即停止，保存证据。

## 7. API与事务

OpenAPI是GET `/api/v1/openapi.json`（JSON，无内置Swagger UI）。健康/OpenAPI公开；登录后Bearer访问/users/me、/wallets/me、拍卖列表。管理员管理拍卖、用户、Token及/admin/metrics。Agent只可访问授权拍卖快照、事件、历史及join/bid，不能管理或读钱包。

users→wallets→wallet_transactions；auctions→participants→holds/bids；auction_results以auction_id主键唯一；agent_tokens保存摘要、scopes关联用户/拍卖/权限；bid_requests用(user_id,request_id)防重，变更金额或拍卖409。金额BIGINT整数。

鉴权后取得数据库接收门再记录接收时间（不是网络首字节）；PENDING持久提交，拍卖行锁串行处理、钱包ID顺序锁，资金/价格/延时/流水/事件同事务。1213/1205有限重试，1062只在接收唯一键竞争阶段重试。扫描恢复遗留请求/结算，seq缺口与断网取快照。详见[DESIGN.md](DESIGN.md)。

## 8. 排错

| 现象 | 检查/处理 |
|---|---|
| Docker无Server/pipe不存在 | 启动Desktop，检查WSL2/虚拟化/PATH，不重置数据 |
| Hub认证/下载超时 | Desktop代理/DNS/auth和registry，保留错误，不泄露代理凭据 |
| 端口冲突 | Get-NetTCPConnection，本地.env改本项目映射，不抢3306 |
| unhealthy | compose ps及logs --tail=100，核查健康URL及依赖 |
| Flyway失败 | 校验版本/checksum，恢复误改或新增迁移，不随意repair/clean |
| 数据库认证失败 | 核对.env与原卷凭据；改.env不会重置数据库用户，禁止删卷解决 |
| 前端502 | 检查backend健康、nginx上游backend:8080，重建前端 |
| Agent无效/无权限/429 | ID、scope、到期、吊销、频率；隐藏不是吊销 |
| 出价拒绝 | 状态、加入、最低价、截止、可用积分，读取type/error |
| 钱包不符预期 | 区分冻结/扣款，刷新、核对用户、SQL对账，不手改余额 |
| 测试失败 | target/*IT报告及子脚本日志，区分环境/脚本/业务，保留失败 |

## 9. 维护、备份与恢复

```powershell
docker compose ps
docker compose logs --tail=100 backend
docker compose stop
docker compose up -d --wait
# 更新前保存未提交修改并备份；不覆盖本地工作
git pull --ff-only
docker compose build
docker compose up -d --wait
```

stop/up保留具名卷。不得对已有数据随意down -v、system prune、Docker重置或Flyway clean。原始评测、迁移、规定文档、DEBUG_LOG和历史失败保留。

## 10. 最新审计与局限

以[FINAL_RELEASE_AUDIT.md](FINAL_RELEASE_AUDIT.md)、[FUNCTIONAL_AUDIT_REPORT.md](FUNCTIONAL_AUDIT_REPORT.md)、[SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md)、[PERFORMANCE_AUDIT_REPORT.md](PERFORMANCE_AUDIT_REPORT.md)及[GITHUB_RELEASE_REPORT.md](GITHUB_RELEASE_REPORT.md)为准。旧README运行历史保留于[docs/README_HISTORY_PRE_RELEASE.md](docs/README_HISTORY_PRE_RELEASE.md)，不作为本轮证据。

最新生产加固范围及限制见 [PRODUCTION_HARDENING_REPORT.md](PRODUCTION_HARDENING_REPORT.md)。镜像全层扫描已执行，残留严重/高危公告使生产镜像门禁FAIL。密码找回、真实公网证书/续期、异地备份与告警接收端、生产容量、断电/完整容器网络分区仍未验证或受外部资源阻塞；早期全过程Git历史不能补造。人工录屏/现场核验/外部提交OUT OF SCOPE。扫描无命中不能证明绝对安全，本地测试全绿不能替代生产上线判断。

Maven运行时公告检查：`node scripts/audit-dependencies.mjs`，先解析依赖，再向OSV发送公开包坐标，结果`.local/dependency-audit.json`；网络失败明确BLOCKED，不作通过。npm扫描命令见上文。不会上传源码、环境变量或凭据。

## 11. 生产部署准备（不是公网已上线）

独立模板为 `compose.production.yaml`，不叠加开发Compose。MySQL与后端没有宿主端口，默认仅 `127.0.0.1:8443` 的TLS入口。生产项目使用独立卷；禁止把现有3306目录或开发卷挂进去。尚无真实域名、证书、续期服务、异地备份和告警接收端，当前**不可直接公开上线**。

执行 `node scripts/setup-production-env.mjs`，从 `deploy/production.env.example` 创建忽略的 `.local/production.env` 并为root、Migration、Runtime分别生成32字节随机十六进制密码；已有文件会拒绝覆盖。不要在聊天、命令历史、日志中粘贴凭据，Windows另行检查ACL。数据库名及用户名只用小写字母、数字、下划线。编辑私有文件的 `TLS_DIRECTORY`，指向包含 `fullchain.pem` 和 `privkey.pem` 的受保护证书目录；未配置时Compose明确失败，不生成假证书或回退HTTP。不得使用测试CA作为生产证书。

```powershell
docker compose --env-file .local/production.env -f compose.production.yaml config --quiet
docker compose build
docker compose --env-file .local/production.env -f compose.production.yaml build mysql ingress
docker compose --env-file .local/production.env -f compose.production.yaml up -d --wait mysql
node --env-file=.local/production.env scripts/provision-production.mjs
docker compose --env-file .local/production.env -f compose.production.yaml --profile ops run --rm -T migrate
node --env-file=.local/production.env scripts/provision-production.mjs --runtime
```

账号创建脚本仅用于首次新安装：已有同名账号即失败，不重置密码。失败可能已创建前一个账号，需受信任DBA检查后继续，不能盲目重跑。Migration具有目标schema所需DDL和DML；Runtime先仅SELECT，迁移后用 `--runtime` 按实际操作授予INSERT、必要表UPDATE，以及会话/限流表的清理DELETE。流水、出价、成交、事件、参与者、Token范围和安全审计表仅追加，不授UPDATE或DELETE；接收门表为锁定读取保留MySQL要求的UPDATE。不可写bootstrap/seed/Flyway表、执行DDL或访问mysql系统表及其他schema。SELECT仍为schema范围，非逐列隔离。应用Runtime容器不含迁移凭据；生产启动只Flyway validate。升级使用现有迁移身份受控执行migrate并复核新表权限，先备份、校验与演练；`--runtime`只增授权，不会撤销既有过宽权限，已有部署必须由DBA复核SHOW GRANTS，不能宣称自动收窄旧账号。不可修改已应用迁移、不可Flyway clean。

### 一次性管理员引导

仅在受信任终端执行，关闭终端录制/命令转录。prepare只返回一次高熵密钥，数据库仅存摘要、10分钟有效；已有待消费密钥时拒绝重签，过期后可重签。消费和管理员创建同一事务，管理员钱包为0、不发演示积分。成功后不能再次初始化或重置管理员。

```powershell
$bootstrapOutput = docker compose --env-file .local/production.env -f compose.production.yaml --profile ops run --rm -T migrate prepare-admin-bootstrap
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap preparation failed' }
$bootstrapSecret = $bootstrapOutput | Where-Object { $_ -match '^[A-Za-z0-9_-]{43}$' } | Select-Object -Last 1
if (-not $bootstrapSecret) { throw 'No bootstrap secret returned' }
$ownerEmail = Read-Host '管理员邮箱'
$ownerPassword = Read-Host '独立强密码（至少16字符，不使用演示密码）' -AsSecureString
try {
    $plain = [System.Net.NetworkCredential]::new('', $ownerPassword).Password
    "$bootstrapSecret`n$ownerEmail`n$plain" | docker compose --env-file .local/production.env -f compose.production.yaml --profile ops run --rm -T migrate consume-admin-bootstrap
    if ($LASTEXITCODE -ne 0) { throw 'Bootstrap consumption failed' }
} finally { Remove-Variable bootstrapOutput,bootstrapSecret,plain,ownerPassword -ErrorAction SilentlyContinue }
docker compose --env-file .local/production.env -f compose.production.yaml up -d --wait backend frontend ingress
docker compose --env-file .local/production.env -f compose.production.yaml ps
```

没有公开管理员注册入口。生产缺少DB配置、HTTPS入口批准或错误迁移均失败关闭；不能通过APP_ENV拼写错误降级。TLS私钥只读挂载；证书应由受信任CA签发，续期原子替换后执行以下检查及reload；续期失败必须告警并在过期前停止公网入口，不回退HTTP。HSTS仅TLS层设置。正式开放绑定地址前审核防火墙、证书、DNS与下述未验证风险。

```powershell
docker compose --env-file .local/production.env -f compose.production.yaml exec -T ingress nginx -t
docker compose --env-file .local/production.env -f compose.production.yaml exec -T ingress nginx -s reload
```

### 登录防护与会话

生产DB持久化60秒窗口：全局200次、来源40次、账号10次；所有登录尝试先计数，错误密码/不存在账号统一401，超限429。已有账号按数据库查询得到的用户ID计数，MySQL视为相同邮箱的重音别名共享额度；不存在账号按规范化邮箱计数，且受父窗口限制。每实例最多4个PBKDF2任务，无等待队列。成功登录只清账号窗口；来源及全局窗口保留。每60秒最多清理1000条旧窗口，过期会话保留7天后有界清理。

来源使用服务端socket地址，**不信任X-Forwarded-For**；生产代理链下来源会聚合成内部代理IP，所以40次/分钟可能影响共享入口用户。此为保守防护而非准确客户端IP识别；未来若需真实IP，应增加明确可信代理校验并测试，不能直接改为信任请求头。开发模式为维持隔离评测使用高窗口额度，不启用生产4槽限制，不得公开开发入口。

POST `/api/v1/auth/logout` 吊销当前人类会话；前端立即清理本地状态，若网络失败会明确提示服务端吊销未确认。POST `/api/v1/auth/change-password` 需当前密码、新密码（至少16字符），吊销该用户全部旧会话。管理员POST `/api/v1/admin/users/{id}/revoke-sessions`可撤销目标人类会话。过期返回SESSION_EXPIRED，吊销返回SESSION_REVOKED。已进入执行中的请求不承诺被中途取消。Agent仍使用独立到期/吊销/限流机制，不共享人类会话生命周期。上述新密码/撤销操作当前为API功能，未提供密码找回。

### 加密备份、恢复及监控

`scripts/encrypted-backup.mjs` 为已验证的**隔离库适配器**，有意拒绝真实生产schema：AES-256-GCM、独立32字节BACKUP_KEY、专用备份账号、仅`.local`输出、不覆盖文件、至少512MiB可用空间，128MiB有界处理。恢复先认证解密再CREATE新库，已有目标库拒绝；失败后保留新目标供排查，不自动切换流量。

```powershell
node scripts/test-isolated.mjs '-Dit.test=BackupIT'
# 手动隔离演练时，以私有环境注入 BACKUP_SCHEMA/BACKUP_KEY/BACKUP_DB_USER/BACKUP_DB_PASSWORD
node scripts/encrypted-backup.mjs backup .local/backups/unique-name.bak
# 改为新隔离schema和专用恢复身份后：
node scripts/encrypted-backup.mjs restore .local/backups/unique-name.bak
```

先自行创建私有备份目录。备份身份只读，恢复身份有目标新库DDL/DML；不能复用Runtime。密钥与备份分离保管，Linux文件0600，Windows须另核验ACL。生产保留策略建议每日备份保留7份、每周异地保留4份，**未自动执行删除或建立异地存储**。生产schema适配、大库流式备份、轮换与灾难恢复需DBA独立审核，不能把隔离演练等同生产数据保护已完成。

`node scripts/ops-check.mjs` 只读检查loopback或HTTPS的健康和磁盘；可用私有OPS_TOKEN读取管理员连接池/失败计数，OPS_BACKUP_FILE检查24小时新鲜度，输出忽略的`.local/ops-check.json`，缺项NOT VERIFIED。计数为进程启动以来累计，不是失败率。外部调度每分钟检查，告警需接入真实接收端；不得把密码、邮箱、Token或完整请求体发送出去。资金对账异常由隔离IT实际验证，生产定时只读对账尚未部署。

生产容器json-file日志每文件10MiB、3份；应用异常只记类型，不记Bearer或密码。应用安全审计持久记录登录成功、会话撤销、密码轮换及管理员初始化，不含凭据。数据库审计表长期归档策略尚待运维确定。启动检查：健康、迁移校验、证书有效期、备份可解密恢复、资金对账、最小权限、日志轮换、告警可达、失败关闭均应由部署者逐项核验。

本地模板复现：先按生产命令构建mysql/ingress补丁镜像，再 `node scripts/test-local-tls.mjs`（需OpenSSL，可设OPENSSL_BIN），再 `node scripts/test-production-compose.mjs`。临时CA仅供本地显式信任测试，私钥留在忽略目录，不会导入系统信任库。生产Compose演练使用独立项目/数据库/随机凭据，结束仅stop，保留卷。

持续测试默认20用户120秒、50用户300秒。可先设置 `$env:STABILITY_EXTENDED='20'` 再执行 `node scripts/test-isolated.mjs '-Dit.test=StabilityIT'` 运行20用户600秒；`50`依次600/1800秒，`100`依次600/1800/3600秒。每档通过资金对账和资源检查才继续，结束清理此环境变量。不可同时运行其他压测；未执行档位不能当作容量承诺。

已通过20/600并保留其 `backend/target/stability-20.json` 后，可设 `STABILITY_EXTENDED=remaining` 接续50/1800、100/3600；测试会先检查20档摘要，再逐档实时SQL与资源核验，不跳过资金断言。短时20/50/100/200吞吐夹具使用60秒拍卖（不是固定60秒持续负载），避免15秒夹具在共享机器200人请求中途结束；实际负载时长、自动成交等待时长与延迟分别记录，截止边界仍独立测试。

## 本轮验证状态

4后端单元、44真实MySQL集成、7前端及HTTP/浏览器/模拟/四档压力通过；20用户10分钟、50用户30分钟、100用户60分钟分别有完整结果。这里不承诺生产容量。完整命令与证据见[生产加固报告](PRODUCTION_HARDENING_REPORT.md)和[测试报告](TEST_EXECUTION_REPORT.md)。生产镜像门禁仍FAIL，真实公网部署BLOCKED，禁止直接开放当前服务。

独立创建新生产配置：node scripts/setup-production-env.mjs；已有.local/production.env会拒绝覆盖。准备受信任证书及外部备份/告警后，仍需先处理镜像风险和生产运维缺口，再审核公网入口。
