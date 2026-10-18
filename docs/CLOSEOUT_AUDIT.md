## 2026-10-18 用户版 README 发布（最新范围）

用户最新指示：停止继续安全排查，优先完成README并提交GitHub。README已完整改为普通用户教程，原开发/测试/运维全文迁至docs/DEVELOPMENT.md，实际按钮及链接检查通过；明确Agent需维护者启动、界面无吊销按钮、只有FINISHED成交结果确定赢家。

本轮实际完成前端7测试及类型/生产构建、Compose构建/健康/代理、TLS、隔离生产全生命周期与资金对账。首次完整回归：单元4通过、真实MySQL44中0断言失败/1连接重置错误/0跳过，退出1；其中HTTP49、模拟65、浏览器、四档压力及两档短时稳定性通过。POST请求体处理最小修正及连续20次拒绝响应针对性测试通过；最终完整复测运行到稳定性阶段，按用户新指示停止，状态NOT VERIFIED，不能宣称本轮全量全绿。

未继续闭合生产风险：MySQL镜像仍4严重/30高危，容器门禁FAIL，**不可公开上线**。没有把用户跳过的安全工作写为通过。公网资源等限制及已有真实失败保留，见docs/CLOSEOUT_AUDIT.md、docs/CLOSEOUT_EVIDENCE_20261018.json。正式录屏、本人现场讲解/修改及评测方外部提交OUT OF SCOPE。最终提交和远端核验另见GITHUB_RELEASE_REPORT.md。

---

# 最终收尾审计（2026-10-18，本轮）

基线：2ec3a01b02e32443fe9800709e2ee7ff5453e636。初始工作区干净、本地master等于远端；历史报告保留，本节与 CLOSEOUT_EVIDENCE_20261018.json 为本轮证据。最终发布提交另由 GITHUB_RELEASE_REPORT.md 和实际远端核验确定。首次全量真实退出1（44项中1连接重置错误），不算全绿；最终复测另列。

## 交付与风险

- PASS：README改为普通用户操作教程，原全文迁到 DEVELOPMENT.md；实际源码与浏览器流程核对登录、三栏、加入/出价、参与者、成交、钱包、管理员创建/启动/取消和Agent签发/隐藏。明确界面没有吊销按钮；需受控接口吊销，没有虚构自动启动服务。七项按钮名和本地文档链接检查退出0，公开演示凭据与DemoSeeder一致。
- PASS：生产数据库改为官方MySQL8.4.11同LTS补丁且固定镜像摘要；删除完整未使用mysql-shell管理客户端，保留官方gosu、mysql CLI、mysqld及入口。全新独立卷实际完成初始化、四次迁移、单次管理员引导、禁种子、精确Runtime权限、两个领先者释放/差额冻结/唯一自动扣款/取消释放、整组停止和重启、会话与数据保留、扫描器重复运行无重复成交。SQL差异0、重复结果0、成交1。
- FAIL：最终生产MySQL镜像仍60公告：4严重、30高危、24中、2低。原118不代表当前结果。后端37（22中/15低）；前端及入口各2（1中/1未分级）。容器审计退出1；Scout生成报告的退出0不能当安全通过。逐项包/范围/版本/修复/来源及适用性边界见 MYSQL_ADVISORY_REVIEW.md。
- NOT VERIFIED：gosu精确可达调用图、生产schema备份适配及保留/异地恢复、Windows ACL、旧权限自动收窄、生产定时资金核对、数据库TLS、精确可信代理客户端IP、全部构建层供应链。没有用上游“不调用则不适用”的说明把扫描改PASS。
- BLOCKED：公网域名、可信证书/续期、生产主机、异地存储和告警接收端缺真实资源；资源、模板、人工步骤见 PRODUCTION_RESOURCE_CHECKLIST.md。**不可公开上线。**
- OUT OF SCOPE：正式录屏、本人独立现场讲解/临时修改、评测方外部提交，均未执行。可选线上部署未执行，不虚构原始评测全通过。

## 实际命令与本轮证据

命令在仓库根目录执行；Windows会话只将已安装Docker Desktop resources/bin加入PATH，未改系统策略。所有原始日志在忽略目录，公开脱敏摘要和SHA256。

|命令|退出码/结果|日志|
|---|---|---|
|git status --short / git log --oneline -10 / git remote -v / git ls-remote origin refs/heads/master|0，初始干净且基线相同|会话实际输出；最终发布另列|
|docker compose config --quiet|0|closeout构建会话|
|docker compose build|0，前后端镜像构建|.local/closeout-compose-build.log|
|docker pull mysql:8.4.11|0，官方library/mysql|.local/closeout-mysql-pull.log|
|docker build -f deploy/Dockerfile.mysql -t bid-arena-mysql-production .|0，最终移除mysql-shell|.local/closeout-mysql-minimal-build.log|
|docker compose up -d --wait|0；发现仍引用旧镜像ID，未仅凭命令认定已部署|.local/closeout-compose-up.log|
|docker compose up -d --no-deps --force-recreate --wait backend frontend|0，仅替换应用容器，不动数据库|.local/closeout-compose-recreate.log|
|node scripts/compose-verify.mjs|0，代理/迁移/重启前后用户积分钱包拍卖事实一致|.local/closeout-deployment-final.log|
|npm --prefix frontend test|0，7通过，0失败|.local/closeout-frontend-test.log|
|npm --prefix frontend run build|0，TypeScript及Vite|.local/closeout-frontend-build.log|
|node scripts/test-isolated.mjs|结果见下方最终摘要；单元、真实MySQL、HTTP/浏览器/压力/稳定性在此运行|.local/closeout-regression-final.log|
|node scripts/test-local-tls.mjs|0，显式本地CA/hostname、未信任拒绝、安全头、实际代理|.local/closeout-tls.log|
|node scripts/test-production-compose.mjs|最终0，独立项目b248f68d1d，全新隔离卷，生命周期及SQL通过|.local/closeout-production-final.log；production-lifecycle-result.json|
|node scripts/audit-dependencies.mjs|0，41项OSV无命中|.local/closeout-dependencies.log|
|npm --prefix frontend audit --json|0，0漏洞|.local/closeout-npm-audit.json|
|node scripts/audit-containers.mjs|1，真实门禁FAIL|.local/closeout-container-published.log|
|node scripts/test-release-audit.mjs|0，UTF8/UTF16敏感模式阻断且不回显|.local/closeout-audit-probes.log|
|node scripts/verify-secrets.mjs|0|.local/closeout-verify-secrets.log|
|node scripts/audit-release.mjs|0，历史/工作区/忽略文本证据扫描；最终提交前再执行|.local/closeout-release-scan-pre.log|
|git diff --check|0|会话输出|

开发三容器最终healthy：127.0.0.1前端5173、后端8080、数据库3307。宿主3306 PID8864仍监听，本轮未连接/修改它的数据。生产测试数据库与后端不映射宿主端口；TLS测试随机loopback端口。生产测试项目停止并清其容器/网络，**保留命名卷和日志**。

## 实际失败与最小修复

官方8.4.11原镜像扫描88（4严重/45高/33中/6低）；OS补丁后83（4/38/31/6）；移除可选mysql-shell后60（4/30/24/2）。未对开发旧卷执行版本升级。

最终小镜像首次演练退出1：Docker `all predefined address pools have been fully subnetted`，未执行到初始化。保存 .local/closeout-production-minimal.log 及失败日志；仅回收本轮自己创建的已停止项目652cca9cef容器/网络，卷保留。演练脚本finally增加保存末200行日志及项目级down（无-v），防止反复测试耗尽地址池，随后完整复测退出0。未执行全局清理，也未删除其他项目网络。

MySQL生命周期日志确认mysqld为PID1，信号关闭后`Shutdown complete`，重启同卷8.4.11并保留账务；未绕过gosu身份切换。外部用户若依赖mysqlsh则该最小生产镜像不提供此管理工具，应单独部署并审计，而不是运行时补装。

首次完整回归 .local/closeout-regression.log：单元4通过，集成44中0断言失败/1错误/0跳过，SecurityHttpIT第41行读POST拒绝响应遇到HTTP/1.1 header parser received no bytes（Connection reset）。四档压力、持续两档、HTTP49/模拟65/浏览器等通过，但整次退出1。随后相同SecurityHttpIT单独运行退出0，故不能断言已确定底层网络根因。检查权限拒绝路径在读取POST体前返回，对未消费请求字节关闭连接有重置风险；最小修正是在路由先消费/缓存POST体，不改授权、资金事务或错误码，并新增连续20次权限拒绝的完整403/JSON断言，不增加请求重试、不吞掉IOException。针对性 .local/closeout-security-body-fix.log 退出0；最终全量重新运行及构建/生产演练分别保留closeout-regression-final.log、closeout-compose-final-build.log、closeout-production-final.log。该防御修正的通过不能证明所有客户端网络故障已被消除。

## 文件与依赖整理

未删除用户文档、原题、迁移、测试、Agent脚本、日志历史、数据库文件或数据卷。README原内容迁入 docs/DEVELOPMENT.md 并修正文档链接；新增逐项公告、资源清单、本审计和脱敏证据；更新生产Dockerfile及生产演练脚本、Agent操作契约和最新报告。没有删除应用依赖或无关重构；mysql-shell仅从新建生产镜像移除。保留其余不确定文件，不把.local、真实.env、备份、密钥、构建产物上传。
