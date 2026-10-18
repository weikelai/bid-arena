# 最终风险闭环（2026-10-18）

本节为2026-10-18风险闭环最新状态，取代下方历史当前结论，但保留旧日志和失败。最终 `node scripts/compose-verify.mjs --integration` 退出0：后端4单元、36真实MySQL集成（AuctionIT15、BoundaryIT11、DatabaseIT7、HttpSimulationIT1、StabilityIT1、StressIT1），失败/错误/跳过0；前端7、HTTP49、模拟65断言、Edge多会话及四档压力通过。脱敏指标与原始日志哈希见docs/RISK_RUN_20261018.json。

## 真实死锁与重试

隔离MySQL两条真实连接：应用已冻结新领先者并释放旧领先者，另一连接持有probe并更新200行，再争用应用auction，形成真正死锁。驱动返回应用受害1213/40001，直接传播生产重试；未伪造异常。一次死锁后第二事务成功；三次真实死锁耗尽后资金仍是旧领先者110冻结，新用户0，价格110，持久PENDING1；正常tick无需客户端恢复，最终新用户120获胜、余额880，旧用户1000，冻结均0，2次独立出价/2次冻结/1释放/1扣款/1结果，重复requestId无额外效果。新逻辑连接、rollback及close均检查。生产正确锁序本身没有反序probe，此测试证明受害恢复，不证明正常负载自然出现死锁。

1213/1205最多三次，1062只在接收唯一键竞争阶段重试；处理资金阶段1062及1146不重试，业务拒绝也不重试。真实连接池测试持有8连接，观察waiting=1，实际等30秒得到SQLTransientConnectionException，超时计数+1；另验证测试账号不能读取mysql.user。

## 持续负载实测

| 用户 | 持续负载秒/总秒 | 请求/HTTP成功/业务拒绝 | HTTP错误/超时 | req/s | p50/p95/p99 ms | 采样池活动/等待峰值 | 获取连接count/总ms |
|---:|---|---|---|---:|---|---|---|
| 20 | 121.22/137.48 | 2408/2408/664 | 0/0 | 19.87 | 8.39/106.65/159.85 | 8/3 | 6287/23581.75 |
| 50 | 301.22/305.51 | 14239/14239/4798 | 0/0 | 47.27 | 7.35/240.25/355.76 | 8/40 | 36051/419245.19 |

| 用户 | Java RSS MiB / 单核CPU峰值% | MySQL CPU峰值% | MySQL全局行锁等待次数/ms增量 | 应用1213/1205/连接超时增量 | 房间/轮询恢复 |
|---:|---|---|---|---|---|
| 20 | 349.03/38.18 | 27.12 | 1124/15957 | 0/0/0 | 12/320 |
| 50 | 285.25/24.63 | 59.52 | 6483/103238 | 0/0/0 | 26/1900 |

仅20用户120秒、50用户300秒，有意限制共享开发机占用，不声称环境无法跑更久。准备账号/登录不计入负载，总秒含结算/最终采样；指标样本包含监控请求，实际请求计量窗口仅measuring阶段。接受响应包含幂等重放，业务拒绝是HTTP200子集，不与HTTP成功相加。两房间每轮20秒自动结算，轮询暂停/快照恢复不是网络分区，Edge另有真实断网验证。每5秒独立SQL对账，任意资金差异、重复扣款、后台退出、系统错误、连接超时、JVM堆>1GiB/RSS>2GiB或总时限触发即停止，不进入下一档。

采样池峰值不是连续极值；获取连接总耗时含Hikari开销。直方图差值、出价/结算耗时及CPU/内存采样见JSON。MySQL全局锁等待增量属于共享容器，不能全部归因本档。SHOW GLOBAL STATUS没有返回Innodb_deadlocks，不把缺失写成0；应用1213计数是真实SQLException计数。压力期间应用计数为0只说明该进程捕获数为0。

## 短时四档回归

| 用户 | 请求 | 错误/超时 | req/s | p95/p99 ms |
|---:|---:|---|---:|---|
| 20 | 181 | 0/0 | 94.94 | 366.43/434.18 |
| 50 | 451 | 0/0 | 100.31 | 1101.86/1448.16 |
| 100 | 901 | 0/0 | 110.46 | 1805.10/2567.18 |
| 200 | 1801 | 0/0 | 124.68 | 2836.45/4328.18 |

每档SQL inconsistent/pending/orphanBid/duplicateCapture均0；持续档资金总额/冻结/流水/hold一致，成交赢家/金额与CAPTURE一致。

## 命令与证据

最终完整回归于2026-10-18 11:45:28+08:00结束，Maven用时12分55秒。运行时三容器均healthy：前端127.0.0.1:5173、后端127.0.0.1:8080、MySQL127.0.0.1:3307；本机3306仍PID8864。

- docker compose config --quiet、build、up -d --wait、ps：均退出0；日志.local/risk-20261018/final-{config,build,up,ps}.log。
- node scripts/compose-verify.mjs --integration：退出0；.local/risk-20261018/final-run.log，target各子日志/报告；先前预备完整运行保留full-run.log和first-evidence。
- 首次定向真实MySQL边界：mvn verify -Pmysql-it -Dit.test=BoundaryIT（由临时授权包装器提供凭据）：退出0，11集成；targeted.log。后续增强为旧领先者释放/恢复场景，最终完整回归才是当前版本证据。
- node scripts/verify-secrets.mjs、node scripts/audit-release.mjs：发布前后执行；发布实际结果见GITHUB_RELEASE_REPORT最新节。
- node .local/risk-20261018/check-original.cjs：退出0，现有演示库只读资金核对inconsistent=0，完整SQL输出original-funds-sql.log；不修写历史账务。
- Invoke-RestMethod后端8080及代理5173健康接口均UP，代理OpenAPI包含新指标端点；证据health-openapi.json。docker compose logs --tail=100 mysql backend frontend退出0，证据final-container.log。
- node .local/risk-20261018/scan-evidence.cjs递归检查本轮及target的日志/JSON/XML等，退出0；93份文件、3项已知凭据来源、无命中。只作已知值及模式扫描，不作绝对安全保证。

短时四档脚本仍未采集其自身连接池等待，旧字段NOT INSTRUMENTED保留，不套用持续档的池指标。持续档另有实际池状态和直方图；两者不混淆。

## 安全与局限

管理员指标匿名401/普通用户403、外部Origin无允许跨域头及OPTIONS无允许跨域头均实际断言；原HTTP49/65模拟覆盖Agent权限/过期/吊销/限频、恶意参数/登录拒绝。SQL参数化、Vue插值无v-html/innerHTML、PBKDF2及生产禁演示种子作代码复核，不声称穷举XSS或全站CORS验证。凭据仅摘要，指标无动态标签/秘密。原库仅只读对账与种子重启比较，本机3306未改动。

NOT VERIFIED：建议的20用户10分钟、50用户30分钟、100用户60分钟及多机/生产容量；纯锁等待的逐请求归因；完整容器网络分区、宿主机断电、生产TLS/管理员安全引导/登录限流完善性、全面渗透、早期全过程Git历史及可选线上部署。OUT OF SCOPE：正式录屏、本人现场讲解/临时修改、评测方外部提交，均未执行。
