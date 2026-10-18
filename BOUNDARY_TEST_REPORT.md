# 边界测试报告（2026-10-18）

本轮使用 Compose MySQL 8.4.8 的 3307 端口、随机 `bid_arena_it_*` 数据库和独立 Java 进程。测试身份、钱包及拍卖仅存在于隔离库，结束后由测试释放；本机 MySQL 3306、原演示库及历史流水未重置。原始依据为《全栈评测-拍卖间.md》；PDF、此前失败和历史验收记录保留。

## 可复现命令与证据

```powershell
docker compose config --quiet
docker compose build
docker compose up -d --wait
node scripts/compose-verify.mjs --integration
node scripts/verify-secrets.mjs
node scripts/audit-release.mjs
```

完整验证脚本先比较原库重启前后事实，再运行前端测试/生产构建、Maven 单元测试和真实 MySQL 集成测试；临时数据库账号仅有测试库前缀权限。`mvn -B -f backend/pom.xml verify -Pmysql-it` 需由脚本提供临时凭据，不应指向原库。HTTP、浏览器及压力子进程的实际退出码均由 JUnit 断言检查，未禁用测试。

本地证据保存在 `.local/boundary-20261018/`、`backend/target/*`，均不发布。最终计数与日志哈希见 TEST_EXECUTION_REPORT.md 最新附节；压力数据见 STRESS_TEST_REPORT.md。

## 覆盖映射

| 类别 | 实际测试与验证边界 |
|---|---|
| 状态机 | AuctionIT 的 rejectsAndIdempotencyPreserveMoney、settlingCannotCancelAndFinishedCannotBid；BoundaryIT 的 cancelledAndRepeatedTransitionsHaveNoExtraEffects、cancellationCompetesWithExpiredSettlement。校验拒绝、唯一结果、冻结及非法迁移；不只检查 HTTP 状态码。 |
| 金额 | exactFundsOneShortDifferentialAndInvalidMagnitude：100/109/110、差额10、跨场120+880恰好冻结1000、881不足1、1000全额及9万亿上限/越界/负数/零；原 AuctionIT 检验释放、扣款及共享钱包竞争。积分使用 BIGINT，无浮点账务。 |
| 截止 | receiptMicrosecondBeforeEqualAndAfterDeadline 将持久接收记录分别设为截止前1微秒/相等/后1微秒，实际数据库处理接受数1/0/0；intakeLockDelaysEligibilityUntilAfterDeadline 和原 durableReceiptSurvivesLockWaitAcrossDeadline 覆盖接收资格前/后跨截止锁等待。边界用数据库记录及锁构造，不靠人工点击。 |
| 接收时刻定义 | 在取得 auction_intake 行锁后，以数据库 UTC_TIMESTAMP(6) 写入 bid_requests.received_at；后续等待拍卖锁不改变该时间。不是 TCP 到达时刻，也不使用前端时钟。 |
| 幂等/并发 | concurrentDuplicateProducesOneBid、competingUsersAndSharedWallets、压力脚本同价/相邻价/同requestId并发、HTTP 同 Agent Token 12 请求。requestId 范围是用户级；不同载荷409，重复响应保留相同seq。 |
| 延时 | extendsThreeTimesAndStillAcceptsAtLimit、concurrentSnipesUseLatestDeadlineOnlyOnce、thirdExtensionRaceAndRollbackAreAtomic：以最新截止+10秒、最多3次、失败事务钱包/价格/截止均回滚；浏览器两个上下文核对同一新截止。 |
| SQL 对账 | 所有新增 BoundaryIT 测试结束核对余额=流水总和、冻结=流水冻结总和=有效hold、非负及重复CAPTURE；每档 StressIT 校验 pending=0、orphanBid=0、duplicateCapture=0。HTTP/浏览器库也直接SQL核对。 |
| 查询与旧响应 | 私有钱包同一 REPEATABLE READ 快照包含版本、余额、最近200条本人流水及hold；前端以用户、会话、房间代次和seq/version防覆盖。前端单元与Edge真实响应门控覆盖旧出价、旧快照、切房、退出换账号、终态后旧RUNNING。777余额是明确的测试替身，不是数据库篡改。 |
| 断线/同步 | Edge 独立上下文真实断网再恢复、最终赢家与他人不同文案、自动扣款和取消释放。实现是持久事件轮询，不宣称验证WebSocket。DB提交与客户端取事件分离，离线客户端不能回滚已提交交易。 |
| 自动结算 | 原 AuctionIT 覆盖事务写钱后异常/子进程halt73/新执行器恢复；moreThanOneScannerBatchAndConcurrentExecutors 创建105场空拍卖、3执行器重复扫描，每场仅一结果、无扣款。取消与到期结算并发仅一个结果。 |
| 真正锁故障 | realDeadlockCycleHasMysqlVictimThenOrderedLocksSucceed：真实两连接反序锁同两钱包，恰好一个1213受害者；随后统一升序两事务成功。retryAfterActualWalletLockTimeoutHasOneEffect 使用测试连接会话级1秒锁超时，得到真实1205，再恢复同requestId。未调整服务器全局锁超时。 |
| 注入与重试耗尽 | deadlockVictimRetryRollsBackBeforeOneAcceptedEffect 及 exhaustedInjectedRetriesLeaveRecoverableReceiptWithoutMoney 是明确注入1213，验证完整事务回滚和3次耗尽后PENDING可重试、一次记账；它们不冒充真实死锁受害业务事务的端到端重试。 |
| Agent | 20人模拟覆盖read/bid范围、越权403、过期/吊销401及限频429；http-boundaries 增加同Token并发幂等及10并发请求下3成功/7限流，测试Token均吊销或随隔离库清理。摘要长度SQL检查、动态Token日志/前端包匹配检查和全Git历史安全扫描。 |
| HTTP/安全 | http-boundaries 检查畸形JSON、数组/null、金额类型/越界、requestId长度/字符、时长溢出及SQL注入式登录拒绝；OpenAPI真实响应由simulate验证。Vue插值和参数化SQL作代码检查，不代表全参数穷举、完整渗透或所有XSS载荷已验证。 |

## 实际失败与修复

1. 首轮完整套件退出1：新浏览器测试用了不存在的中文演示拍品名，真实种子名称为 `Bid Arena Demo`。修正选择器，未删除断言；首轮日志保留。
2. 首轮200人出现连接池5秒等待超时，API500。保留连接数8，仅将池等待改为30秒；不改变事务/锁/余额规则。首轮失败不能被后续成功抹去，容量局限见压力报告。
3. 独立HTTP探针复现 `durationSeconds=2147483648` 导致整数转换异常并返回500（预期400）。修复为转换前验证1..86400，再转int；新增探针自动回归。

## 不宣称已经验证的事项

真实死锁环已复现，但真实死锁受害的应用交易自动重试链与故障注入覆盖不同；双完整容器网络分区、宿主机断电、长时间/多机大规模性能、生产TLS/管理员引导/登录防护、完整参数/CORS/渗透测试均 NOT VERIFIED。当前loopback演示环境的结果不构成生产SLA或绝对安全证明。正式录屏、本人现场讲解/修改及评测方外部提交 OUT OF SCOPE，未执行。

最终完整运行：2026-10-18 11:05:03+08:00退出0，4单元、32真实MySQL集成、7前端、49HTTP检查及65模拟断言通过；四档压力与SQL均通过。脱敏指标/日志哈希见docs/BOUNDARY_RUN_20261018.json。
