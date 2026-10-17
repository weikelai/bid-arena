# Bid Arena 设计草案

状态：建议方案，尚无实现或运行验证。依据为《全栈评测-拍卖间.md》。目标是能解释、能对账的单体系统，优先保证 MySQL 内的业务事实与并发正确性。

## 1. 架构与边界

```text
Vue 3 + TypeScript + Vite（Pinia、浏览器）
                HTTP / WebSocket
Solon 3.x / Java 17 单体（可启动两个实例验证）
  HTTP契约 / 身份与权限 / 应用服务 / 事务仓储 / 扫描与事件发布
                MySQL 8 / InnoDB
竞拍 Agent → 独立 Bearer Token → 同一应用服务
```

Vue 负责展示、输入、连接状态、错误反馈、快照恢复；倒计时只用于展示，使用 serverTime 校准，不能本地确认赢家、价格或资金。Solon 负责身份、鉴权、服务端时间、业务规则、事务与事件。MySQL 是唯一事实来源；不以 JVM 锁、内存缓存或 WS 消息作为资金安全依据。不引入 Redis、消息队列或微服务。

Agent 仅通过公开 API 读取授权房间及出价，不能连接数据库、管理端或读取他人钱包。与真人共享业务服务，但认证凭据、权限与限流独立。部署采用 frontend 静态资源/反向代理、backend、mysql 三个 Compose 服务；反向代理支持 WS，开发期 Vite 代理保持同源。

后端建议模块：auth、agent、auction、wallet、realtime、jobs、persistence；控制器不编写资金 SQL，应用服务定义事务，仓储显式写锁与条件更新。Maven、Solon 精确版本、JDBC 池及事务插件需要通过小型真实数据库冒烟后锁定；推荐显式 JDBC SQL 配合 Solon 事务，不在设计阶段假定插件传播行为已经正确。

## 2. 数据模型与数据库约束

金额统一整数积分（Java long / MySQL BIGINT），API 拒绝小数、负数、字符串歧义及溢出；限制最大金额，计算差额用检查溢出的运算。ID、seq 在 JSON 中建议十进制字符串，避免 JS 超出安全整数。时间 UTC、微秒精度 DATETIME(6)，响应 RFC3339 UTC；明确 API 解析规则。

| 表 | 核心字段 | 约束 / 索引 |
|---|---|---|
| users | id,email,password_hash,role,status,kind,created_at | email唯一；role/status合法；密码用成熟自适应哈希库 |
| wallets | user_id,total_balance,frozen_balance,version | user_id主键外键；CHECK total>=0、frozen>=0、total>=frozen |
| auctions | id,status,start_price,current_price,min_increment,leader_id,end_at,extension_count,seq,version | CHECK价格/次数有效；索引(status,end_at,id)；初始current_price=100 |
| participants | auction_id,user_id,kind,joined_at | 主键(auction_id,user_id)；索引(user_id,auction_id) |
| auction_holds | auction_id,user_id,amount | 主键(auction_id,user_id)；CHECK amount>=0；索引(user_id,auction_id) |
| bid_requests | user_id,request_id,auction_id,payload_hash,result_code,response_json,received_at | UNIQUE(user_id,request_id)，明确按用户全局作用域；请求与响应字段有大小限制 |
| bids | id,auction_id,user_id,amount,request_id,seq,received_at,created_at | UNIQUE(user_id,request_id)；UNIQUE(auction_id,seq)；索引(auction_id,id) |
| wallet_entries | id,user_id,auction_id,request_id,effect_key,type,delta_total,delta_frozen,total_after,frozen_after,created_at | UNIQUE(effect_key)；索引(user_id,id)、(auction_id,id) |
| auction_results | auction_id,winner_id,price,reason,settled_at | auction_id主键；reason=SOLD/NO_BIDS/CANCELLED；无赢家price=0 |
| auction_events | auction_id,seq,type,server_time,visibility,user_id,payload,published_at | 主键(auction_id,seq)；索引(published_at,auction_id,seq) |
| agent_tokens | id,digest,user_id,expires_at,revoked_at,rate_limit | digest唯一；无明文列 |
| agent_token_scopes | token_id,auction_id,permission | 主键(token_id,auction_id,permission) |
| agent_rate_windows | token_id,window_start,request_count | 主键(token_id,window_start)；到期清理 |
| bid_inbox（见时间边界） | id,user_id,request_id,auction_id,received_at,payload,state | UNIQUE(user_id,request_id)；索引(auction_id,state,received_at,id) |

外键保证关联存在，不对历史流水做级联删除。CHECK 不能跨行证明“钱包冻结=持仓之和”，由统一事务写入口、条件更新和对账测试共同保证。MySQL 推荐固定8.0最新受支持补丁或明确8.x精确镜像版本并记录；CHECK需8.0.16以上。种子流水 INITIAL_CREDIT 的唯一 effect_key 防重，重启不得重置余额。

同场当前只保留领先者正冻结，其他持仓归零保留历史关系。钱包总冻结包括多场拍卖；必须分别存持仓，否则无法正确计算本场差额。无需维护可用余额冗余列，读取total-frozen。

## 3. 接收时间与截止边界：必须先验证的设计点

统一使用 MySQL UTC 时间，入口定义为**请求完成身份、格式验证后，进入数据库接收串行点的时刻**；不是客户端发送时间，也不是网关首次见到 TCP 字节的时刻。锁等待必须在协议中说明，不能偷偷用事务提交时间替换接收时间。评测对“服务端接收时间”的具体取样点未细化，这是 P0 待验证契约。

推荐先实现最小串行入口：出价及定时结算都先锁同一 auction 行，在获得锁后使用独立 SQL `UTC_TIMESTAMP(6)` 取一次 receivedAt / now（不能在等待锁的同一语句取时间）。在此入口定义下，now>=end_at 拒绝，now<end_at 才可能成交。这个方案简单且跨实例正确，但 HTTP 早到、排队到期后才拿锁的请求会被判迟到。若隐藏测试将 HTTP 入口时刻定义为接收时间，仅此方案不足，不能声称无条件符合评测。

为严格保留锁等待前的接收时间，建议在 P0 原型验证后采用 MySQL 持久接收队列：

1. 认证/格式验证完成后，短事务通过独立接收门锁（每场一行，`auction_intake`）登记 bid_inbox，记录数据库时间；不持有钱包锁，不等待主业务事务。接收门锁与拍卖主行分离。
2. 同场处理器在主 auction 行锁下按 received_at、inbox id 处理已登记请求。收到 HTTP 请求可同步驱动处理并短暂等待原结果；超时返回明确 PENDING，通过同 requestId 重试取得最终响应，不能误报成功。
3. 定时结算先获得接收门锁、再主 auction 行锁，固定此顺序；处理器只拿主行锁且不得反向获取门锁。结算拿到门锁后取 now、重读最新截止，先处理截止前已持久接收的所有请求；若合法出价延长截止则停止结算。处理期间门锁阻止新登记，以获得明确接收屏障。
4. 没有延长且 now>=最新end_at，完成结算；后续登记请求以登记时刻判断为迟到。服务重启继续处理 inbox。崩溃在接收前不算确认接收，接收后未响应可幂等恢复。

这个方案增加一张门表与队列表，但解决“早到请求尚在排队，结算却抢先完成”的跨实例问题。不依赖任意宽限秒数或单机内存队列。门锁等待前的 HTTP 到达时刻仍不是持久接收时刻；如果评测明确要求它，应重新评审入口模型，不能靠时钟伪造或补偿倒扣。最终实现只能选定一种明确契约，并通过边界/竞争测试证明，不能两套流程混用。当前建议把持久接收方案作为严格版本原型，不在本阶段假定已解决其吞吐与超时行为。

## 4. 事务与锁策略

隔离级别建议 READ COMMITTED；所有更新均基于主库读。核心按 auction 行悲观锁串行化同场操作；不同拍卖共享钱包时，锁全部受影响钱包，按user_id升序，随后按相同顺序锁持仓。统一顺序：接收门（需要时）→ auction → request/inbox → wallets升序 → holds升序 → 结果/流水/事件。不得有先锁钱包再锁拍卖的反向路径。限流事务独立完成，不能持Token锁进入业务事务。

死锁/锁超时会回滚整个事务；仅对可识别数据库瞬态错误做有限次数、短退避重试，保留同一requestId与持久receivedAt。业务失败不重试为另一条出价；重试耗尽返回可识别可重试错误。不得把唯一约束异常吞掉继续提交半笔事务。钱包更新额外使用 `WHERE frozen_balance + :delta <= total_balance` 等条件并检查影响行数。

### 成功出价（一个业务事务）

1. 锁auction与请求，重放已有幂等结果；状态必须RUNNING，receivedAt严格小于最新end_at，必须已加入，身份仍有效。
2. 校验 amount>=current_price+min_increment。无出价时current_price=100，所以首口最低110。
3. 获得新旧领先者钱包锁与本场持仓。新增冻结 `delta=amount-ownHold`，要求delta<=total-frozen；不能把待释放的他人资金算入本人的可用额。
4. 同人为领先者仅增冻delta；换人则释放旧hold、记录RELEASE，再冻新hold、记录FREEZE。每项变更记录delta_total、delta_frozen及变更后值。amount正向变更，无负差额路径。
5. 写bid与最新领先者/价格；若 `0<end_at-receivedAt<=5秒` 且次数<3，则 `end_at=end_at+10秒`、次数+1。
6. 为BID_ACCEPTED及可选AUCTION_EXTENDED各分配独立seq；插入事件、持久原响应与请求指纹，一起提交。广播由提交后发布器进行。

失败校验在任何资金修改之前完成，持久拒绝响应与可选本人BID_REJECTED事件；资金完全不变。异常发生在资金SQL后须整事务回滚，不能在事务里捕获后按业务拒绝正常提交。拒绝结果可以在回滚后的新事务持久化，但需同样的幂等竞争协调；基础设施异常不缓存成永久业务拒绝。

## 5. 幂等规则

主键作用域用户+requestId，全局对该用户唯一；指纹包含操作、auctionId、amount及必要请求参数。相同ID同参数返回原结果及replayed=true，不再次写bid、钱包流水或业务确认事件；相同ID异参数返回409 IDEMPOTENCY_CONFLICT。不同用户相同ID互不阻塞。requestId需限制长度/字符，不能在多个表采用不一致排序规则。

持久接收、处理中、成功、业务拒绝状态明确；数据库断连/进程崩溃由提交事实决定重试结果。失败请求同ID不会在余额补足后突然变成功，需新ID重提。重放原seq不分配新业务seq；外层HTTP响应区分“重放”与新服务端事件。

## 6. 自动结算、取消与恢复

定时扫描 `(status,end_at,id)` 索引，分批获取候选，再锁行重查最新截止，不信扫描结果。扫描间隔建议250~1000ms，具体延迟预算通过实测；启动立即恢复扫描。多实例可重复取候选，正确性依靠事务与约束，不依赖调度器唯一实例。

结算事务：处理截止前已接收请求（若采用队列）→重查到期→RUNNING转SETTLING→锁全部正持仓钱包→赢家 total减成交价、frozen减同额，CAPTURE流水（delta_total=-price,delta_frozen=-price）→释放其他正持仓→唯一结果→FINISHED→事件→提交。无人出价写NO_BIDS结果且price=0，不扣款。SETTLING在同事务内作为逻辑中间态，不承诺能从外部观察。正常崩溃只留下完整提交或全部回滚；若未来拆事务持久化SETTLING，必须先实现其恢复扫描，不能直接沿用本方案。

结果auction_id唯一；结算流水effect_key含auction/user/action唯一；拍卖终态重试只读现有结果。唯一约束是最后防线，不能用INSERT IGNORE掩盖账不平。DRAFT/RUNNING取消也在一个事务释放所有本场持仓，写CANCELLED结果及事件。SETTLING/FINISHED不得取消。取消与出价在同一行锁下决定先后，不撤销已成交结果。

## 7. 流水与对账

INITIAL_CREDIT(+1000,0)、FREEZE(0,+delta)、RELEASE(0,-hold)、CAPTURE(-price,-price)。effect_key用结构化确定键，如bid/request/user/freeze、settle/auction/user/capture，避免一请求释放旧用户及冻结新用户被错误去重。初始余额也有流水。

验证恒等式：钱包total=初始及全部delta_total之和；钱包frozen=全部delta_frozen之和=用户所有正持仓之和；total>=frozen>=0；终态该场全部hold=0；一场最多一个结果；赢家只扣一次成交额。流水是审计事实，不允许事后改流水掩盖错误。

## 8. 事件、快照与重连

事务内锁auction并增加seq，每条确认事件携带auctionId、seq、serverTime、type。拒绝、加入、开始、延长、取消、结束等同样有明确契约。重放与快照可携带已存在水位，不产生新业务事件；序号严格递增针对新事件，网络允许重复和乱序。

auction_events兼作MySQL事务发件箱。提交后发布失败只影响投递，不回滚资金。按单场seq发布；多实例用领取租约或条件更新协调，允许至少一次投递；发出后进程崩溃可能重发。WS连接在哪个实例，就由该实例轮询已提交事件并过滤订阅/权限，不能将某实例“已发送”误当所有实例连接都已收到。先用各实例按游标轮询的简单实现，发布标记只用于观测与清理，不能作为全局跳过投递依据。

客户端订阅后先缓冲事件，GET权威快照（短只读一致性事务，包含auction状态、参与者、当前seq、serverTime以及本人的钱包/持仓），丢弃<=快照seq的事件，再连续应用新事件。遇到缺口、乱序无法补齐或重连，重新获取快照，过期快照不得覆盖新seq。HTTP bid响应和WS事件按seq去重。

私有拒绝事件占用全场序号会使其他用户看到合法缺口，允许触发重拉，但不允许把他人私有payload广播出去；可向其他订阅者发送不含私密信息的水位事件。需通过测试选择一种策略。CONNECTION_STATE若仅本地提示，不伪装成服务端确认；若由服务端发送必须带上述四字段。快照seq是水位，即使重复获取也可相等，不要求每次读取递增。

## 9. Agent 与安全

Token使用密码学安全随机256bit以上，DB仅存SHA-256摘要（高熵随机Token无需密码式慢哈希）；只签发响应返回明文一次，列表/日志/异常/跟踪均遮蔽Authorization及签发响应。Bearer放header不放URL，WS用短期一次性票据或受保护认证握手，避免URL日志泄漏。

每请求校验Token摘要、所属用户状态、拍卖范围、read/bid权限、expires_at（now>=expiry无效）、吊销状态。列表也过滤范围；bids只暴露公开出价，钱包只允许本人。仅管理员签发/吊销；Token不具备users管理或管理员权限。加入权限需明确：建议auction:bid允许加入并出价，read仅查询，写进OpenAPI。

限流建议MySQL固定时间窗原子计数，按Token独立短事务，配置每分钟上限及429 Retry-After；多实例共享计数、重启不清零。固定窗边缘可突发两倍窗口额度，需在文档说明；若需平滑限流再实现令牌桶，不引入Redis。登录另设简单限流，不在日志输出密码。

## 10. 决策、代价与待验证事项

| 决策 | 理由 | 代价 / 验证 |
|---|---|---|
| MySQL行锁串行同场 | 易解释，数据库跨实例保证 | 热门房间吞吐受限；20人及跨场测试 |
| 钱包+本场hold | 支持跨拍卖余额和差额冻结 | 跨表不变量靠统一事务与对账 |
| 事务发件箱+快照 | 提交后崩溃可恢复，广播与资金分离 | 重复/乱序需客户端处理 |
| 单事务结算 | 崩溃不留下持久中间态 | 大量持仓锁时长；本题规模适合 |
| 不选Redis锁/内存唯一调度 | 减少双事实源与失效窗口 | MySQL承担调度与限流负载 |
| 不选乐观锁无限重试 | 简化资金、多表回滚解释 | 同场并行度降低 |

P0待验证：接收时间契约与持久入口原型、Solon事务确实覆盖全部仓储调用、真实MySQL回滚与死锁重试、并发结算和多场钱包锁。P1待验证：WS跨实例投递、私有事件序号、快照订阅竞态、Token安全与限流、Node/Vite版本兼容。以上均不能写成已有验证结果。
