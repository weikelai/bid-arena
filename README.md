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

.env.example仅含空数据库密码占位和公开开发配置；setup:env生成随机密码。APP_ENV=development、SEED_DEMO=true仅用于本地评测。production默认关闭种子，但不会自动提供生产管理员引导。真实.env保持忽略。查看错误：`docker compose logs --tail=100 mysql backend frontend`，三个服务应healthy。更新前端后Ctrl+F5；页面三栏独立滚动，右侧切换历史/流水，管理员另有Agent/创建标签。

## 3. 自动迁移与种子

后端提供HTTP前执行并校验database/migrations/V1–V3，Flyway保存版本/checksum，失败即退出。当前16张应用表及Flyway历史表；不要修改已应用迁移，结构变更新增版本。种子事务用seed_state锁防重，重启不补发积分、不重置钱包或密码。初次演示拍品DRAFT、end_at=NULL，不自动倒计时；被使用后不会重置。

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

历史演示可能已消耗账号余额，不手改账务或重新发积分；创建专用用户或使用隔离测试。退出仅清理本标签sessionStorage，数据库中的人类会话在到期前仍有效，不等于服务端吊销。

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

test:compose调用`node scripts/compose-verify.mjs --integration`，要求默认Compose健康、宿主Java17/Maven/Node与浏览器。它验证重启、前端单测/类型/构建、后端单元/全部MySQL集成、HTTP边界、双会话竞态/断网、20人模拟、四档压力和有界持续测试。根test:all需要自行安全提供隔离TEST_DB_URL/USER/PASSWORD，不自动授权；首次使用推荐test:compose。

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

测试库备份示例（不覆盖旧备份；文件名自行选未使用名称）：

```powershell
New-Item -ItemType Directory -Force .local/backups | Out-Null
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -u"$MYSQL_USER" --single-transaction --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE" > /tmp/bid-arena-backup.sql'
docker compose cp mysql:/tmp/bid-arena-backup.sql .local/backups/bid-arena.sql
```

恢复须指向新建的隔离测试库/独立部署，核验目标授权后mysql导入，执行Flyway校验、计数及资金对账；本轮没有恢复覆盖现有数据，生产恢复演练NOT VERIFIED。dump含身份哈希/Token摘要，需限制访问、加密保管，不提交。生产须另设保留期、异地备份与恢复演练。

本轮已用随机隔离库和专用账号实际验证上述mysqldump参数及mysql导入：探针记录恢复后COUNT=1、value=42，再清理自身测试资源；这不是完整生产账务恢复演练。恢复命令形态（仅在确认目标为新隔离库后）为 `MYSQL_PWD="$BACKUP_PASSWORD" mysql -u"$BACKUP_USER" "$BACKUP_SCHEMA" < /tmp/"$BACKUP_SCHEMA".sql`，通过容器sh运行，凭据由私有环境注入，不在命令中写明文。

## 10. 最新审计与局限

以[FINAL_RELEASE_AUDIT.md](FINAL_RELEASE_AUDIT.md)、[FUNCTIONAL_AUDIT_REPORT.md](FUNCTIONAL_AUDIT_REPORT.md)、[SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md)、[PERFORMANCE_AUDIT_REPORT.md](PERFORMANCE_AUDIT_REPORT.md)及[GITHUB_RELEASE_REPORT.md](GITHUB_RELEASE_REPORT.md)为准。旧README运行历史保留于[docs/README_HISTORY_PRE_RELEASE.md](docs/README_HISTORY_PRE_RELEASE.md)，不作为本轮证据。

NOT VERIFIED/未完善：生产TLS、管理员安全引导、登录防暴力破解、服务端退出吊销/密码重置/轮换、生产备份恢复/告警、长稳态容量、断电/完整容器网络分区、镜像全层漏洞扫描、早期全过程Git历史、本人独立设计能力及可选线上部署。人工录屏/现场核验/外部提交OUT OF SCOPE。扫描无命中不能证明绝对安全，本地测试全绿不能替代生产上线判断。

Maven运行时公告检查：`node scripts/audit-dependencies.mjs`，先解析依赖，再向OSV发送公开包坐标，结果`.local/dependency-audit.json`；网络失败明确BLOCKED，不作通过。npm扫描命令见上文。不会上传源码、环境变量或凭据。
