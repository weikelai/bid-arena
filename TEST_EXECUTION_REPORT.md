# 全面验收执行记录（2026-10-17）

## 最后一次冻结回归（本节为当前证据）

基线：生产代码e13339b；测试同步修正提交8bf8b4512f85be67b2ec184e421a837cb05c5db4。环境本轮实际复核：Java17.0.17、Maven3.8.8、Node22.15.1、npm11.14.0、Docker Engine29.8.0、Compose5.5.1。原始规则逐项状态沿用下方报告引用的最新矩阵，但本轮运行证据替换为以下freeze文件；旧日志保留。

| 本轮实际命令 | 退出码及结果 | 本地证据 |
|---|---|---|
| git status --short、branch --show-current、log --oneline -10、remote -v、ls-remote origin refs/heads/master | 均0；开始master干净，本地/远端均e13339b | 终端、.local/freeze-remote.json |
| docker compose config --quiet | 0 | .local/freeze-config.log |
| docker compose build | 0，前后端镜像成功 | .local/freeze-build.log |
| docker compose up -d --wait | 0，三服务healthy | .local/freeze-up.log |
| node scripts/compose-verify.mjs --integration（第一次） | 1；单元4、AuctionIT14、DatabaseIT6、前端5、模拟65通过，HttpSimulationIT浏览器列表按钮超时失败 | .local/freeze-tests.log、freeze-browser-failed.log、freeze-http-failed.log |
| node scripts/compose-verify.mjs --integration（同步修正后） | 0；20:46:45+08:00，4单元、21真实集成、5前端，失败0/错误0/跳过0；模拟65断言 | .local/freeze-tests-retry.log、backend/target/{http-simulation,browser-acceptance}.log |
| docker compose ps；docker compose logs --tail=100 mysql backend frontend | 0；三healthy，日志含初始化和重启历史，不据历史告警判当前失败 | .local/freeze-container.log及最终状态记录 |
| node .local/freeze-http.cjs | 0；后端health、前端代理health、页面、OpenAPI均200，health database=UP；只读SQL确认空密码root数0 | .local/freeze-http.json |
| node scripts/audit-release.mjs；node scripts/verify-secrets.mjs | 均0，提交前后再扫描；已知凭据及常见模式未命中 | .local/release-security.json |
| git clone --no-checkout（已有GCM非交互认证）到.local/freeze-remote-check；fetch/全树比对 | 开始核验0，最终提交后再核验，见发布报告 | .local/freeze-remote.json |
| git diff --check；Get-NetTCPConnection -LocalPort 3306 -State Listen | 0；原MySQL仍PID8864，未修改数据 | 终端 |

完整脚本实际包含npm --prefix frontend test、npm --prefix frontend run build（vue-tsc及Vite）、mvn -B -f backend/pom.xml verify -Pmysql-it、Node模拟及Edge浏览器。隔离随机库和前缀受限临时账号使用后清理；没有down -v、prune或重置。

Flyway1/2/3 success=1、3种子用户、3初始流水共3000、钱包各1000/0、演示DRAFT且end_at NULL；后端重启前后逐字一致（.local/compose-data-verification.log）。真实数据库SQL对账通过：钱包总额/冻结与流水及hold一致；每场唯一结果/扣款，HTTP测试包含模拟与浏览器两场CAPTURE；请求关联、32字节Token摘要符合断言。65断言包括临时凭据未出现在后端日志或前端包中，且不输出凭据。

首次失败定位与修正见DEBUG_LOG首节：只增加RUNNING、列表响应与目标拍品断言，核心业务未改动。旧日志不足以证明该超时唯一根因；一次成功复测不是永不波动的证明，今后若重现应继续按保存的日志定位，不静默重试掩盖失败。

本轮最终日志SHA256：F2C2ADD110F836F59058713D587374B3E9E0ACC3DA59386D079BF2D9695E405C。浏览器与模拟日志内容相同可有相同哈希，但实际进程已在本轮重新运行，JUnit时间与freeze日志为本轮证据。首轮退出1日志完整保留。未验证风险及OUT OF SCOPE见FINAL_HANDOFF，不重复声明原题全部通过。

## 此前执行记录（保留历史）

原始依据：根目录评测Markdown及PDF五页，已完整读取。PDF使用pypdf提取至忽略的.local/original-pdf.txt，与Markdown关键要求一致。本报告是发布后的新一轮验收，不将20:16的上一轮结果当成本轮结果。详细映射见REQUIREMENTS_MATRIX.md最新附表。

## 环境和隔离

Windows 11 PowerShell；Java17.0.17、Maven3.8.8、Node22.15.1、npm11.14.0；Engine29.8.0、Compose5.5.1；MySQL镜像8.4.8；Solon3.10.7、Vue3.5.44、TypeScript5.8.3、Vite6.4.4。实际版本命令均退出0。Docker CLI通过当前进程PATH加入已安装Desktop resources/bin；不安装或重置Docker。

测试脚本创建只授权bid_arena_it_前缀的临时账号；每个IT创建UUID库并在finally删除自己的库，最后移除测试账号。原生3306始终PID8864，未改动。没有删除数据卷或全局清理。

## 实际命令

| 命令 | 退出码/观察 | 证据 |
|---|---|---|
| git status --short / branch --show-current / log -4 --oneline / remote -v | 0；开始时master干净，d129508；本轮后出现实际修复 | 终端及Git历史 |
| git ls-remote origin refs/heads/master；独立克隆fetch/show | 0；开始时远端d129508与本地一致，实际读取发布报告 | GITHUB_RELEASE_REPORT |
| java -version；mvn -version；node --version；npm --version | 0，版本见上 | 终端 |
| docker version --format '{{.Server.Version}}'；docker compose version | 0，版本见上 | 终端 |
| python -m pip install --target .local/pdf-reader pypdf --disable-pip-version-check --quiet | 0；仅本地忽略目录安装阅读依赖 | 本地目录 |
| Python pypdf提取五页 | 首次控制台GBK不能输出项目符号，退出1；文件已写入，再用Get-Content -Encoding UTF8完整读取成功0 | .local/original-pdf.txt |
| docker compose config --quiet | 0 | 终端 |
| docker compose build（两次，第二次包含OpenAPI更新） | 0 | .local/comprehensive-build.log、comprehensive-build-final.log |
| docker compose up -d --wait | 0；三个服务healthy | .local/comprehensive-up.log |
| node scripts/compose-verify.mjs --integration 首次 | 1，新增浏览器拦截器移除竞争，未删除断言 | .local/comprehensive-tests-attempt1.log、comprehensive-browser-attempt1.log |
| node scripts/compose-verify.mjs --integration 修复后 | 0；4单元、21集成、5前端、64模拟断言；20:28:30完成 | .local/comprehensive-tests-attempt2.log |
| node scripts/compose-verify.mjs --integration 增加凭据泄露断言后 | 0；结束20:31:00+08:00，4单元/21集成/5前端/65模拟断言 | .local/comprehensive-tests-final.log |
| docker compose logs --tail=100 | 0 | .local/comprehensive-container.log |
| docker compose ps | 0，mysql/backend/frontend全部healthy | 终端 |
| Node fetch 后端health、前端代理health、前端页面、OpenAPI | 0，四个地址HTTP200；代理health database=UP另由compose脚本验证 | 终端及compose日志 |
| Get-NetTCPConnection -LocalPort 3306 -State Listen | 0，原PID8864 | 终端 |

复合PowerShell命令保存原生命令退出码，不把stderr的NativeCommandError包装当成实际失败。完整测试内部执行npm前端test、vue-tsc/Vite build、mvn -B -f backend/pom.xml verify -Pmysql-it；HTTP IT再启动独立JAR、20人模拟和Edge脚本。

## 数据库核对

compose脚本重启前后快照逐字一致：Flyway1/2/3 success=1；3用户；3初始积分流水共3000；三个钱包1000/0；拍品1 DRAFT、current_price100、end_at NULL。见.local/compose-data-verification.log。

AuctionIT每组直接核对wallet.total等于SUM(delta_total)、wallet.frozen等于SUM(delta_frozen)及所有hold合计；检查唯一bid、FREEZE、CAPTURE、result。HttpSimulationIT在模拟与浏览器后再次SQL核对所有钱包、hold、流水、赢家扣款、请求拍卖关联与32字节Token摘要。浏览器新增第二场实际成交，故总CAPTURE预期从1改为2，原来唯一成交每场约束不变。

## 缺陷与本轮修复

1. App.vue旧请求可在退出后写回私有钱包；增加sessionEpoch拒绝旧响应，退出清理本应用状态及自身storage键；浏览器延迟私有响应跨登录验证，不用清空其他应用storage。
2. UI无出价历史展示；接入已有权威bids接口并展示，浏览器验证120记录。终态倒计时改为“已结束”。
3. OpenAPI多数200响应无结构；补身份、钱包/流水、拍卖/快照、出价/结果、Token与事件响应schema，HTTP读取实际文档验证。
4. 覆盖缺口：补真实1205锁超时后同request重试、1213死锁受害错误注入回滚重试（不是实际数据库死锁复现）、SETTLING取消拒绝、相邻价格HTTP并发、bid-only Agent读拒绝、用户切换、浏览器自动SOLD与钱包扣款。
5. 新浏览器测试本身第一次报Route is already handled：unroute早于延迟fulfill，保留完整失败日志，改为等待handled后移除，不降低断言。

## 未验证与范围

真实MySQL死锁形成过程未复现，已验证真实锁超时与1213错误重试分支；完整双实例容器网络分区、宿主机断电、大规模性能、生产TLS与账号引导未验证。本人独立设计决定不能由AI代签；早期不存在的全过程Git历史不能补造。线上部署未执行。

正式视频、本人现场讲解/临时修改、评测方外部提交均为用户明确OUT OF SCOPE，未执行；不据此宣称原题全部评分通过。原始历史报告保留，最新记录优先。

## 最终结果

2026-10-17 20:31:00+08:00完整最终回归退出0。后端单元4/4、真实MySQL集成21/21（AuctionIT14、DatabaseIT6、HttpSimulationIT1）、前端5/5，失败0、错误0、跳过0。模拟seed42、20用户、65断言，赢家24、成交370、PASS。运行时签发的临时会话和Agent凭据逐一检查后端日志及前端JS包，均未发现，不输出凭据值。

Edge浏览器三独立上下文：管理员创建/开始/取消、两用户加入/出价/历史、远端更新、断线恢复、取消释放、延迟旧钱包响应跨登录隔离、第二场自动SOLD、赢家余额890/冻结0、终态出价禁用，均通过，pageerror空。截图仍为取消场景，只作局部视觉证据，不冒称截图展示所有路径。

三个容器最终均healthy。数据库最终SQL对账通过，容器种子重启一致；原生3306仍PID8864。本轮未发现尚未修复的测试失败；第一次浏览器测试失败记录完整保留。自动化通过不等于生产完备或原始评测所有维度通过。

## 本轮修复远端核验完成

2026-10-17实际执行 `git -c credential.interactive=false push origin master` 退出0，d129508→af9f9a6。验收代码提交完整ID：af9f9a676c5cea3f0da130713ef3b1ffef3a3725。`git ls-remote origin refs/heads/master` 返回相同ID；独立克隆fetch退出0。

对独立远端克隆再次检查66个文件，11个关键源码/迁移/测试/验收报告blob与本地提交完全一致，禁止路径或日志数量0；证据.local/comprehensive-remote.json（不发布）。真实.env、.local、target/dist/node_modules和日志均不在远端。提交后安全扫描PASS：5个真实提交、95历史blob、42份本地日志；真实凭据无命中。报告更新另作真实文档提交，不改写上述验收代码提交，最新分支HEAD由git ls-remote核对。

最终测试日志SHA256：0B88285F45AFF6D4766063E653160D348A5E4EECA7A90635A7599FEC4307FEE3；浏览器日志SHA256：B50D00678D4F0D67E8D72BA11264EB7B1CD94DE453AEC59B8051EC7B892EF8E1；模拟日志SHA256：EA0F8369DB4F17EF4489624DEE24E8BFE41D51402AD0B9BFD8A361A9C8F3AF93。日志在本地保留，可重跑生成新结果，不把哈希当作永久运行保证。

最终分类：本地核心与容器自动化PASS，GitHub发布PASS；尚未验证的个人设计归属、全过程早期历史、真实死锁环、宿主机断电/双完整容器故障/大规模压力和线上部署如实保留。人工录屏、本人现场核验、外部提交为OUT OF SCOPE，未执行。
