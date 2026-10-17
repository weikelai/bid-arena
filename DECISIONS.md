# Bid Arena 技术决策

## 1. 显式 JDBC 单体事务

背景：钱包、持仓、价格和流水需要一个可核验的数据库提交点。候选为注解事务/ORM和显式 Connection。选择 `Database.transaction`，所有写入传递同一 Connection；拍卖先锁定，涉及的钱包按 user_id 升序锁定。代价是 SQL 和映射代码较多；避免依赖未验证的事务传播。验证：AuctionIT 的真实 MySQL 并发、共享钱包和故障回滚断言。

## 2. MySQL 持久接收门与请求记录

背景：截止前收到的请求可能等待拍卖锁，结算不能越过这些请求。候选为只在拿到拍卖锁后计时、JVM 队列、MySQL 持久接收。选择 auction_intake 行锁及 bid_requests PENDING 记录；先持久接收，再按 received_at/user_id/request_id 处理。结算先锁接收门再锁拍卖并清空已接收请求，重读最新截止时间。

接收时间契约：认证、格式校验完成，拿到数据库接收门后，以独立 SELECT UTC_TIMESTAMP(6) 取样；不是网络首字节或客户端时间。后续等待拍卖行、外键校验、钱包锁不改变该时间。若在接收门本身排队，到达时间按实际进入门的时间；这项边界公开记录，避免暗中使用提交时刻。代价是每场接收短事务串行；数据库故障时不确认接收。验证包含锁等待跨截止、等于截止拒绝、持久待处理记录恢复。

## 3. 事件拉取代替 WebSocket

原题允许等价实时方案。选择客户端每秒拉取 MySQL 已提交事件，seq 不连续、收到新事件、断线恢复时读取权威一致快照。没有进程内广播成功与数据库提交相耦合的问题，也不需要 Redis 或消息代理。代价是约 1 秒可见延迟和轮询负载；适合本题规模，不宣称已实现 WebSocket。auction_events.published_at 为预留字段，不作为已送达凭据。验证：20 人脚本检查持久事件，真实 Edge 浏览器检查另一会话价格更新及 offline/reconnect。

## 4. 不透明随机凭据

候选为自签 JWT 和数据库会话。选择 256 bit 随机 Bearer Token，数据库只存 SHA-256 摘要；真人会话 8 小时，Agent 独立表、范围、权限、过期、吊销、数据库分钟窗口限流。无需硬编码签名密钥；多实例和重启直接读库。代价是每次认证查库，过期记录尚需运维保留策略。Agent 不得访问真人列表、钱包和管理接口。验证：HTTP 模拟包含越权、缺权限、过期、吊销和超频。

## 5. 测试隔离

Compose MySQL 只映射 loopback:3307；原有 3306 完全独立。测试使用随机 bid_arena_it_<UUID> 数据库与临时账号，仅授予匹配测试库前缀的权限，结束删除自己创建的测试库和账号。没有 down -v、prune、重置或变更本机数据库。

## 2026-10-17 最终收尾最新状态（取代此前外部交付待办描述）

本轮实际重新执行 docker compose config --quiet、docker compose build、docker compose up -d --wait、node scripts/compose-verify.mjs --integration，全部退出0。完整回归结束20:16:12+08:00：后端单元4、真实MySQL集成18、前端5、20人模拟59项断言通过；Edge三上下文及SQL资金对账通过。新增独立auction-agent子进程真实出价110和取消后退出0，不再只是语法检查。历史57项是上一轮结果，予以保留。

种子重启快照一致：3用户、3条初始流水共3000、钱包各1000/0、演示DRAFT且end_at为空。测试仅使用容器3307随机隔离库，不修改本机3306。完整本地日志：.local/release-tests-final.log；构建及启动日志：.local/release-build.log、.local/release-up.log，均不发布。

状态分类：A PASS为上述本地核心、容器和自动化；GitHub发布以GITHUB_RELEASE_REPORT.md中实际推送和远端文件核验记录为准。B FAIL：最终回归无剩余失败，历史失败保留。C NOT VERIFIED：全过程开发历史、宿主机断电/大规模性能/双完整容器网络分区、可选线上部署。D BLOCKED仅用于实际外部阻塞，不把跳过人工环节视为阻塞。E OUT OF SCOPE：正式录屏、本人独立讲解/现场修改、评测方邮件/个人资料/外部提交，用户明确不要求本次交付，均未执行，不能宣称原始评测全部通过。

发布安全命令：node scripts/audit-release.mjs 与 node scripts/verify-secrets.mjs；扫描全部可达Git历史、跟踪文件及本地日志，不输出凭据值。真实.env、.local和日志截图不上传。HTTPS默认多账号凭据选择失败后选用现有weikelai GCM账号，dry-run通过；未要求提供Token或伪造历史。架构和已通过业务逻辑本轮未重构。

本节明确取代旧文档中“远端未授权”“独立Agent仅语法检查”“本人必须完成录屏/外部提交”的当前状态描述，旧文字保留作历史。AI完成本轮安全扫描、Agent脚本验收、自动化回归及发布整理，不代表本人独立设计能力已核验。仓库：https://github.com/weikelai/bid-arena 。